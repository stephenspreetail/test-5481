"""
Deterministic pytest runner — no LLM.

Runs pytest with --json-report and --cov inside the workspace directory,
parses the resulting JSON files, and returns a PytestReport with trusted
numeric values. This is the authoritative source for tests_passed,
tests_failed, tests_total, and coverage_percent used by the orchestrator's
four-gate _is_complete() check.
"""
from __future__ import annotations

import json
import logging
import re
import subprocess
import sys
from pathlib import Path

from models.epic import PytestReport

logger = logging.getLogger(__name__)

_MAX_INSTALL_ATTEMPTS = 1
_SUBPROCESS_TIMEOUT = 300  # seconds


def run_pytest(workspace_dir: Path, coverage_threshold: float) -> PytestReport:
    """
    Execute pytest inside workspace_dir and return a PytestReport.

    Steps:
      1. Detect whether any test files exist.
      2. Run pytest --json-report (writes .pytest_report.json).
      3. Run pytest --cov=. --cov-report=json (writes .coverage.json).
      4. Parse both JSON files.
      5. If an ImportError is detected in output, pip-install the missing
         package and retry once.
      6. Assemble and return PytestReport.

    Args:
        workspace_dir: Absolute path to the directory containing the
                       implementation to test.
        coverage_threshold: Passed through to PytestReport for context;
                            not used for pass/fail logic here.

    Returns:
        PytestReport with authoritative numeric fields and raw text output.
    """
    if not workspace_dir.exists():
        raise ValueError(f"workspace_dir does not exist: {workspace_dir}")

    if not _find_test_files(workspace_dir):
        return PytestReport(
            no_tests_found=True,
            raw_output="No test files found in workspace.",
        )

    install_attempted = False
    install_succeeded: bool | None = None
    combined_output = ""

    for attempt in range(_MAX_INSTALL_ATTEMPTS + 1):
        try:
            json_proc = _run_pytest_json(workspace_dir)
            cov_proc = _run_pytest_cov(workspace_dir)
        except subprocess.TimeoutExpired:
            return PytestReport(
                error_detail=f"pytest timed out after {_SUBPROCESS_TIMEOUT}s",
                raw_output="pytest subprocess timed out.",
                install_attempted=install_attempted,
                install_succeeded=install_succeeded,
            )

        combined_output = (
            json_proc.stdout + json_proc.stderr
            + cov_proc.stdout + cov_proc.stderr
        )

        missing = _extract_missing_module(combined_output)
        if missing and attempt < _MAX_INSTALL_ATTEMPTS:
            logger.info(f"Detected missing module '{missing}', attempting pip install")
            install_attempted = True
            try:
                install_proc = subprocess.run(
                    [sys.executable, "-m", "pip", "install", missing],
                    capture_output=True,
                    text=True,
                    timeout=120,
                )
                install_succeeded = install_proc.returncode == 0
                combined_output += install_proc.stdout + install_proc.stderr
            except subprocess.TimeoutExpired:
                install_succeeded = False
                combined_output += "\npip install timed out.\n"

            if install_succeeded:
                continue  # retry pytest runs
            else:
                break  # install failed; parse whatever we have
        break  # no missing module or no retries left

    report = _parse_json_report(workspace_dir)
    summary = report.get("summary", {})
    tests_passed = summary.get("passed", 0)
    tests_failed = summary.get("failed", 0) + summary.get("error", 0)
    tests_total = summary.get("total", 0)
    cov_percent = _parse_coverage_json(workspace_dir)

    # Detect "no tests collected" exit code
    no_tests_found = tests_total == 0 and json_proc.returncode == 5

    # Non-zero exit codes other than 0 (all pass) and 1 (some fail) are errors
    error_detail: str | None = None
    if json_proc.returncode not in (0, 1, 5):
        error_detail = f"pytest exited with code {json_proc.returncode}"

    if not _find_json_report(workspace_dir) and not error_detail:
        error_detail = (
            "pytest-json-report output file not found; "
            "ensure pytest-json-report is installed."
        )

    return PytestReport(
        tests_passed=tests_passed,
        tests_failed=tests_failed,
        tests_total=tests_total,
        coverage_percent=cov_percent,
        no_tests_found=no_tests_found,
        raw_output=combined_output,
        install_attempted=install_attempted,
        install_succeeded=install_succeeded,
        error_detail=error_detail,
    )


# ── Private helpers ────────────────────────────────────────────────────────────


def _find_test_files(workspace_dir: Path) -> list[Path]:
    return list(workspace_dir.rglob("test_*.py")) + list(workspace_dir.rglob("*_test.py"))


def _find_json_report(workspace_dir: Path) -> Path | None:
    p = workspace_dir / ".pytest_report.json"
    return p if p.exists() else None


def _run_pytest_json(workspace_dir: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        [
            sys.executable, "-m", "pytest",
            "--json-report",
            "--json-report-file=.pytest_report.json",
            "--tb=short",
            "-q",
        ],
        cwd=str(workspace_dir),
        capture_output=True,
        text=True,
        timeout=_SUBPROCESS_TIMEOUT,
    )


def _run_pytest_cov(workspace_dir: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        [
            sys.executable, "-m", "pytest",
            "--cov=.",
            "--cov-report=json:.coverage.json",
            "-q",
            "--no-header",
        ],
        cwd=str(workspace_dir),
        capture_output=True,
        text=True,
        timeout=_SUBPROCESS_TIMEOUT,
    )


def _extract_missing_module(output: str) -> str | None:
    """
    Scan pytest output for ModuleNotFoundError lines.
    Returns the top-level package name, or None if not found.
    """
    pattern = re.compile(r"No module named '([^']+)'")
    match = pattern.search(output)
    if match:
        return match.group(1).split(".")[0]
    return None


def _parse_json_report(workspace_dir: Path) -> dict:
    report_file = workspace_dir / ".pytest_report.json"
    if not report_file.exists():
        return {}
    try:
        return json.loads(report_file.read_text())
    except (json.JSONDecodeError, OSError):
        return {}


def _parse_coverage_json(workspace_dir: Path) -> float:
    cov_file = workspace_dir / ".coverage.json"
    if not cov_file.exists():
        return 0.0
    try:
        data = json.loads(cov_file.read_text())
        return float(data.get("totals", {}).get("percent_covered", 0.0))
    except (json.JSONDecodeError, OSError, ValueError):
        return 0.0
