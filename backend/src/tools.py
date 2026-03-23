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

# Cap batch bSDD class fetches per tool call (latency + output size).
_BSDD_CLASS_BATCH_PAGE_SIZE_MAX = 50

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


def _normalize_str_list(value: object) -> list[str]:
    """Coerce tool args to a list of non-empty strings (handles str or JSON-array str)."""
    if value is None:
        return []
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return []
        if s.startswith("["):
            try:
                parsed = json.loads(s)
            except json.JSONDecodeError:
                return [s]
            if isinstance(parsed, list):
                return [str(x).strip() for x in parsed if str(x).strip()]
            return [s]
        return [s]
    if isinstance(value, list):
        return [str(x).strip() for x in value if x is not None and str(x).strip()]
    return []


def _parse_positive_int(value: object, default: int, *, minimum: int = 1, maximum: int | None = None) -> int:
    try:
        n = int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default
    n = max(minimum, n)
    if maximum is not None:
        n = min(n, maximum)
    return n


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
    dictionary_uri: str = DEFAULT_IFC_43_DICTIONARY_URI,
    reference_codes: list[str] | None = None,
    class_uris: list[str] | None = None,
    page: int = 1,
    page_size: int = 10,
) -> str:
    """Fetch bSDD class(es) (e.g. IfcWall, Pset_WallCommon) via the public REST Class API.

    Returns hierarchy, definition, and metadata. It does not include property lists;
    use `bsdd_lookup_dictionary` for properties and allowed enumeration values.

    Pass one or both lists (use a one-element list for a single class). Order: every
    `class_uris` entry first, then every `reference_codes` entry (resolved with
    `dictionary_uri`). Pagination: `page`, `page_size` (1–50, default 10). Each response
    includes `invalid_references` for items **on this page** that failed.

    Args:
        dictionary_uri: Dictionary URI for resolving codes (default: IFC 4.3).
        reference_codes: Class codes such as `IfcWall` or `Pset_DoorCommon`.
        class_uris: Full class URIs (optional second list, processed before codes).
        page: 1-based page index.
        page_size: Items per page (1–50, default 10).
    """
    d_uri = (dictionary_uri or "").strip() or DEFAULT_IFC_43_DICTIONARY_URI
    codes_list = _normalize_str_list(reference_codes)
    uris_list = _normalize_str_list(class_uris)

    log.info(
        "bsdd_get_class n_codes=%d n_uris=%d dict=%r page=%r size=%r",
        len(codes_list),
        len(uris_list),
        d_uri,
        page,
        page_size,
    )

    work: list[dict[str, str]] = []
    for u in uris_list:
        work.append({"kind": "uri", "input": u, "uri": u})
    for c in codes_list:
        if not c.strip():
            continue
        work.append(
            {"kind": "code", "input": c, "uri": class_uri_from_reference(d_uri, c)}
        )

    if not work:
        return "Provide non-empty `reference_codes` and/or `class_uris` (one element is enough)."

    p = _parse_positive_int(page, 1, minimum=1)
    ps = _parse_positive_int(
        page_size, 10, minimum=1, maximum=_BSDD_CLASS_BATCH_PAGE_SIZE_MAX
    )
    total = len(work)
    start = (p - 1) * ps
    slice_ = work[start : start + ps]

    classes: list[dict] = []
    invalid: list[dict[str, str]] = []
    for item in slice_:
        try:
            data = rest_get_class(BSDD_REST_BASE, item["uri"])
        except RuntimeError as e:
            invalid.append(
                {
                    "input": item["input"],
                    "kind": item["kind"],
                    "error": str(e),
                }
            )
            continue
        if isinstance(data, dict):
            data = {**data, "_requested_input": item["input"], "_requested_kind": item["kind"]}
        classes.append(data)

    payload = {
        "dictionary_uri": d_uri,
        "total_items": total,
        "page": p,
        "page_size": ps,
        "has_more": start + len(slice_) < total,
        "invalid_references": invalid,
        "classes": classes,
    }
    return _truncate_bsdd_json(payload)


