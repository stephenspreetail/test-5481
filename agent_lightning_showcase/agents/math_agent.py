"""Math Problem Solving Agent using Agent Lightning.

This module demonstrates how to create a mathematical reasoning agent
that can be trained to solve various math problems.
"""

from typing import Any

import agentlightning as agl

from ..datasets.sample_datasets import MathTask
from ..utils.graders import math_grader


@agl.rollout
def math_solver(
    task: MathTask,
    prompt_template: agl.PromptTemplate,
) -> float:
    """Math problem solving agent using a trainable prompt template.

    This agent solves mathematical problems step by step.
    The prompt template is optimized through training to improve accuracy.

    Args:
        task: The math task containing problem and expected answer
        prompt_template: The trainable prompt template

    Returns:
        Reward score between 0.0 and 1.0 based on answer correctness
    """
    # Format the prompt with the math problem
    formatted_prompt = prompt_template.format(problem=task["problem"])

    # Get the model's solution
    response = prompt_template.complete(formatted_prompt)

    # Emit tracking information
    agl.emit_object({
        "problem": task["problem"],
        "solution": response,
        "expected_answer": task["expected_answer"],
    })

    # Calculate and return the reward
    reward = math_grader(response, task["expected_answer"])
    agl.emit_reward(reward)

    return reward


class MathAgent(agl.LitAgent):
    """Class-based math problem solving agent.

    This demonstrates a more sophisticated math agent with
    step-by-step reasoning and verification.
    """

    def __init__(self, llm_client: Any = None, verify_steps: bool = True):
        """Initialize the math agent.

        Args:
            llm_client: Optional LLM client for making completions
            verify_steps: Whether to verify intermediate steps
        """
        super().__init__()
        self.llm_client = llm_client
        self.verify_steps = verify_steps

    def rollout(
        self,
        task: MathTask,
        resources: dict[str, Any],
        rollout: agl.Rollout,
    ) -> float:
        """Execute a math problem solving rollout.

        Args:
            task: The math task
            resources: Dictionary containing prompt_template and other resources
            rollout: The rollout context for tracking

        Returns:
            Reward score between 0.0 and 1.0
        """
        prompt_template = resources.get("prompt_template")

        if prompt_template is None:
            raise ValueError("prompt_template resource is required")

        # Step 1: Parse the problem
        with agl.operation("problem_parsing"):
            agl.emit_message(f"Parsing problem: {task['problem']}")

        # Step 2: Solve the problem
        with agl.operation("problem_solving"):
            formatted_prompt = prompt_template.format(problem=task["problem"])
            solution = prompt_template.complete(formatted_prompt)

            agl.emit_object({
                "problem": task["problem"],
                "solution": solution,
            })

        # Step 3: Verify the solution (if enabled)
        if self.verify_steps:
            with agl.operation("solution_verification"):
                # In a real implementation, this could involve
                # executing the math or using a separate verification prompt
                agl.emit_message("Verifying solution steps...")

        # Step 4: Grade the solution
        with agl.operation("grading"):
            reward = math_grader(solution, task["expected_answer"])

            agl.emit_object({
                "expected_answer": task["expected_answer"],
                "reward": reward,
                "correct": reward > 0.9,
            })

        agl.emit_reward(reward)
        return reward

    def validation_rollout(
        self,
        task: MathTask,
        resources: dict[str, Any],
        rollout: agl.Rollout,
    ) -> float:
        """Specialized validation rollout with stricter grading.

        During validation, we might want to use stricter criteria
        or different evaluation methods.

        Args:
            task: The math task
            resources: Dictionary containing prompt_template and other resources
            rollout: The rollout context for tracking

        Returns:
            Reward score between 0.0 and 1.0
        """
        prompt_template = resources.get("prompt_template")

        if prompt_template is None:
            raise ValueError("prompt_template resource is required")

        with agl.operation("validation_solve"):
            formatted_prompt = prompt_template.format(problem=task["problem"])
            solution = prompt_template.complete(formatted_prompt)

            # Use stricter tolerance for validation
            reward = math_grader(solution, task["expected_answer"], tolerance=0.001)

            agl.emit_object({
                "mode": "validation",
                "problem": task["problem"],
                "solution": solution,
                "reward": reward,
            })

        agl.emit_reward(reward)
        return reward
