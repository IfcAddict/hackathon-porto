import os
import shutil
from typing import Optional

import ifcopenshell
from ifctester import ids, reporter
from bcf.bcfxml import load as load_bcf

from src.config import RSC_DIR, OUTPUT_DIR


def load_ifc(path: str) -> ifcopenshell.file:
    return ifcopenshell.open(path)


def run_ifctester(ifc_path: str, ids_path: str) -> list[dict]:
    """Validate IFC against IDS and return failed specifications as issue dicts.

    Each issue dict has 'title' and 'description' with a summary of what failed.
    """
    specs = ids.open(ids_path)
    ifc_file = ifcopenshell.open(ifc_path)
    specs.validate(ifc_file)

    json_reporter = reporter.Json(specs)
    results = json_reporter.report()

    issues = []
    for spec in results.get("specifications", []):
        if spec.get("status"):
            continue

        spec_name = spec.get("name", "Unnamed specification")
        spec_desc = spec.get("description", "")

        failed_details = []
        failed_elements = set()
        for req in spec.get("requirements", []):
            if req.get("status"):
                continue
            req_desc = req.get("description", "")
            total_fail = req.get("total_fail", 0)
            failed_details.append(
                f"- {req_desc} ({total_fail} failures)"
            )
            for fail_entity in req.get("failed_entities", []):
                # Extraer GlobalId del diccionario que genera ifctester
                if isinstance(fail_entity, dict) and "global_id" in fail_entity:
                    failed_elements.add(fail_entity["global_id"])
                elif isinstance(fail_entity, dict) and "element" in fail_entity:
                    el = fail_entity["element"]
                    if hasattr(el, "GlobalId"):
                        failed_elements.add(el.GlobalId)

        description = spec_desc
        if failed_details:
            description += "\nFailed requirements:\n" + "\n".join(failed_details)

        issues.append({
            "title": spec_name, 
            "description": description.strip(),
            "elementIds": list(failed_elements)
        })

    return issues


def parse_bcf(bcf_path: str) -> list[dict]:
    """Read a BCF file and extract title + description from each topic."""
    issues = []
    with load_bcf(bcf_path) as bcfxml:
        for _guid, topic_handler in bcfxml.topics.items():
            topic = topic_handler.topic
            issues.append({
                "title": topic.title or "Untitled",
                "description": topic.description or "",
            })
    return issues


def copy_ifc_to_output(ifc_path: str, output_dir: Optional[str] = None) -> str:
    """Copy the IFC file to the output directory and return the new path."""
    output_dir = output_dir or OUTPUT_DIR
    os.makedirs(output_dir, exist_ok=True)
    basename = os.path.basename(ifc_path)
    dest = os.path.join(output_dir, basename)
    shutil.copy2(ifc_path, dest)
    return dest


def scan_rsc_dir(rsc_dir: Optional[str] = None) -> dict:
    """Scan the resource directory for IFC, IDS, and BCF files."""
    rsc_dir = rsc_dir or RSC_DIR
    found = {"ifc": [], "ids": [], "bcf": []}

    if not os.path.isdir(rsc_dir):
        return found

    for f in os.listdir(rsc_dir):
        lower = f.lower()
        full = os.path.join(rsc_dir, f)
        if lower.endswith(".ifc"):
            found["ifc"].append(full)
        elif lower.endswith(".ids") or lower.endswith(".xml"):
            found["ids"].append(full)
        elif lower.endswith(".bcf") or lower.endswith(".bcfzip"):
            found["bcf"].append(full)

    return found