@tool
def bsdd_lookup_dictionary(
    class_reference_codes: list[str] | None = None,
    search_text: str = "",
    dictionary_uri: str = DEFAULT_IFC_43_DICTIONARY_URI,
    language_code: str = "EN",
    max_results: int = 12,
    result_offset: int = 0,
    page: int = 1,
    page_size: int = 10,
) -> str:
    """Look up bSDD classes with properties and `allowedValues` (enumerations) via GraphQL.

    For known codes, pass `class_reference_codes` (use a one-element list for one class).
    Use `page` / `page_size` (1–50) to page through that list. Each response includes
    `invalid_references` for codes on **this page** that are missing or errored.

    Use `search_text` to explore when you do not know the exact code (can return many hits).

    GraphQL is optional: set `BSDD_GRAPHQL_URL` in `.env`, or leave the default (bSDD test
    server). IFC attribute enums may not appear here; combine with schema / ifcopenshell
    when bSDD has no `allowedValues` for a property.

    For `search_text` mode only: the bSDD GraphQL API does not expose server-side paging
    on `classSearch`, so each call still downloads the full match list; results are then
    sliced to `[result_offset : result_offset + max_results]`. Check `dictionary._pagination`
    for `has_more` and increase `result_offset` to read the next window (same `search_text`).

    Args:
        class_reference_codes: Exact class codes in the dictionary (e.g. `["Pset_WallCommon"]`).
        search_text: Fuzzy class search within the dictionary.
        dictionary_uri: Dictionary URI (default: IFC 4.3).
        language_code: Language for search labels (e.g. EN).
        max_results: Page size for `search_text` mode (1–50).
        result_offset: 0-based offset into the API's class list (`search_text` only).
        page: 1-based page index for `class_reference_codes` mode only.
        page_size: Items per page when using `class_reference_codes` (1–50, default 10).
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

    codes_batch = _normalize_str_list(class_reference_codes)
    by_code = bool(codes_batch)

    log.info(
        "bsdd_lookup_dictionary codes_n=%r search=%r dict=%r offset=%r max=%r page=%r psize=%r",
        len(codes_batch),
        search_text,
        d_uri,
        off,
        max_r,
        page,
        page_size,
    )

    try:
        if by_code:
            work = codes_batch
            if not work:
                return "Provide non-empty `class_reference_codes` or use `search_text`."

            p = _parse_positive_int(page, 1, minimum=1)
            ps = _parse_positive_int(
                page_size, 10, minimum=1, maximum=_BSDD_CLASS_BATCH_PAGE_SIZE_MAX
            )
            total = len(work)
            start = (p - 1) * ps
            slice_codes = work[start : start + ps]

            results: list[dict] = []
            invalid: list[dict[str, str]] = []
            for code in slice_codes:
                c_uri = class_uri_from_reference(d_uri, code)
                try:
                    payload = graphql_class_detail(
                        gql_url,
                        dictionary_uri=d_uri,
                        class_uri=c_uri,
                    )
                except RuntimeError as e:
                    invalid.append({"class_reference_code": code, "error": str(e)})
                    continue
                dictionary = payload.get("dictionary") if isinstance(payload, dict) else None
                cls_obj = (
                    (dictionary or {}).get("class") if isinstance(dictionary, dict) else None
                )
                if cls_obj is None:
                    invalid.append(
                        {
                            "class_reference_code": code,
                            "error": "Class not found or empty in GraphQL response.",
                        }
                    )
                    continue
                if isinstance(payload, dict):
                    payload = {
                        **payload,
                        "_requested_class_reference_code": code,
                    }
                results.append(payload)

            payload = {
                "dictionary_uri": d_uri,
                "total_items": total,
                "page": p,
                "page_size": ps,
                "has_more": start + len(slice_codes) < total,
                "invalid_references": invalid,
                "results": results,
            }
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
            return "Provide non-empty `class_reference_codes` or `search_text`."
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
