import os
from dotenv import load_dotenv

load_dotenv()

LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:11434/v1")
LLM_MODEL = os.getenv("LLM_MODEL", "gemma3:1b")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RSC_DIR = os.path.join(_ROOT, "rsc")
OUTPUT_DIR = os.path.join(_ROOT, "output")

MAX_OUTPUT_CHARS = 10_000
