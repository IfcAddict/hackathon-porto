import sys
import os

from src.config import RSC_DIR
from src.ifc_utils import scan_rsc_dir, run_ifctester, parse_bcf, copy_ifc_to_output
from src.engine import ScriptEngine
from src.tools import init_tools
from src.agent import build_agent, run_agent
from src.prompts import build_initial_user_message, build_review_feedback_message


def collect_issues(files: dict, ifc_path: str) -> list[dict]:
    """Gather issues from IDS validation and/or BCF files."""
    issues = []

    for ids_path in files["ids"]:
        print(f"  Validating against: {os.path.basename(ids_path)}")
        ids_issues = run_ifctester(ifc_path, ids_path)
        issues.extend(ids_issues)

    for bcf_path in files["bcf"]:
        print(f"  Reading BCF: {os.path.basename(bcf_path)}")
        bcf_issues = parse_bcf(bcf_path)
        issues.extend(bcf_issues)

    return issues


def print_separator():
    print("\n" + "=" * 60 + "\n")


def display_report(final_message: str):
    """Display the agent's final report."""
    print_separator()
    print("AGENT FIX REPORT")
    print_separator()
    print(final_message)
    print_separator()


def review_loop(issues: list[dict], agent, ifc_output_path: str):
    """Run the agent, show results, collect feedback, repeat if needed."""
    user_message = build_initial_user_message(issues)
    print("\nStarting agent...\n")
    messages = run_agent(agent, user_message)

    while True:
        final_message = messages[-1].content if messages else "(no response)"
        display_report(final_message)

        print("Review each issue group. Type ACCEPT or REJECT for each.\n")

        fix_reviews = []
        for i, issue in enumerate(issues, 1):
            while True:
                response = input(f"  [{i}] {issue['title']} — ACCEPT / REJECT: ").strip().upper()
                if response in ("ACCEPT", "REJECT"):
                    fix_reviews.append({
                        "title": issue["title"],
                        "status": response.lower(),
                    })
                    break
                print("    Please type ACCEPT or REJECT.")

        print_separator()
        print("All fixes reviewed. Provide instructions for the agent to do another pass,")
        print("or press Enter with no text to finish and keep the current result.\n")
        human_instructions = input("Instructions (or Enter to finish): ").strip()

        if not human_instructions:
            print("\nSession complete. Output saved to:", ifc_output_path)
            break

        feedback_message = build_review_feedback_message(fix_reviews, human_instructions)
        print("\nRe-running agent with your feedback...\n")
        messages = run_agent(agent, feedback_message)


def main():
    print("IFC Fix Agent")
    print_separator()

    files = scan_rsc_dir()

    if not files["ifc"]:
        print(f"No IFC files found in {RSC_DIR}")
        print("Place your IFC file (and optionally IDS/BCF files) in the rsc/ folder.")
        sys.exit(1)

    if len(files["ifc"]) > 1:
        print("Multiple IFC files found. Using the first one:")
        for f in files["ifc"]:
            print(f"  - {os.path.basename(f)}")

    ifc_path = files["ifc"][0]
    print(f"IFC file: {os.path.basename(ifc_path)}")

    if not files["ids"] and not files["bcf"]:
        print(f"\nNo IDS or BCF files found in {RSC_DIR}")
        print("Place at least one IDS or BCF file alongside your IFC file.")
        sys.exit(1)

    print("\nCollecting issues...")
    issues = collect_issues(files, ifc_path)

    if not issues:
        print("\nNo issues found — the IFC file passes all validations.")
        sys.exit(0)

    print(f"\nFound {len(issues)} issue(s):")
    for i, issue in enumerate(issues, 1):
        print(f"  {i}. {issue['title']}")

    ifc_output_path = copy_ifc_to_output(ifc_path)
    print(f"\nWorking copy: {ifc_output_path}")

    ids_path = files["ids"][0] if files["ids"] else None
    engine = ScriptEngine(ifc_output_path)
    init_tools(engine, ifc_output_path, ids_path)

    agent = build_agent()

    review_loop(issues, agent, ifc_output_path)

    engine.save_model(ifc_output_path)
    print(f"\nFinal IFC saved to: {ifc_output_path}")


if __name__ == "__main__":
    main()
