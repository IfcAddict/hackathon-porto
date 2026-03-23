"""Collapse high-volume validation/BCF rows into agent-sized issue groups."""

from __future__ import annotations

import re
from collections import Counter, defaultdict
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


def _brief_label_from_title(title: str, ifc_class: str) -> str:
    """Strip redundant Ifc class prefix and trailing IDS boilerplate from a BCF-style title."""
    t = (title or "").strip()
    prefix = f"{ifc_class} - "
    if ifc_class != "Unknown" and t.startswith(prefix):
        rest = t[len(prefix) :]
    elif " - " in t:
        _first, rest = t.split(" - ", 1)
        rest = rest.strip()
    else:
        return t[:80] + ("…" if len(t) > 80 else "")
    if " - " in rest:
        name = rest.split(" - ", 1)[0].strip()
        out = name
    else:
        out = rest
    return out[:80] + ("…" if len(out) > 80 else "")


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

        briefs = [_brief_label_from_title(s, ifc) for s in data["samples"]]
        sample_line = "; ".join(briefs)

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

        summarized.append(
            {
                "title": title,
                "rule_context": context,
                "sample_line": sample_line,
                "elementIds": list(set(final_gids)),
            }
        )

    rc_counts = Counter(item["rule_context"] for item in summarized)
    repeated_rc = {k for k, n in rc_counts.items() if n >= 2}
    for item in summarized:
        rc = item["rule_context"]
        sl = (item.pop("sample_line") or "").strip()
        sample_part = f"Samples: {sl}" if sl else ""
        if rc in repeated_rc:
            item["description"] = sample_part
        else:
            item["description"] = f"{rc}\n{sample_part}".strip()

    # Compact IDS rows first (overall spec failures), then grouped element-level summaries.
    return compact + summarized, len(verbose)
