"""Shrink agent threads when Groq rejects a request for exceeding TPM / payload limits."""

from __future__ import annotations

import builtins
import json
import logging
import re
from typing import Any

from groq import APIStatusError
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_groq import ChatGroq

from src.config import (
    GROQ_API_KEY,
    GROQ_COMPACT_MODEL,
    GROQ_COMPACT_PARSE_RETRIES,
)

log = logging.getLogger("ifc_agent.context_compact")

_ROUND_SYSTEM = """You compress one assistant step of an IFC/BIM coding agent (ifcopenshell, IDS, bSDD).

The user message contains:
- Optional assistant preamble (text before tools).
- One or more tools: each has a name, arguments (often JSON), and execution output.

Write ONE cohesive summary (max 2800 characters) covering: intent, key arguments (not full scripts—just purpose), outcomes (errors, counts, stdout highlights, GlobalIds, paths), and facts needed to continue. No large pasted code.

Reply with plain text only. No markdown fences, no JSON wrapper."""

_MAX_CHARS_TOOL_OUTPUT = 12_000
_MAX_CHARS_ARGS = 8_000
_MAX_ROUND_SUMMARY = 3_000


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


_BaseExcGroup = getattr(builtins, "BaseExceptionGroup", None)


def _flatten_exceptions(exc: BaseException | None) -> list[BaseException]:
    """Collect exc and linked causes/contexts, plus nested BaseExceptionGroup children (Python 3.11+)."""
    if exc is None:
        return []
    out: list[BaseException] = []
    seen: set[int] = set()
    stack: list[BaseException] = [exc]
    while stack:
        e = stack.pop()
        if id(e) in seen:
            continue
        seen.add(id(e))
        out.append(e)
        if _BaseExcGroup is not None and isinstance(e, _BaseExcGroup):
            stack.extend(e.exceptions)
        if e.__cause__ is not None:
            stack.append(e.__cause__)
        ctx = getattr(e, "__context__", None)
        if ctx is not None and ctx is not e.__cause__:
            stack.append(ctx)
    return out


def is_context_payload_too_large(exc: BaseException) -> bool:
    """True for Groq HTTP 413 / request-too-large style TPM errors."""
    full_text = str(exc).lower()
    if "error code: 413" in full_text or (
        "413" in full_text and "request too large" in full_text and "token" in full_text
    ):
        return True
    for e in _flatten_exceptions(exc):
        if isinstance(e, APIStatusError) and getattr(e, "status_code", None) == 413:
            return True
        msg = str(e).lower()
        if "request too large" in msg and "token" in msg:
            return True
    return False


def thread_has_compactable_tool_rounds(messages: list[BaseMessage]) -> bool:
    """True if the thread still has tool rounds (assistant tool_calls and/or tool results) to collapse."""
    for m in messages:
        if isinstance(m, AIMessage) and (getattr(m, "tool_calls", None) or []):
            return True
        if isinstance(m, ToolMessage):
            return True
    return False


