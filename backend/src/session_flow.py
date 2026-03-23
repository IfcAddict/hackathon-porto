"""Shared IFC agent session preparation, issues JSON export, and review helpers."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Callable

from src.agent import build_agent, run_agent
from src.engine import ScriptEngine
from src.ifc_utils import copy_ifc_to_output, parse_bcf, run_ifctester
from src.tools import init_tools


def issues_json_path(ifc_output_path: str) -> str:
    """Path to `{ifc_stem}_issues.json` next to the output IFC."""
    if not ifc_output_path.lower().endswith(".ifc"):
        return ifc_output_path + "_issues.json"
    return ifc_output_path[:-4] + "_issues.json"


def issues_for_json_export(issues: list[dict]) -> list[dict]:
    """Return a deep-safe list of issues with explicit 0-based index on each row."""
    out: list[dict] = []
    for i, issue in enumerate(issues):
        row = dict(issue)
        row["index"] = i
        out.append(row)
    return out


def write_issues_json(ifc_output_path: str, issues: list[dict]) -> str:
    """Write grouped issues next to the output IFC; returns the JSON path."""
    path = issues_json_path(ifc_output_path)
    payload = issues_for_json_export(issues)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
    return path


def collect_issues(
    files: dict,
    ifc_path: str,
    *,
    log_line: Callable[[str], None] | None = None,
) -> list[dict]:
    """Gather issues from IDS validation and/or BCF files."""
    issues: list[dict] = []

    for ids_path in files["ids"]:
        if log_line:
            log_line(f"Validating against: {os.path.basename(ids_path)}")
        issues.extend(run_ifctester(ifc_path, ids_path))

    for bcf_path in files["bcf"]:
        if log_line:
            log_line(f"Reading BCF: {os.path.basename(bcf_path)}")
        issues.extend(parse_bcf(bcf_path))

    return issues


@dataclass
class AgentSessionContext:
    issues: list[dict]
    merged_verbose: int
    ifc_output_path: str
    engine: ScriptEngine
    ids_path: str | None
    agent: Any | None = None


def load_grouped_issues_from_json(path: str) -> list[dict]:
    """Load grouped issues from `*_issues.json` (title, description, elementIds per row)."""
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("issues JSON must be an array")
    out: list[dict] = []
    for item in data:
        if not isinstance(item, dict):
            raise ValueError("each issue must be an object")
        title = item.get("title")
        description = item.get("description")
        element_ids = item.get("elementIds")
        if not isinstance(title, str) or not isinstance(description, str):
            raise ValueError("each issue needs string title and description")
        if not isinstance(element_ids, list) or not all(isinstance(x, str) for x in element_ids):
            raise ValueError("each issue needs elementIds as a list of strings")
        out.append({"title": title, "description": description, "elementIds": list(element_ids)})
    return out


def build_agent_session_on_existing_output(
    ifc_output_path: str,
    issues: list[dict],
    *,
    merged_verbose: int,
    files: dict,
    with_llm_agent: bool,
) -> AgentSessionContext:
    """Open the engine on an IFC already under output/ (no copy)."""
    ids_path = files["ids"][0] if files["ids"] else None
    engine = ScriptEngine(ifc_output_path)
    init_tools(engine, ifc_output_path, ids_path)
    agent = build_agent() if with_llm_agent else None
    return AgentSessionContext(
        issues=issues,
        merged_verbose=merged_verbose,
        ifc_output_path=ifc_output_path,
        engine=engine,
        ids_path=ids_path,
        agent=agent,
    )


def build_agent_session(
    issues: list[dict],
    merged_verbose: int,
    ifc_path: str,
    files: dict,
) -> AgentSessionContext:
    """Copy IFC to output, init engine/tools, build agent."""
    ifc_output_path = copy_ifc_to_output(ifc_path)
    return build_agent_session_on_existing_output(
        ifc_output_path,
        issues,
        merged_verbose=merged_verbose,
        files=files,
        with_llm_agent=True,
    )


def finalize_session_disk(ctx: AgentSessionContext) -> tuple[str, str]:
    """Save IFC and issues JSON; returns (ifc_path, issues_json_path)."""
    ctx.engine.save_model(ctx.ifc_output_path)
    json_path = write_issues_json(ctx.ifc_output_path, ctx.issues)
    return ctx.ifc_output_path, json_path


def resolve_group_decisions(
    issues: list[dict],
    group_decisions: list[dict] | None,
    *,
    default_status: str = "accept",
) -> list[dict]:
    """
    Build fix_reviews list aligned with issues.

    Each entry in group_decisions: {"index": int, "status": "accept"|"reject"}.
    Indices not listed default to default_status (accept).
    """
    n = len(issues)
    status_by_index: dict[int, str] = {}
    for item in group_decisions or []:
        idx = item.get("index")
        if not isinstance(idx, int) or idx < 0 or idx >= n:
            continue
        raw = (item.get("status") or default_status).strip().lower()
        if raw not in ("accept", "reject"):
            raw = default_status
        status_by_index[idx] = raw

    fix_reviews: list[dict] = []
    for i in range(n):
        status = status_by_index.get(i, default_status)
        fix_reviews.append({"title": issues[i]["title"], "status": status})
    return fix_reviews


def run_agent_turn(agent: Any, user_message: str) -> list:
    """Single agent invocation (blocking)."""
    return run_agent(agent, user_message)


def invoke_agent_turn(ctx: AgentSessionContext, user_message: str) -> list:
    """Run the LLM agent, or return a canned reply when ``ctx.agent`` is None (sample mode)."""
    if ctx.agent is None:
        from langchain_core.messages import AIMessage

        return [
            AIMessage(
                content=(
                    "IFC_AGENT_SAMPLE_MODE: LLM inference skipped. "
                    "Using existing output IFC and companion *_issues.json on disk."
                )
            )
        ]
    return run_agent(ctx.agent, user_message)


def last_message_text(messages: list) -> str:
    """Best-effort final assistant/user-visible text from an agent message list."""
    if not messages:
        return "(no response)"
    content = getattr(messages[-1], "content", None)
    if isinstance(content, str):
        return content
    if content is None:
        return "(no response)"
    return str(content)
