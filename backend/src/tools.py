import json
import logging
import threading

from langchain_core.tools import tool

from src.bsdd_client import (
    DEFAULT_IFC_43_DICTIONARY_URI,
    class_uri_from_reference,
    graphql_class_detail,
    graphql_class_search,
    rest_get_class,
    rest_list_dictionaries,
)
from src.config import BSDD_GRAPHQL_URL, BSDD_REST_BASE, BSDD_TOOL_MAX_CHARS
from src.engine import ScriptEngine
from src.ifc_utils import run_ifctester
from src.issue_summary import summarize_issues_for_agent
from src.logging_config import console
from src.prompts import format_issues_for_agent_message

log = logging.getLogger("ifc_agent.tools")

# LangGraph's ToolNode runs multiple tool calls in parallel by default; the IFC engine
# and exec() namespace are not thread-safe. A lock keeps mutations and save/revalidate
# exclusive even if concurrency is misconfigured.
_engine_lock = threading.RLock()

_engine: ScriptEngine | None = None
_ids_path: str | None = None
_ifc_output_path: str | None = None


def init_tools(engine: ScriptEngine, ifc_output_path: str, ids_path: str | None = None):
    """Initialize the tool closures with a live engine instance."""
    global _engine, _ids_path, _ifc_output_path
    _engine = engine
    _ids_path = ids_path
    _ifc_output_path = ifc_output_path


@tool
def run_python_script(code: str) -> str:
    """Execute a Python script with access to the IFC model.

    The variable `model` is an already-loaded ifcopenshell model object.
    The `ifcopenshell` module is also available.
    Use print() to output results. Both stdout and stderr are returned.

    Args:
        code: Multi-line Python executed with exec(). `for` / `if` / `while` / `def` /
            `try` / `with` must start on their own line (not after `;` on the same line
            as other statements — that raises SyntaxError). The `model` variable is pre-loaded.
    """
    log.info("run_python_script: executing (%d chars of code)", len(code))
    log.debug("run_python_script code:\n%s", code)
    with _engine_lock:
        with console.status(
            "[cyan]Running Python script against the IFC model…[/] "
            "[dim](large models can take a while)[/]"
        ):
            result = _engine.run(code)
    log.info(
        "run_python_script: finished (stdout %d chars, stderr %d chars)",
        len(result["stdout"]),
        len(result["stderr"]),
    )
    parts = []
    if result["stdout"]:
        parts.append(result["stdout"])
    if result["stderr"]:
        parts.append(f"STDERR:\n{result['stderr']}")
    return "\n".join(parts) if parts else "(no output)"


@tool
def revalidate_ifc() -> str:
    """Save the current IFC model and re-run ifctester validation against the IDS.

    Returns the list of remaining issues, or a success message if all pass.
    """
    if _ids_path is None:
        return "No IDS file available for re-validation."

    log.info("revalidate_ifc: saving model and running IDS check")
    with _engine_lock:
        with console.status(
            "[yellow]Writing IFC to disk…[/] "
            "[dim](very large files can take several minutes)[/]",
            spinner="dots",
        ) as status:
            _engine.save_model(_ifc_output_path)
            log.info("revalidate_ifc: file written, starting IDS validation")
            status.update(
                "[yellow]Running IDS validation…[/] "
                "[dim](reloading IFC + checking specs; can take several minutes)[/]"
            )
            raw_issues = run_ifctester(_ifc_output_path, _ids_path)
    summarized, merged_verbose = summarize_issues_for_agent(raw_issues)
    log.info(
        "revalidate_ifc: IDS finished — %d raw row(s) → %d agent group(s)",
        len(raw_issues),
        len(summarized),
    )
    if not summarized:
        return "All specifications pass. No remaining issues."

    return format_issues_for_agent_message(
        summarized,
        intro_heading=(
            f"IDS re-validation: **{len(summarized)}** issue group(s) remain "
            f"(from {len(raw_issues)} raw report row(s)):"
        ),
        closing=(
            "Continue fixing with run_python_script where needed, then call revalidate_ifc again "
            "to check progress."
        ),
        summarized_element_rows=merged_verbose if merged_verbose > 0 else None,
    )


def _truncate_bsdd_json(payload: dict | list) -> str:
    text = json.dumps(payload, indent=2, ensure_ascii=False)
    if len(text) <= BSDD_TOOL_MAX_CHARS:
        return text
    return (
        text[: BSDD_TOOL_MAX_CHARS]
        + f"\n\n... [truncated: {len(text)} chars total, cap {BSDD_TOOL_MAX_CHARS}]"
    )


@tool
def bsdd_list_dictionaries(
    filter_substring: str = "",
    page: int = 1,
    page_size: int = 50,
) -> str:
    """List buildingSMART Data Dictionary (bSDD) standards you can query.

    Use this to discover `dictionary_uri` values for other standards (ETIM, etc.).
    For typical IFC 4.3 work you can skip this and use the default dictionary URI.

    The REST API returns all dictionaries in one response; paging is applied locally
    after optional filtering.

    Args:
        filter_substring: Optional case-insensitive filter matched against dictionary
            code, name, or URI (empty returns all).
        page: 1-based page index.
        page_size: Rows per page (1–100, default 50).
    """
    log.info("bsdd_list_dictionaries filter=%r page=%r page_size=%r", filter_substring, page, page_size)
    try:
        rows = rest_list_dictionaries(BSDD_REST_BASE)
    except RuntimeError as e:
        return f"bSDD error: {e}"

    slim = [
        {
            "code": d.get("code"),
            "name": d.get("name"),
            "version": d.get("version"),
            "uri": d.get("uri"),
            "isLatestVersion": d.get("isLatestVersion"),
        }
        for d in rows
        if isinstance(d, dict)
    ]
    q = (filter_substring or "").strip().lower()
    if q:
        slim = [
            d
            for d in slim
            if q in str(d.get("code", "")).lower()
            or q in str(d.get("name", "")).lower()
            or q in str(d.get("uri", "")).lower()
        ]
    total = len(slim)
    try:
        p = max(1, int(page or 1))
    except (TypeError, ValueError):
        p = 1
    try:
        ps = max(1, min(int(page_size or 50), 100))
    except (TypeError, ValueError):
        ps = 50
    start = (p - 1) * ps
    page_rows = slim[start : start + ps]
    payload = {
        "total": total,
        "page": p,
        "page_size": ps,
        "has_more": start + len(page_rows) < total,
        "dictionaries": page_rows,
    }
    return _truncate_bsdd_json(payload)