def _strip_markdown_fence(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        t = re.sub(r"^```(?:\w*)?\s*", "", t)
        t = re.sub(r"\s*```\s*$", "", t)
    return t.strip()


def _hard_truncate(text: str, limit: int = 900) -> str:
    t = text.strip()
    if len(t) <= limit:
        return t
    return t[:limit] + f"\n...[hard-truncated {len(t) - limit} chars]"


def _fallback_round_summary(preamble: str, items: list[tuple[str, str, str]]) -> str:
    lines: list[str] = []
    if preamble:
        lines.append(f"Preamble: {_hard_truncate(preamble, 400)}")
    for name, args_s, res in items:
        lines.append(
            f"- **{name}** args: {_hard_truncate(args_s, 400)} → "
            f"out: {_hard_truncate(res, 700)}"
        )
    return "\n".join(lines)[:_MAX_ROUND_SUMMARY]


def _summarize_tool_round(
    llm: ChatGroq,
    preamble: str,
    items: list[tuple[str, str, str]],
) -> str:
    """items: (tool_name, args_text, result_text)."""
    blocks: list[str] = []
    for idx, (name, args_s, res) in enumerate(items, start=1):
        args_snip = args_s if len(args_s) <= _MAX_CHARS_ARGS else args_s[:_MAX_CHARS_ARGS] + "…"
        res_snip = res if len(res) <= _MAX_CHARS_TOOL_OUTPUT else res[:_MAX_CHARS_TOOL_OUTPUT] + "\n...[truncated]"
        blocks.append(f"### Tool {idx}: {name}\n**Arguments:** {args_snip}\n**Output:**\n{res_snip}")
    user_parts: list[str] = []
    if preamble:
        user_parts.append(
            f"Assistant text before tools (may be empty):\n{preamble[:2500]}"
            + ("…" if len(preamble) > 2500 else "")
        )
    user_parts.append("\n\n".join(blocks))
    user_text = "\n\n".join(user_parts)

    msgs: list = [
        SystemMessage(content=_ROUND_SYSTEM),
        HumanMessage(
            content=(
                f"Summarize this step in at most {_MAX_ROUND_SUMMARY} characters (plain text).\n\n"
                + user_text
            )
        ),
    ]
    max_attempts = max(1, GROQ_COMPACT_PARSE_RETRIES)
    for attempt in range(max_attempts):
        try:
            resp = llm.invoke(msgs)
            raw = _strip_markdown_fence(_content_to_str(resp.content))
            if len(raw) >= 50:
                return raw[:_MAX_ROUND_SUMMARY]
            log.warning(
                "Compact round summary too short (attempt %d/%d, %d chars).",
                attempt + 1,
                max_attempts,
                len(raw),
            )
            if attempt + 1 >= max_attempts:
                break
            msgs.append(AIMessage(content=raw))
            msgs.append(
                HumanMessage(
                    content="That summary is too short or empty. Reply with a denser plain-text summary "
                    f"(at least a few sentences), max {_MAX_ROUND_SUMMARY} characters."
                )
            )
        except Exception:
            log.exception(
                "Compact model invoke failed (round, attempt %d/%d).",
                attempt + 1,
                max_attempts,
            )
            if attempt + 1 >= max_attempts:
                break
    return _fallback_round_summary(preamble, items)


def compact_thread_tool_results(messages: list[BaseMessage]) -> list[BaseMessage]:
    """Collapse each assistant tool-calling turn into one ``AIMessage`` (no ``tool_calls``).

    Replaces ``AIMessage`` + following ``ToolMessage``\\ s with a single assistant summary.
    """
    if not thread_has_compactable_tool_rounds(messages):
        return list(messages)

    llm: ChatGroq | None = None
    if GROQ_API_KEY:
        llm = ChatGroq(
            model=GROQ_COMPACT_MODEL,
            api_key=GROQ_API_KEY,
            temperature=0,
            max_retries=2,
        )
    else:
        log.warning("GROQ_API_KEY missing; using hard truncation for tool rounds.")

    out: list[BaseMessage] = []
    i = 0
    n = len(messages)
    while i < n:
        m = messages[i]
        tcalls = getattr(m, "tool_calls", None) or []

        if isinstance(m, AIMessage) and tcalls:
            nt = len(tcalls)
            tool_msgs: list[ToolMessage] = []
            j = i + 1
            while j < n and isinstance(messages[j], ToolMessage) and len(tool_msgs) < nt:
                tool_msgs.append(messages[j])
                j += 1

            if not tool_msgs:
                out.append(
                    AIMessage(
                        content=(
                            (_content_to_str(m.content).strip() or "")
                            + "\n[Note: assistant issued tool calls but no tool results appear in this thread.]"
                        ).strip(),
                        tool_calls=[],
                    )
                )
                i += 1
                continue

            items: list[tuple[str, str, str]] = []
            for k, tm in enumerate(tool_msgs):
                tc = tcalls[k] if k < nt else {}
                name = str((tc.get("name") if isinstance(tc, dict) else None) or tm.name or "tool")
                args = tc.get("args") if isinstance(tc, dict) else None
                if isinstance(args, dict):
                    args_str = json.dumps(args, ensure_ascii=False, default=str)
                else:
                    args_str = str(args) if args is not None else ""
                items.append((name, args_str, _content_to_str(tm.content)))

            preamble = _content_to_str(m.content).strip()
            if len(tool_msgs) != nt:
                preamble = (
                    f"{preamble}\n[Partial round: {len(tool_msgs)} result(s) for {nt} tool call(s).]"
                ).strip()

            if llm is not None:
                summary = _summarize_tool_round(llm, preamble, items)
            else:
                summary = _fallback_round_summary(preamble, items)

            label = f"{len(tool_msgs)}/{nt}" if len(tool_msgs) != nt else str(len(tool_msgs))
            out.append(
                AIMessage(
                    content=f"[Compacted tool round — {label} tool(s)]\n{summary}",
                    tool_calls=[],
                )
            )
            i += 1 + len(tool_msgs)
            continue

        if isinstance(m, ToolMessage):
            name = getattr(m, "name", None) or "tool"
            out.append(
                AIMessage(
                    content=(
                        f"[Compacted orphan tool result — {name}]\n"
                        f"{_hard_truncate(_content_to_str(m.content), 2000)}"
                    ),
                    tool_calls=[],
                )
            )
            i += 1
            continue

        out.append(m)
        i += 1

    return out
