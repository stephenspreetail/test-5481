"""
Tester agent wrapper — hybrid two-phase implementation.

Phase 1: Deterministic pytest runner (no LLM) produces a PytestReport with
         trusted numeric fields parsed from pytest's JSON output files.
Phase 2: LLM evaluator (read-only tools, plan mode) receives the PytestReport
         and produces an EvaluationResult with qualitative/semantic fields.
Assembly: Pure Python merges both into a TestResult for the orchestrator.

The public interface — run_tester() returning TestResult — is unchanged.
The orchestrator's _is_complete() four-gate check sees the same fields as
before, but the numeric fields are now authoritative (no LLM hallucination).
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from models.epic import (
    BuildResult,
    Epic,
    EvaluationResult,
    Plan,
    PytestReport,
    TestResult,
)
from utils.pytest_runner import run_pytest
from utils.sdk_runner import run_agent_with_retry

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "tester_system.md"


async def run_tester(
    epic: Epic,
    plan: Plan,
    build_result: BuildResult,
    workspace_dir: Path,
    coverage_threshold: float,
    model: str = "claude-opus-4-6",
) -> TestResult:
    """
    Two-phase tester returning a TestResult with authoritative numeric fields.

    Phase 1 — Deterministic pytest runner (no LLM): produces PytestReport.
    Phase 2 — LLM evaluator (read-only, plan mode): produces EvaluationResult.
    Assembly — Python code merges both into TestResult.

    Args:
        epic: The epic being tested (provides acceptance criteria).
        plan: The implementation plan (provides expected file structure).
        build_result: What the Builder produced (artifacts and any errors).
        workspace_dir: Directory containing the implementation.
        coverage_threshold: Minimum coverage % required for success.
        model: Claude model ID.

    Returns:
        Validated TestResult Pydantic model.
    """
    # ── PHASE 1: Deterministic pytest runner ──────────────────────────────────
    logger.info(
        f"[{epic.id}] Phase 1: Running pytest deterministically "
        f"| iteration={plan.iteration}"
    )

    pytest_report = run_pytest(workspace_dir=workspace_dir, coverage_threshold=coverage_threshold)

    logger.info(
        f"[{epic.id}] Phase 1 complete | "
        f"passed={pytest_report.tests_passed} "
        f"failed={pytest_report.tests_failed} "
        f"total={pytest_report.tests_total} "
        f"coverage={pytest_report.coverage_percent:.1f}% "
        f"no_tests={pytest_report.no_tests_found}"
    )

    if pytest_report.install_attempted:
        logger.info(
            f"[{epic.id}] Dependency auto-install attempted | "
            f"succeeded={pytest_report.install_succeeded}"
        )

    # ── PHASE 2: LLM evaluator ────────────────────────────────────────────────
    system_prompt = _SYSTEM_PROMPT_PATH.read_text()

    context = {
        "epic": epic.model_dump(),
        "plan": plan.model_dump(mode="json"),
        "build_result": build_result.model_dump(mode="json"),
        "workspace_dir": str(workspace_dir),
        "coverage_threshold": coverage_threshold,
        "pytest_report": pytest_report.model_dump(mode="json"),
        "instruction": (
            "The pytest suite has already been run. "
            "The pytest_report field contains the authoritative test results. "
            "DO NOT run tests yourself — you have no Bash tool. "
            "Evaluate acceptance criteria by reading source and test files. "
            "Set success=true ONLY if all acceptance criteria are satisfied "
            "AND pytest_report shows tests_failed==0 "
            f"AND coverage_percent>={coverage_threshold} "
            "AND critical_issues is empty. "
            "Write actionable feedback_for_planner."
        ),
    }

    prompt = (
        "Evaluate the following implementation against acceptance criteria.\n\n"
        f"Context (including already-run pytest results):\n"
        f"```json\n{json.dumps(context, indent=2, default=str)}\n```\n\n"
        "Read source files and test files to assess acceptance criteria compliance. "
        "Return a structured EvaluationResult JSON."
    )

    logger.info(
        f"[{epic.id}] Phase 2: Launching LLM evaluator | iteration={plan.iteration}"
    )

    eval_result, result_msg = await run_agent_with_retry(
        prompt=prompt,
        system_prompt=system_prompt,
        output_schema=EvaluationResult,
        workspace_dir=workspace_dir,
        allowed_tools=["Read", "Glob", "Grep"],
        permission_mode="plan",
        model=model,
        max_turns=20,
        max_budget_usd=1.0,
        max_attempts=3,
    )

    cost = getattr(result_msg, "total_cost_usd", None)
    logger.info(
        f"[{epic.id}] Phase 2 complete | "
        f"success={eval_result.success} "
        f"critical_issues={len(eval_result.critical_issues)} "
        + (f"cost=${cost:.4f}" if cost else "")
    )

    # ── ASSEMBLY: Merge phases into TestResult ────────────────────────────────
    computed_success = _compute_authoritative_success(
        pytest_report=pytest_report,
        eval_result=eval_result,
        coverage_threshold=coverage_threshold,
    )

    test_result = TestResult(
        epic_id=epic.id,
        iteration=plan.iteration,
        # Trusted numeric fields from Phase 1:
        tests_passed=pytest_report.tests_passed,
        tests_failed=pytest_report.tests_failed,
        tests_total=pytest_report.tests_total,
        coverage_percent=pytest_report.coverage_percent,
        # Qualitative fields from Phase 2 (merged with Phase 1 diagnostics):
        critical_issues=_build_critical_issues(pytest_report, eval_result),
        warnings=eval_result.warnings,
        feedback_for_planner=_build_feedback(pytest_report, eval_result, coverage_threshold),
        # Authoritative success derived in Python:
        success=computed_success,
    )

    logger.info(
        f"[{epic.id}] Tester complete | iteration={plan.iteration} "
        f"passed={test_result.tests_passed}/{test_result.tests_total} "
        f"coverage={test_result.coverage_percent:.1f}% "
        f"success={test_result.success}"
    )

    if test_result.critical_issues:
        logger.warning(
            f"[{epic.id}] Critical issues found: {test_result.critical_issues}"
        )

    return test_result


# ── Private assembly helpers ───────────────────────────────────────────────────


def _compute_authoritative_success(
    pytest_report: PytestReport,
    eval_result: EvaluationResult,
    coverage_threshold: float,
) -> bool:
    """
    Derive the authoritative success value in pure Python.

    Mirrors the orchestrator's _is_complete() four-gate logic so that
    success=True in a TestResult is always consistent with objective
    conditions. The LLM's advisory success is only consulted when all
    objective gates pass.

    Gate 1: zero test failures (objective)
    Gate 2: coverage meets threshold (objective)
    Gate 3: no critical issues (merged list)
    Gate 4: LLM acceptance-criteria assessment (advisory)
    """
    if pytest_report.tests_failed > 0:
        return False
    if pytest_report.no_tests_found:
        return False
    if pytest_report.coverage_percent < coverage_threshold:
        return False
    if _build_critical_issues(pytest_report, eval_result):
        return False
    return eval_result.success


def _build_critical_issues(
    pytest_report: PytestReport,
    eval_result: EvaluationResult,
) -> list[str]:
    """
    Merge deterministic critical issues with LLM-sourced critical issues.

    Deterministic issues always come first so they are visible in logs
    and take precedence.
    """
    issues: list[str] = []

    if pytest_report.no_tests_found:
        issues.append("No test files found in workspace.")

    if pytest_report.error_detail:
        issues.append(f"pytest subprocess error: {pytest_report.error_detail}")

    if pytest_report.install_attempted and not pytest_report.install_succeeded:
        issues.append(
            "Dependency auto-install was attempted but failed. "
            "Tests may not reflect actual results."
        )

    issues.extend(eval_result.critical_issues)
    return issues


def _build_feedback(
    pytest_report: PytestReport,
    eval_result: EvaluationResult,
    coverage_threshold: float,
) -> str:
    """
    Compose feedback_for_planner from deterministic summary and LLM analysis.

    Always leads with the deterministic pytest summary so the Planner has
    unambiguous numbers, followed by the LLM's qualitative analysis.
    """
    parts: list[str] = []

    if pytest_report.no_tests_found:
        parts.append("No test files were found. The Builder must create tests.")
    else:
        parts.append(
            f"pytest: {pytest_report.tests_passed} passed, "
            f"{pytest_report.tests_failed} failed, "
            f"{pytest_report.tests_total} total. "
            f"Coverage: {pytest_report.coverage_percent:.1f}% "
            f"(threshold: {coverage_threshold:.1f}%)."
        )

    if pytest_report.error_detail:
        parts.append(f"pytest subprocess error: {pytest_report.error_detail}")

    if pytest_report.install_attempted:
        status = "succeeded" if pytest_report.install_succeeded else "FAILED"
        parts.append(f"Dependency auto-install {status}.")

    parts.append(eval_result.feedback_for_planner)

    return " ".join(parts)
