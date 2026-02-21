"""
Tester agent wrapper.

Invokes a Claude Agent SDK subprocess to run the actual test suite against
artifacts produced by the Builder. The Tester uses the Bash tool to execute
pytest and coverage inside the workspace directory, then synthesises a
structured TestResult with actionable feedback for the next planning iteration.

This is the most sensitive agent in the loop: its TestResult directly
determines whether the orchestrator marks an epic complete or iterates again.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from models.epic import Epic, Plan, BuildResult, TestResult
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
    Invoke the Tester agent to run tests against produced artifacts.

    The Tester uses the Bash tool to actually execute pytest and coverage
    commands inside workspace_dir, then synthesises a TestResult.

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
    system_prompt = _SYSTEM_PROMPT_PATH.read_text()

    context = {
        "epic": epic.model_dump(),
        "plan": plan.model_dump(mode="json"),
        "build_result": build_result.model_dump(mode="json"),
        "workspace_dir": str(workspace_dir),
        "coverage_threshold": coverage_threshold,
        "instruction": (
            "Run all tests in workspace_dir using pytest. "
            "Measure coverage. "
            "Evaluate every acceptance criterion from the epic. "
            "Set success=true ONLY if tests_failed==0, "
            "coverage_percent>=coverage_threshold, and critical_issues is empty. "
            "Write actionable feedback_for_planner explaining what to fix."
        ),
    }

    prompt = (
        "Test the implementation of the following epic.\n\n"
        f"Context:\n```json\n{json.dumps(context, indent=2, default=str)}\n```\n\n"
        "Run the tests, measure coverage, evaluate acceptance criteria, "
        "and return a structured TestResult JSON."
    )

    logger.info(
        f"[{epic.id}] Launching Tester | iteration={plan.iteration} "
        f"artifacts={len(build_result.artifacts)}"
    )

    test_result, result_msg = await run_agent_with_retry(
        prompt=prompt,
        system_prompt=system_prompt,
        output_schema=TestResult,
        workspace_dir=workspace_dir,
        allowed_tools=["Read", "Bash", "Glob", "Grep"],
        permission_mode="bypassPermissions",
        model=model,
        max_turns=40,
        max_budget_usd=2.0,
        max_attempts=3,
    )

    test_result = test_result.model_copy(
        update={"epic_id": epic.id, "iteration": plan.iteration}
    )

    cost = getattr(result_msg, "total_cost_usd", None)
    logger.info(
        f"[{epic.id}] Tester complete | iteration={plan.iteration} "
        f"passed={test_result.tests_passed}/{test_result.tests_total} "
        f"coverage={test_result.coverage_percent:.1f}% "
        f"success={test_result.success} "
        + (f"cost=${cost:.4f}" if cost else "")
    )

    if test_result.critical_issues:
        logger.warning(
            f"[{epic.id}] Critical issues found: {test_result.critical_issues}"
        )

    return test_result
