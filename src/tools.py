from langchain_core.tools import tool

from src.engine import ScriptEngine
from src.ifc_utils import run_ifctester

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
        code: Python code to execute. The `model` variable is pre-loaded.
    """
    result = _engine.run(code)
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

    _engine.save_model(_ifc_output_path)

    issues = run_ifctester(_ifc_output_path, _ids_path)
    if not issues:
        return "All specifications pass. No remaining issues."

    lines = [f"Remaining issues ({len(issues)}):"]
    for i, issue in enumerate(issues, 1):
        lines.append(f"\n{i}. {issue['title']}")
        if issue["description"]:
            lines.append(f"   {issue['description']}")
    return "\n".join(lines)


def get_tools() -> list:
    return [run_python_script, revalidate_ifc]
