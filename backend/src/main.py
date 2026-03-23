import sys
import os

from rich.markup import escape
from rich.panel import Panel
from rich.rule import Rule

from src.config import GROQ_API_KEY, RSC_DIR
from src.logging_config import configure_logging, console
from src.ifc_utils import scan_rsc_dir
from src.groq_rate_limit import GroqDailyQuotaExceeded
from src.issue_summary import summarize_issues_for_agent
from src.prompts import build_initial_user_message, build_review_feedback_message
from src.agent import run_agent
from src.session_flow import (
    build_agent_session,
    collect_issues,
    finalize_session_disk,
    write_issues_json,
)


def print_separator():
    console.print(Rule(style="dim"))


def display_report(final_message: str):
    """Display the agent's final report."""
    print_separator()
    console.print(
        Panel(
            escape(final_message) if final_message else "(empty)",
            title="[bold bright_white]AGENT FIX REPORT[/]",
            border_style="bright_blue",
            padding=(1, 2),
        )
    )
    print_separator()


def review_loop(
    issues: list[dict],
    agent,
    ifc_output_path: str,
    *,
    summarized_element_rows: int = 0,
):
    """Run the agent, show results, collect feedback, repeat if needed."""
    user_message = build_initial_user_message(
        issues,
        summarized_element_rows=summarized_element_rows or None,
    )
    console.print("\n[bold yellow]Starting agent…[/]\n")
    messages = run_agent(agent, user_message)

    while True:
        final_message = messages[-1].content if messages else "(no response)"
        display_report(final_message)

        console.print("[bold]Review each issue group.[/] Type [cyan]ACCEPT[/] or [magenta]REJECT[/] for each.\n")

        fix_reviews = []
        for i, issue in enumerate(issues, 1):
            while True:
                title = escape(issue["title"])
                response = console.input(
                    f"  [dim][{i}][/] {title} [bold]—[/] ACCEPT / REJECT: "
                ).strip().upper()
                if response in ("ACCEPT", "REJECT"):
                    fix_reviews.append({
                        "title": issue["title"],
                        "status": response.lower(),
                    })
                    break
                console.print("    [yellow]Please type ACCEPT or REJECT.[/]")

        print_separator()
        console.print(
            "[dim]All fixes reviewed. Provide instructions for the agent to do another pass,[/]\n"
            "[dim]or press Enter with no text to finish and keep the current result.[/]\n"
        )
        human_instructions = console.input("[bold]Instructions[/] (or Enter to finish): ").strip()

        if not human_instructions:
            console.print(f"\n[green]Session complete.[/] Output saved to: [cyan]{escape(ifc_output_path)}[/]")
            break

        feedback_message = build_review_feedback_message(fix_reviews, human_instructions)
        console.print("\n[bold yellow]Re-running agent with your feedback…[/]\n")
        messages = run_agent(agent, feedback_message)


def main():
    configure_logging()
    console.print(Rule("[bold bright_cyan]IFC Fix Agent[/]", style="cyan"))
    if not GROQ_API_KEY:
        console.print(
            "\n[red]Missing GROQ_API_KEY.[/] Copy .env.template to .env and set your API key."
        )
        sys.exit(1)
    print_separator()

    files = scan_rsc_dir()

    if not files["ifc"]:
        console.print(f"[red]No IFC files found in[/] [cyan]{escape(RSC_DIR)}[/]")
        console.print("[dim]Place your IFC file (and optionally IDS/BCF files) in the rsc/ folder.[/]")
        sys.exit(1)

    if len(files["ifc"]) > 1:
        console.print("[yellow]Multiple IFC files found. Using the first one:[/]")
        for f in files["ifc"]:
            console.print(f"  [dim]-[/] {escape(os.path.basename(f))}")

    ifc_path = files["ifc"][0]
    console.print(f"[dim]IFC file:[/] [green]{escape(os.path.basename(ifc_path))}[/]")

    if not files["ids"] and not files["bcf"]:
        console.print(f"\n[red]No IDS or BCF files found in[/] [cyan]{escape(RSC_DIR)}[/]")
        console.print("[dim]Place at least one IDS or BCF file alongside your IFC file.[/]")
        sys.exit(1)

    console.print("\n[bold]Collecting issues…[/]")
    raw_issues = collect_issues(
        files,
        ifc_path,
        log_line=lambda msg: console.print(f"  [dim]{escape(msg)}[/]"),
    )

    if not raw_issues:
        console.print("\n[green]No issues found[/] — the IFC file passes all validations.")
        sys.exit(0)

    import ifcopenshell
    console.print("[dim]Loading IFC for issue grouping...[/]")
    model = ifcopenshell.open(ifc_path)

    issues, merged_verbose = summarize_issues_for_agent(raw_issues, model)
    console.print(
        f"\n[dim]Raw report rows:[/] [yellow]{len(raw_issues)}[/]  "
        f"[dim]→ agent / review groups:[/] [green]{len(issues)}[/]"
        + (f"  [dim](merged {merged_verbose} element-level rows)[/]" if merged_verbose else "")
    )
    console.print(f"\n[bold]Issue groups[/] ([cyan]{len(issues)}[/]):")
    for i, issue in enumerate(issues, 1):
        console.print(f"  [cyan]{i}.[/] {escape(issue['title'])}")

    ctx = build_agent_session(issues, merged_verbose, ifc_path, files)
    console.print(f"\n[dim]Working copy:[/] [cyan]{escape(ctx.ifc_output_path)}[/]")

    issues_json_path = write_issues_json(ctx.ifc_output_path, ctx.issues)
    console.print(f"[dim]Issues summary (early):[/] [cyan]{escape(issues_json_path)}[/]")

    try:
        review_loop(
            ctx.issues,
            ctx.agent,
            ctx.ifc_output_path,
            summarized_element_rows=ctx.merged_verbose,
        )
    except GroqDailyQuotaExceeded as err:
        console.print(f"\n[red]{escape(str(err))}[/]")
        sys.exit(2)

    ifc_out, issues_out = finalize_session_disk(ctx)

    console.print(f"\n[green]Final IFC saved to:[/] [cyan]{escape(ifc_out)}[/]")
    console.print(f"[green]Issues summary saved to:[/] [cyan]{escape(issues_out)}[/]")


if __name__ == "__main__":
    main()
