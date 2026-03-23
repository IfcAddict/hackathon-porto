import os
from dotenv import load_dotenv

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Only `.env` at the repo root is loaded — not `.env.template` (that file is documentation only).
load_dotenv(os.path.join(_ROOT, ".env"))

# OpenAI (https://platform.openai.com/) — when set, the agent uses ChatOpenAI instead of Groq.
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
_DEFAULT_OPENAI_MODEL = "gpt-5.4-mini"
OPENAI_MODEL = (os.getenv("OPENAI_MODEL") or _DEFAULT_OPENAI_MODEL).strip()
# Summarizes tool rounds when the main request hits context / payload limits.
OPENAI_COMPACT_MODEL = (os.getenv("OPENAI_COMPACT_MODEL") or OPENAI_MODEL).strip()
# Responses API reasoning effort (e.g. none, low, medium, high, xhigh) — see OpenAI reasoning docs.
OPENAI_REASONING_EFFORT = (os.getenv("OPENAI_REASONING_EFFORT") or "xhigh").strip()

# Groq (https://console.groq.com/docs)
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile").strip()
# Model for summarizing tool outputs when the main request hits TPM / payload limits (HTTP 413).
GROQ_COMPACT_MODEL = (os.getenv("GROQ_COMPACT_MODEL") or "moonshotai/kimi-k2-instruct-0905").strip()
GROQ_CONTEXT_COMPACT_MAX_PASSES = int(
    (os.getenv("GROQ_CONTEXT_COMPACT_MAX_PASSES") or "5").strip() or "5"
)
# Re-invoke the compact model when its reply is not valid JSON (array of N strings).
GROQ_COMPACT_PARSE_RETRIES = int((os.getenv("GROQ_COMPACT_PARSE_RETRIES") or "3").strip() or "3")
# Groq 429 handling (https://console.groq.com/docs/rate-limits)
GROQ_429_MAX_RETRIES = int((os.getenv("GROQ_429_MAX_RETRIES") or "64").strip() or "64")
GROQ_429_MAX_SLEEP_SEC = float((os.getenv("GROQ_429_MAX_SLEEP_SEC") or "600").strip() or "600")
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
RSC_DIR = os.path.join(_ROOT, "rsc")
OUTPUT_DIR = os.path.join(_ROOT, "output")

# WebSocket session server (see src.server)
IFC_AGENT_WS_HOST = (os.getenv("IFC_AGENT_WS_HOST") or "127.0.0.1").strip()
IFC_AGENT_WS_PORT = int((os.getenv("IFC_AGENT_WS_PORT") or "8765").strip() or "8765")


def _env_truthy(val: str | None) -> bool:
    if not val:
        return False
    return val.strip().lower() in ("1", "true", "yes", "on")


# Skip Groq: reuse IFC + *_issues.json already under output/ (see src.server sample session).
IFC_AGENT_SAMPLE_MODE = _env_truthy(os.getenv("IFC_AGENT_SAMPLE_MODE"))
IFC_AGENT_SAMPLE_OUTPUT_IFC_BASENAME = (
    os.getenv("IFC_AGENT_SAMPLE_OUTPUT_IFC_BASENAME")
    or "ARK_NordicLCA_Housing_Timber_As-built_Archicad.ifc"
).strip()

MAX_OUTPUT_CHARS = 10_000

# buildingSMART Data Dictionary — https://github.com/buildingSMART/bSDD/blob/master/Documentation/bSDD%20API.md
BSDD_REST_BASE = (os.getenv("BSDD_REST_BASE") or "https://api.bsdd.buildingsmart.org").strip()
# GraphQL carries property metadata including allowedValues (see bSDD GraphQL docs).
# Default is the public test endpoint; production GraphQL requires auth (set URL + token when available).
BSDD_GRAPHQL_URL = (os.getenv("BSDD_GRAPHQL_URL") or "https://test.bsdd.buildingsmart.org/graphql/").strip()
BSDD_TOOL_MAX_CHARS = int((os.getenv("BSDD_TOOL_MAX_CHARS") or "16000").strip() or "16000")
