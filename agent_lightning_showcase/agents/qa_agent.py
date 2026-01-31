"""Question Answering Agent using Agent Lightning.

This module demonstrates how to create a question answering agent
that can be trained to provide accurate answers based on context.
"""

from typing import Any

import agentlightning as agl

from ..datasets.sample_datasets import QATask
from ..utils.graders import qa_grader


@agl.rollout
def question_answerer(
    task: QATask,
    prompt_template: agl.PromptTemplate,
) -> float:
    """Question answering agent using a trainable prompt template.

    This agent answers questions based on provided context.
    The prompt template is optimized through training to improve answer quality.

    Args:
        task: The QA task containing context, question, and expected answer
        prompt_template: The trainable prompt template

    Returns:
        Reward score between 0.0 and 1.0 based on answer quality
    """
    # Format the prompt with context and question
    formatted_prompt = prompt_template.format(
        context=task["context"],
        question=task["question"],
    )

    # Get the model's response
    response = prompt_template.complete(formatted_prompt)

    # Emit tracking information
    agl.emit_object({
        "context": task["context"],
        "question": task["question"],
        "answer": response,
        "expected_answer": task["expected_answer"],
    })

    # Calculate and return the reward
    reward = qa_grader(response, task["expected_answer"])
    agl.emit_reward(reward)

    return reward


class QAAgent(agl.LitAgent):
    """Class-based question answering agent.

    This demonstrates building a more sophisticated QA agent
    with custom logic and multi-step reasoning.
    """

    def __init__(self, llm_client: Any = None, use_chain_of_thought: bool = True):
        """Initialize the QA agent.

        Args:
            llm_client: Optional LLM client for making completions
            use_chain_of_thought: Whether to use chain-of-thought reasoning
        """
        super().__init__()
        self.llm_client = llm_client
        self.use_chain_of_thought = use_chain_of_thought

    def rollout(
        self,
        task: QATask,
        resources: dict[str, Any],
        rollout: agl.Rollout,
    ) -> float:
        """Execute a question answering rollout.

        Args:
            task: The QA task
            resources: Dictionary containing prompt_template and other resources
            rollout: The rollout context for tracking

        Returns:
            Reward score between 0.0 and 1.0
        """
        prompt_template = resources.get("prompt_template")

        if prompt_template is None:
            raise ValueError("prompt_template resource is required")

        # Step 1: Analyze the context
        with agl.operation("context_analysis"):
            agl.emit_message(f"Analyzing context: {task['context'][:100]}...")

        # Step 2: Generate the answer
        with agl.operation("answer_generation"):
            formatted_prompt = prompt_template.format(
                context=task["context"],
                question=task["question"],
            )
            response = prompt_template.complete(formatted_prompt)

            agl.emit_object({
                "question": task["question"],
                "generated_answer": response,
            })

        # Step 3: Evaluate the answer
        with agl.operation("answer_evaluation"):
            reward = qa_grader(response, task["expected_answer"])

            agl.emit_object({
                "expected_answer": task["expected_answer"],
                "reward": reward,
            })

        agl.emit_reward(reward)
        return reward

    async def rollout_async(
        self,
        task: QATask,
        resources: dict[str, Any],
        rollout: agl.Rollout,
    ) -> float:
        """Async version of the question answering rollout.

        Args:
            task: The QA task
            resources: Dictionary containing prompt_template and other resources
            rollout: The rollout context for tracking

        Returns:
            Reward score between 0.0 and 1.0
        """
        # For async operations, we can use the async complete method
        prompt_template = resources.get("prompt_template")

        if prompt_template is None:
            raise ValueError("prompt_template resource is required")

        with agl.operation("async_qa"):
            formatted_prompt = prompt_template.format(
                context=task["context"],
                question=task["question"],
            )

            # Use async completion if available
            if hasattr(prompt_template, "complete_async"):
                response = await prompt_template.complete_async(formatted_prompt)
            else:
                response = prompt_template.complete(formatted_prompt)

            reward = qa_grader(response, task["expected_answer"])
            agl.emit_reward(reward)

        return reward
