import os
from dotenv import load_dotenv

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Only `.env` at the repo root is loaded — not `.env.template` (that file is documentation only).
load_dotenv(os.path.join(_ROOT, ".env"))

# Groq (https://console.groq.com/docs)
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile").strip()
# Groq 429 handling (https://console.groq.com/docs/rate-limits)
GROQ_429_MAX_RETRIES = int((os.getenv("GROQ_429_MAX_RETRIES") or "64").strip() or "64")
GROQ_429_MAX_SLEEP_SEC = float((os.getenv("GROQ_429_MAX_SLEEP_SEC") or "600").strip() or "600")
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
RSC_DIR = os.path.join(_ROOT, "rsc")
OUTPUT_DIR = os.path.join(_ROOT, "output")

MAX_OUTPUT_CHARS = 10_000

# buildingSMART Data Dictionary — https://github.com/buildingSMART/bSDD/blob/master/Documentation/bSDD%20API.md
BSDD_REST_BASE = (os.getenv("BSDD_REST_BASE") or "https://api.bsdd.buildingsmart.org").strip()
# GraphQL carries property metadata including allowedValues (see bSDD GraphQL docs).
# Default is the public test endpoint; production GraphQL requires auth (set URL + token when available).
BSDD_GRAPHQL_URL = (os.getenv("BSDD_GRAPHQL_URL") or "https://test.bsdd.buildingsmart.org/graphql/").strip()
BSDD_TOOL_MAX_CHARS = int((os.getenv("BSDD_TOOL_MAX_CHARS") or "16000").strip() or "16000")
