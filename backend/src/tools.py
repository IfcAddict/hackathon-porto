import logging
import threading

from langchain_core.tools import tool

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


def get_tools() -> list:
    return [run_python_script, revalidate_ifc]
