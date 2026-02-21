"""
Builder agent wrapper.

Invokes a Claude Agent SDK subprocess in acceptEdits mode to implement all
subtasks from a Plan. The Builder writes source files and test files to the
workspace directory, then returns a BuildResult describing what it produced.

The full plan is embedded as JSON in the prompt so the Builder has complete
context without needing to maintain session state between iterations.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from models.epic import Epic, Plan, BuildResult
from utils.sdk_runner import run_agent_with_retry

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "builder_system.md"


async def run_builder(
    epic: Epic,
    plan: Plan,
    workspace_dir: Path,
    model: str = "claude-opus-4-6",
) -> BuildResult:
    """
    Invoke the Builder agent to write code artifacts for all subtasks.

    Args:
        epic: The epic being implemented.
        plan: The structured plan produced by the Planner.
        workspace_dir: Directory where the Builder writes all files.
        model: Claude model ID.

    Returns:
        Validated BuildResult Pydantic model.
    """
    system_prompt = _SYSTEM_PROMPT_PATH.read_text()

    context = {
        "epic": epic.model_dump(),
        "plan": plan.model_dump(mode="json"),
        "workspace_dir": str(workspace_dir),
        "instruction": (
            "Implement all subtasks from the plan. "
            "Write all source files and test files to workspace_dir. "
            "Respect dependency order when implementing subtasks. "
            "After writing all files, return a BuildResult JSON."
        ),
    }

    prompt = (
        "Implement the following epic according to the provided plan.\n\n"
        f"Context:\n```json\n{json.dumps(context, indent=2, default=str)}\n```\n\n"
        f"Write all source and test files to: {workspace_dir}\n"
        "Then return the BuildResult JSON describing every file you created."
    )

    logger.info(
        f"[{epic.id}] Launching Builder | iteration={plan.iteration} "
        f"subtasks={len(plan.subtasks)}"
    )

    # Builder retries are expensive; keep max_attempts low.
    build_result, result_msg = await run_agent_with_retry(
        prompt=prompt,
        system_prompt=system_prompt,
        output_schema=BuildResult,
        workspace_dir=workspace_dir,
        allowed_tools=["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
        permission_mode="acceptEdits",
        model=model,
        max_turns=80,
        max_budget_usd=5.0,
        max_attempts=2,
    )

    build_result = build_result.model_copy(
        update={"epic_id": epic.id, "iteration": plan.iteration}
    )

    cost = getattr(result_msg, "total_cost_usd", None)
    logger.info(
        f"[{epic.id}] Builder complete | iteration={plan.iteration} "
        f"artifacts={len(build_result.artifacts)} "
        f"success={build_result.success} "
        + (f"cost=${cost:.4f}" if cost else "")
    )

    if build_result.build_errors:
        logger.warning(
            f"[{epic.id}] Builder reported {len(build_result.build_errors)} error(s): "
            f"{build_result.build_errors}"
        )

    return build_result
