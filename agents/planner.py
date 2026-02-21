"""
Planner agent wrapper.

Invokes a Claude Agent SDK subprocess in plan mode to produce a structured
implementation Plan for a given epic. The Planner can read the workspace and
search the web, but cannot write, edit, or execute files.

When retrying (iteration > 1), the TestResult from the previous attempt is
passed as feedback so the Planner can produce a fundamentally different plan
rather than repeating what already failed.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from models.epic import Epic, Plan, TestResult
from utils.sdk_runner import run_agent_with_retry

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "planner_system.md"


async def run_planner(
    epic: Epic,
    iteration: int,
    previous_test_result: TestResult | None,
    workspace_dir: Path,
    model: str = "claude-opus-4-6",
) -> Plan:
    """
    Invoke the Planner agent to produce a structured Plan.

    Args:
        epic: The epic to plan.
        iteration: Current iteration number (1 = first attempt).
        previous_test_result: TestResult from the previous iteration, or None
            if this is the first attempt. Used to give the Planner feedback
            about what failed so it can change approach.
        workspace_dir: Working directory for the agent subprocess.
        model: Claude model ID.

    Returns:
        Validated Plan Pydantic model.
    """
    system_prompt = _SYSTEM_PROMPT_PATH.read_text()

    context = {
        "epic": epic.model_dump(),
        "iteration": iteration,
        "previous_feedback": (
            previous_test_result.model_dump(mode="json")
            if previous_test_result is not None
            else None
        ),
        "workspace_dir": str(workspace_dir),
        "instruction": (
            "Produce a detailed implementation plan. "
            "Return structured JSON matching the Plan schema. "
            "If previous_feedback is present, your plan MUST address every "
            "critical_issue and failing test described in feedback_for_planner."
        ),
    }

    prompt = (
        "You are planning implementation for the following epic.\n\n"
        f"Context:\n```json\n{json.dumps(context, indent=2, default=str)}\n```\n\n"
        "Produce the structured implementation plan as JSON."
    )

    logger.info(
        f"[{epic.id}] Launching Planner | iteration={iteration} "
        f"retry={'yes' if previous_test_result else 'no'}"
    )

    plan, result_msg = await run_agent_with_retry(
        prompt=prompt,
        system_prompt=system_prompt,
        output_schema=Plan,
        workspace_dir=workspace_dir,
        allowed_tools=["Read", "Glob", "Grep", "WebSearch"],
        permission_mode="plan",
        model=model,
        max_turns=20,
        max_budget_usd=1.0,
        max_attempts=3,
    )

    # Stamp the plan with the correct epic_id and iteration in case the
    # agent produced slightly different values.
    plan = plan.model_copy(update={"epic_id": epic.id, "iteration": iteration})

    cost = getattr(result_msg, "total_cost_usd", None)
    logger.info(
        f"[{epic.id}] Planner complete | iteration={iteration} "
        f"subtasks={len(plan.subtasks)} "
        + (f"cost=${cost:.4f}" if cost else "")
    )
    return plan
