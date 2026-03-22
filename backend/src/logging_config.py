"""Terminal logging setup for the IFC Fix Agent."""

import logging
import os

from rich.console import Console
from rich.logging import RichHandler

from src.config import LOG_LEVEL

# Shared Rich console: colors when supported, respects NO_COLOR and TTY.
console = Console()


def configure_logging() -> None:
    """Configure root logging once (idempotent if handlers already exist)."""
    level = getattr(logging, LOG_LEVEL.upper(), logging.INFO)
    root = logging.getLogger()
    if not root.handlers:
        handler = RichHandler(
            console=console,
            show_time=True,
            show_path=False,
            rich_tracebacks=True,
            markup=False,
        )
        logging.basicConfig(
            level=level,
            format="%(message)s",
            datefmt="%H:%M:%S",
            handlers=[handler],
        )
    else:
        root.setLevel(level)

    for name in ("httpx", "httpcore", "openai"):
        logging.getLogger(name).setLevel(logging.WARNING)


def graph_debug_enabled() -> bool:
    """Whether to pass debug=True into LangGraph (extra node/transition prints)."""
    return os.getenv("IFC_AGENT_GRAPH_DEBUG", "").strip().lower() in ("1", "true", "yes")
