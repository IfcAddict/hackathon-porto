"""Collapse high-volume validation/BCF rows into agent-sized issue groups."""

from __future__ import annotations

import re
from collections import defaultdict
from typing import TypedDict

# IfcTester BCF topics use titles like: IfcClass - Name - reason - GlobalId - Tag
_IFC_TITLE_PREFIX = re.compile(r"^(Ifc[A-Za-z0-9]+)\s*-\s*")


class _VerboseGroup(TypedDict):
    count: int
    samples: list[str]


def _is_verbose_element_issue(title: str) -> bool:
    t = (title or "").strip()
    return bool(_IFC_TITLE_PREFIX.match(t))


def _ifc_class_from_title(title: str) -> str | None:
    m = _IFC_TITLE_PREFIX.match((title or "").strip())
    return m.group(1) if m else None


def summarize_issues_for_agent(
    issues: list[dict],
    *,
    max_sample_titles: int = 3,
    context_head_chars: int = 120,
) -> tuple[list[dict], int]:
    """Split issues into compact (IDS-style) vs verbose (per-element / BCF), group the latter.

    Returns:
        (issues_for_agent, raw_verbose_count) — raw_verbose_count is how many element-level
        rows were merged (for CLI messaging only).
    """
    compact: list[dict] = []
    verbose: list[dict] = []
    for issue in issues:
        title = issue.get("title") or ""
        if _is_verbose_element_issue(title):
            verbose.append(issue)
        else:
            compact.append(dict(issue))

    if not verbose:
        return compact, 0

    groups: dict[tuple[str, str], _VerboseGroup] = defaultdict(
        lambda: {"count": 0, "samples": []}
    )
    for issue in verbose:
        ifc = _ifc_class_from_title(issue["title"]) or "Unknown"
        context = (issue.get("description") or "").strip() or (issue.get("title") or "")
        key = (ifc, context)
        g = groups[key]
        g["count"] += 1
        if len(g["samples"]) < max_sample_titles:
            g["samples"].append((issue.get("title") or "")[:200])

    summarized: list[dict] = []
    for (ifc, context), data in sorted(
        groups.items(),
        key=lambda item: (-item[1]["count"], item[0][0], item[0][1]),
    ):
        n = data["count"]
        spec_hint = context.split(" - ")[0].strip() if " - " in context else context[:context_head_chars]
        if len(spec_hint) > context_head_chars:
            spec_hint = spec_hint[: context_head_chars - 1] + "…"
        title = f"{ifc} ×{n} — {spec_hint}"

        desc_lines = [
            f"**{n} element-level report(s)** merged into this single task (same IFC type and IDS rule context).",
            "",
            f"- **Target with ifcopenshell:** `model.by_type(\"{ifc}\")` (and related types if the rule applies to occurrences vs types).",
            f"- **Rule context (from IDS / BCF):** {context}",
            "",
            "**Fix approach:** Inspect the failing attribute or facet named in the context; apply a bulk fix across all matching instances, then call `revalidate_ifc`. You do **not** need individual GlobalIds unless a spot fix is required.",
        ]
        if data["samples"]:
            desc_lines.extend(["", "Example original labels (truncated):"])
            for s in data["samples"]:
                desc_lines.append(f"  - {s}")

        summarized.append({"title": title, "description": "\n".join(desc_lines)})

    # Compact IDS rows first (overall spec failures), then grouped element-level summaries.
    return compact + summarized, len(verbose)
