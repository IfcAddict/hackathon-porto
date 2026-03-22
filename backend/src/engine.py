import io
import traceback
import contextlib

import ifcopenshell

from src.config import MAX_OUTPUT_CHARS

TRUNCATION_MESSAGE = (
    "OUTPUT TRUNCATED (exceeded {limit} chars). "
    "Re-run your script but produce a more compact summary of the results."
)


class ScriptEngine:
    """Executes agent-generated Python code with a pre-loaded IFC model.

    The IFC model is loaded once on init and shared across all run() calls
    within the same session. The agent's code runs via exec() in a persistent
    namespace so mutations to `model` accumulate.
    """

    def __init__(self, ifc_path: str):
        self.ifc_path = ifc_path
        self.model = ifcopenshell.open(ifc_path)
        self._namespace = {"model": self.model, "ifcopenshell": ifcopenshell}

    def run(self, code: str) -> dict:
        """Execute agent-generated Python code in the shared namespace.

        Returns dict with 'stdout' and 'stderr' keys. If combined output
        exceeds MAX_OUTPUT_CHARS, both are replaced with a truncation message.
        """
        stdout_buf = io.StringIO()
        stderr_buf = io.StringIO()

        try:
            with contextlib.redirect_stdout(stdout_buf), contextlib.redirect_stderr(stderr_buf):
                exec(code, self._namespace)
        except Exception:
            stderr_buf.write(traceback.format_exc())

        stdout = stdout_buf.getvalue()
        stderr = stderr_buf.getvalue()

        if len(stdout) + len(stderr) > MAX_OUTPUT_CHARS:
            msg = TRUNCATION_MESSAGE.format(limit=MAX_OUTPUT_CHARS)
            return {"stdout": msg, "stderr": ""}

        return {"stdout": stdout, "stderr": stderr}

    def save_model(self, output_path: str):
        self.model.write(output_path)
