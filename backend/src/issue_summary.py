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
    element_ids: list[str]


def _is_verbose_element_issue(title: str) -> bool:
    t = (title or "").strip()
    return bool(_IFC_TITLE_PREFIX.match(t))


def _ifc_class_from_title(title: str) -> str | None:
    m = _IFC_TITLE_PREFIX.match((title or "").strip())
    return m.group(1) if m else None


def summarize_issues_for_agent(
    issues: list[dict],
    ifc_model=None,
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
        lambda: {"count": 0, "samples": [], "element_ids": []}
    )
    for issue in verbose:
        ifc = _ifc_class_from_title(issue["title"]) or "Unknown"
        context = (issue.get("description") or "").strip() or (issue.get("title") or "")
        key = (ifc, context)
        g = groups[key]
        g["count"] += 1
        if len(g["samples"]) < max_sample_titles:
            g["samples"].append((issue.get("title") or "")[:200])
            
        # extract globalId from title or from the explicit elementIds list
        if "elementIds" in issue:
            g["element_ids"].extend(issue["elementIds"])
        else:
            # Try to extract the global ID from BCF titles which usually follow the format: 
            # IfcClass - Name - reason - GlobalId - Tag
            parts = issue.get("title", "").split(" - ")
            if len(parts) >= 4:
                # The GlobalId is typically the second to last or last part
                potential_guid = parts[-2].strip()
                if len(potential_guid) == 22: # Standard length of an IFC Base64 GUID
                    g["element_ids"].append(potential_guid)
                else:
                    # Try the last part just in case
                    potential_guid_2 = parts[-1].strip()
                    if len(potential_guid_2) == 22:
                        g["element_ids"].append(potential_guid_2)

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

        raw_gids = list(set(data["element_ids"]))
        final_gids = []
        
        if ifc_model is not None:
            for gid in raw_gids:
                try:
                    el = ifc_model.by_guid(gid)
                    if el is not None and el.is_a("IfcTypeObject"):
                        # Find occurrences
                        for rel in ifc_model.get_inverse(el):
                            if rel.is_a("IfcRelDefinesByType"):
                                for obj in getattr(rel, "RelatedObjects", []):
                                    final_gids.append(obj.GlobalId)
                    else:
                        final_gids.append(gid)
                except Exception:
                    final_gids.append(gid)
        else:
            final_gids = raw_gids

        summarized.append({
            "title": title, 
            "description": "\n".join(desc_lines),
            "elementIds": list(set(final_gids))
        })

    # Compact IDS rows first (overall spec failures), then grouped element-level summaries.
    return compact + summarized, len(verbose)
