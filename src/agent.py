import json
import logging
from typing import Any

from langchain.agents import create_agent
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_groq import ChatGroq
from rich.panel import Panel
from rich.syntax import Syntax

from src.config import GROQ_API_KEY, GROQ_MODEL
from src.logging_config import console, graph_debug_enabled
from src.tools import get_tools
from src.prompts import SYSTEM_PROMPT

logger = logging.getLogger("ifc_agent")

# Log at most this many characters per tool result / assistant blob (rest truncated).
_MAX_LOG_CHARS = 8000
_SYSTEM_PREVIEW_CHARS = 500


def _content_to_str(content: Any) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict):
                text = block.get("text")
                parts.append(text if isinstance(text, str) else json.dumps(block, default=str))
            else:
                parts.append(str(block))
        return "\n".join(parts)
    return str(content)


def _shorten(text: str, limit: int = _MAX_LOG_CHARS) -> str:
    if len(text) <= limit:
        return text
    return text[:limit] + f"\n... [{len(text) - limit} more chars truncated]"


def _safe_json(obj: Any) -> str:
    try:
        return json.dumps(obj, indent=2, default=str)
    except (TypeError, ValueError):
        return str(obj)


def _log_message(msg: BaseMessage) -> None:
    if isinstance(msg, SystemMessage):
        body = _content_to_str(msg.content)
        if len(body) > _SYSTEM_PREVIEW_CHARS:
            logger.info(
                "[System message] %d chars (preview):\n%s...",
                len(body),
                body[:_SYSTEM_PREVIEW_CHARS],
            )
        else:
            logger.info("[System message]\n%s", body)
        return

    if isinstance(msg, HumanMessage):
        logger.info("[User]\n%s", _shorten(_content_to_str(msg.content)))
        return

    if isinstance(msg, AIMessage):
        text = _content_to_str(msg.content).strip()
        if text:
            logger.info("[Assistant]\n%s", _shorten(text))
        tool_calls = getattr(msg, "tool_calls", None) or []
        for tc in tool_calls:
            name = tc.get("name", "?")
            args = tc.get("args", {}) or {}
            if name == "run_python_script" and isinstance(args, dict):
                code = args.get("code")
                if isinstance(code, str) and code.strip():
                    shown = _shorten(code)
                    logger.info(
                        "[Tool call] run_python_script (%d chars)%s",
                        len(code),
                        " [truncated for display]" if len(shown) < len(code) else "",
                    )
                    syntax = Syntax(
                        shown,
                        "python",
                        theme="ansi_dark",
                        line_numbers=True,
                        word_wrap=True,
                    )
                    console.print(
                        Panel(
                            syntax,
                            title="[dim]run_python_script[/]",
                            border_style="blue",
                            padding=(0, 1),
                        )
                    )
                    continue
            logger.info("[Tool call] %s\n%s", name, _shorten(_safe_json(args)))
        if logger.isEnabledFor(logging.DEBUG):
            if getattr(msg, "additional_kwargs", None):
                logger.debug("[Assistant metadata] %s", msg.additional_kwargs)
        return

    if isinstance(msg, ToolMessage):
        name = getattr(msg, "name", None) or "tool"
        body = _content_to_str(msg.content)
        status = getattr(msg, "status", "success")
        logger.info("[Tool result] %s (%s)\n%s", name, status, _shorten(body))
        return

    logger.info("[%s]\n%s", type(msg).__name__, _shorten(_content_to_str(msg.content)))


def build_agent():
    """Build and return a LangGraph ReAct agent wired to the IFC tools."""
    if not GROQ_API_KEY:
        raise RuntimeError(
            "GROQ_API_KEY is not set. Copy .env.template to .env and set your key."
        )

    llm = ChatGroq(
        model=GROQ_MODEL,
        api_key=GROQ_API_KEY,
    )

    tools = get_tools()

    agent = create_agent(
        model=llm,
        tools=tools,
        system_prompt=SYSTEM_PROMPT,
        debug=graph_debug_enabled(),
    )

    return agent


def run_agent(agent, user_message: str) -> list:
    """Invoke the agent with a user message and return the message history.

    Streams graph state so each new message (assistant, tool calls, tool results)
    is logged to the configured logger as the run progresses.
    """
    logger.info("Starting agent run (user message: %d chars)", len(user_message))
    inputs = {"messages": [("user", user_message)]}

    last_messages: list = []
    seen = 0

    # ToolNode uses a thread pool; our IFC ScriptEngine is one shared process. Run tools
    # one at a time so scripts and revalidate run in model order and never race.
    for state in agent.stream(
        inputs,
        stream_mode="values",
        config={"max_concurrency": 1},
    ):

        if not isinstance(state, dict):
            continue
        msgs = state.get("messages") or []
        if len(msgs) > seen:
            for i in range(seen, len(msgs)):
                _log_message(msgs[i])
            seen = len(msgs)
        last_messages = msgs

    logger.info("Agent run finished (%d messages in history)", len(last_messages))
    return last_messages
