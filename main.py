"""
Agentic Epic Builder — CLI entry point.

Usage:
    python main.py --epics-file epics.yaml
    python main.py -e epics.yaml --epic-ids epic-001,epic-002
    python main.py -e epics.yaml --parallel --max-iterations 5
    python main.py -e epics.yaml --coverage-threshold 90 --verbose
"""
from __future__ import annotations

import asyncio
import logging
import sys
from pathlib import Path

import click
import yaml
from rich.logging import RichHandler

from models.epic import Epic
from orchestrator import Orchestrator


def _setup_logging(verbose: bool) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(message)s",
        datefmt="[%X]",
        handlers=[
            RichHandler(
                rich_tracebacks=True,
                show_time=True,
                show_path=verbose,
            )
        ],
    )


def _load_epics(
    epics_file: str,
    epic_ids_filter: str | None,
) -> tuple[list[Epic], dict]:
    """
    Parse epics.yaml and return (list of Epic, settings dict).

    CLI flags take precedence over YAML settings; this function only
    returns the raw settings dict — the caller merges with CLI values.
    """
    raw = yaml.safe_load(Path(epics_file).read_text())
    settings: dict = raw.get("settings", {})
    raw_epics: list[dict] = raw.get("epics", [])

    epics = [Epic(**e) for e in raw_epics]

    if epic_ids_filter:
        ids = {eid.strip() for eid in epic_ids_filter.split(",")}
        epics = [e for e in epics if e.id in ids]
        if not epics:
            click.echo(
                f"Error: no epics found matching IDs: {epic_ids_filter}", err=True
            )
            sys.exit(1)

    return epics, settings


@click.command()
@click.option(
    "--epics-file",
    "-e",
    default="epics.yaml",
    show_default=True,
    type=click.Path(exists=True),
    help="Path to YAML file defining epics.",
)
@click.option(
    "--workspace",
    "-w",
    default=None,
    type=click.Path(),
    help="Root directory where agent workspaces are created. "
    "Overrides 'workspace_dir' in epics.yaml settings.",
)
@click.option(
    "--log-dir",
    "-l",
    default=None,
    type=click.Path(),
    help="Directory for structured JSON logs. "
    "Overrides 'log_dir' in epics.yaml settings.",
)
@click.option(
    "--max-iterations",
    "-n",
    default=None,
    type=int,
    help="Maximum plan-build-test cycles per epic. "
    "Overrides 'max_iterations_per_epic' in epics.yaml settings.",
)
@click.option(
    "--coverage-threshold",
    "-c",
    default=None,
    type=float,
    help="Minimum test coverage %% required for completeness. "
    "Overrides 'coverage_threshold' in epics.yaml settings.",
)
@click.option(
    "--model",
    "-m",
    default=None,
    help="Claude model ID for all agents. "
    "Overrides 'model' in epics.yaml settings.",
)
@click.option(
    "--parallel/--sequential",
    default=False,
    show_default=True,
    help="Run epics in parallel (default: sequential).",
)
@click.option(
    "--epic-ids",
    default=None,
    help="Comma-separated epic IDs to run (default: all epics in file).",
)
@click.option(
    "--verbose",
    "-v",
    is_flag=True,
    help="Enable debug logging.",
)
def main(
    epics_file: str,
    workspace: str | None,
    log_dir: str | None,
    max_iterations: int | None,
    coverage_threshold: float | None,
    model: str | None,
    parallel: bool,
    epic_ids: str | None,
    verbose: bool,
) -> None:
    """
    Agentic Epic Builder — orchestrate Claude agents to implement software features.

    Reads a list of epics from YAML, then drives a Planner → Builder → Tester
    loop for each epic until tests pass and coverage thresholds are met, or
    until the maximum number of iterations is reached.
    """
    _setup_logging(verbose)

    epics, yaml_settings = _load_epics(epics_file, epic_ids)

    if not epics:
        click.echo("No epics to process. Exiting.", err=True)
        sys.exit(0)

    # CLI flags override YAML settings; fall back to hardcoded defaults
    resolved_workspace = workspace or yaml_settings.get("workspace_dir", "./workspace")
    resolved_log_dir = log_dir or yaml_settings.get("log_dir", "./logs")
    resolved_max_iter = max_iterations or yaml_settings.get("max_iterations_per_epic", 3)
    resolved_coverage = coverage_threshold or yaml_settings.get("coverage_threshold", 80.0)
    resolved_model = model or yaml_settings.get("model", "claude-opus-4-6")

    orchestrator = Orchestrator(
        epics=epics,
        workspace_root=Path(resolved_workspace),
        log_dir=Path(resolved_log_dir),
        max_iterations=resolved_max_iter,
        coverage_threshold=resolved_coverage,
        model=resolved_model,
        parallel_epics=parallel,
    )

    final_state = asyncio.run(orchestrator.run())

    # Print JSON summary to stdout for programmatic consumption
    click.echo("\n" + "=" * 60)
    click.echo("SUMMARY")
    click.echo("=" * 60)
    import json

    click.echo(json.dumps(final_state.summary(), indent=2))

    # Exit 0 if all epics completed; 1 otherwise
    all_complete = all(
        s.status == "completed" for s in final_state.epics.values()
    )
    sys.exit(0 if all_complete else 1)


if __name__ == "__main__":
    main()
