import os
from dotenv import load_dotenv

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Only `.env` at the repo root is loaded — not `.env.template` (that file is documentation only).
load_dotenv(os.path.join(_ROOT, ".env"))

# Groq (https://console.groq.com/docs)
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile").strip()
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
RSC_DIR = os.path.join(_ROOT, "rsc")
OUTPUT_DIR = os.path.join(_ROOT, "output")

MAX_OUTPUT_CHARS = 10_000