@tool
def bsdd_get_class(
    reference_code: str = "",
    dictionary_uri: str = DEFAULT_IFC_43_DICTIONARY_URI,
    class_uri: str = "",
) -> str:
    """Fetch one bSDD class (e.g. IfcWall, Pset_WallCommon) via the public REST Class API.

    Returns hierarchy, definition, and metadata. It does not include property lists;
    use `bsdd_lookup_dictionary` for properties and allowed enumeration values.

    Args:
        reference_code: bSDD class code such as `IfcWall` or `Pset_DoorCommon`.
        dictionary_uri: Dictionary URI (default: IFC 4.3).
        class_uri: Full class URI if you already have it; when set, reference_code
            and dictionary_uri are ignored.
    """
    log.info(
        "bsdd_get_class reference_code=%r dictionary_uri=%r class_uri=%r",
        reference_code,
        dictionary_uri,
        class_uri,
    )
    uri = (class_uri or "").strip()
    if not uri:
        code = (reference_code or "").strip()
        if not code:
            return "Provide either `class_uri` or `reference_code`."
        uri = class_uri_from_reference(dictionary_uri.strip() or DEFAULT_IFC_43_DICTIONARY_URI, code)
    try:
        data = rest_get_class(BSDD_REST_BASE, uri)
    except RuntimeError as e:
        return f"bSDD error: {e}"
    return _truncate_bsdd_json(data)


@tool
def bsdd_lookup_dictionary(
    class_reference_code: str = "",
    search_text: str = "",
    dictionary_uri: str = DEFAULT_IFC_43_DICTIONARY_URI,
    language_code: str = "EN",
    max_results: int = 12,
    result_offset: int = 0,
) -> str:
    """Look up bSDD classes with properties and `allowedValues` (enumerations) via GraphQL.

    Prefer `class_reference_code` for a precise lookup (e.g. `Pset_WallCommon`).
    Use `search_text` to explore when you do not know the exact code (can return many hits).

    GraphQL is optional: set `BSDD_GRAPHQL_URL` in `.env`, or leave the default (bSDD test
    server). IFC attribute enums may not appear here; combine with schema / ifcopenshell
    when bSDD has no `allowedValues` for a property.

    For `search_text` mode only: the bSDD GraphQL API does not expose server-side paging
    on `classSearch`, so each call still downloads the full match list; results are then
    sliced to `[result_offset : result_offset + max_results]`. Check `dictionary._pagination`
    for `has_more` and increase `result_offset` to read the next window (same `search_text`).

    Args:
        class_reference_code: Exact class code in the dictionary (recommended).
        search_text: Fuzzy class search within the dictionary.
        dictionary_uri: Dictionary URI (default: IFC 4.3).
        language_code: Language for search labels (e.g. EN).
        max_results: Page size for `search_text` mode (1–50).
        result_offset: 0-based offset into the API's class list (`search_text` only).
    """
    if not (BSDD_GRAPHQL_URL or "").strip():
        return (
            "bSDD GraphQL is disabled (BSDD_GRAPHQL_URL empty). "
            "Use bsdd_get_class for REST metadata, or enable GraphQL in .env."
        )
    d_uri = (dictionary_uri or "").strip() or DEFAULT_IFC_43_DICTIONARY_URI
    gql_url = BSDD_GRAPHQL_URL.strip()
    try:
        max_r = max(1, min(int(max_results or 12), 50))
    except (TypeError, ValueError):
        max_r = 12
    try:
        off = max(0, int(result_offset or 0))
    except (TypeError, ValueError):
        off = 0

    log.info(
        "bsdd_lookup_dictionary class=%r search=%r dict=%r offset=%r max=%r",
        class_reference_code,
        search_text,
        d_uri,
        off,
        max_r,
    )

    try:
        if (class_reference_code or "").strip():
            c_uri = class_uri_from_reference(d_uri, class_reference_code.strip())
            payload = graphql_class_detail(
                gql_url,
                dictionary_uri=d_uri,
                class_uri=c_uri,
            )
        elif (search_text or "").strip():
            payload = graphql_class_search(
                gql_url,
                dictionary_uri=d_uri,
                search_text=search_text.strip(),
                language_code=(language_code or "EN").strip() or "EN",
                offset=off,
                limit=max_r,
            )
        else:
            return "Provide either `class_reference_code` or `search_text`."
    except RuntimeError as e:
        return f"bSDD error: {e}"

    return _truncate_bsdd_json(payload)


def get_tools() -> list:
    return [
        run_python_script,
        revalidate_ifc,
        bsdd_list_dictionaries,
        bsdd_get_class,
        bsdd_lookup_dictionary,
    ]
