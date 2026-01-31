"""Sentiment Analysis Agent using Agent Lightning.

This module demonstrates how to create a sentiment classification agent
that can be trained using Agent Lightning's APO algorithm.
"""

from typing import Any

import agentlightning as agl

from ..datasets.sample_datasets import SentimentTask
from ..utils.graders import sentiment_grader


@agl.rollout
def sentiment_classifier(
    task: SentimentTask,
    prompt_template: agl.PromptTemplate,
) -> float:
    """Sentiment classification agent using a trainable prompt template.

    This agent classifies text as positive, negative, or neutral.
    The prompt template is optimized through training to improve accuracy.

    Args:
        task: The sentiment classification task containing text and expected label
        prompt_template: The trainable prompt template

    Returns:
        Reward score between 0.0 and 1.0 based on classification accuracy
    """
    # Format the prompt with the input text
    formatted_prompt = prompt_template.format(text=task["text"])

    # Get the model's response (handled by Agent Lightning's LLM integration)
    response = prompt_template.complete(formatted_prompt)

    # Emit the model's response for tracking
    agl.emit_message(f"Input: {task['text']}")
    agl.emit_message(f"Prediction: {response}")
    agl.emit_message(f"Expected: {task['expected_sentiment']}")

    # Calculate and return the reward
    reward = sentiment_grader(response, task["expected_sentiment"])
    agl.emit_reward(reward)

    return reward


class SentimentAgent(agl.LitAgent):
    """Class-based sentiment analysis agent.

    This demonstrates the class-based approach to creating agents,
    which provides more flexibility for complex agent implementations.
    """

    def __init__(self, llm_client: Any = None):
        """Initialize the sentiment agent.

        Args:
            llm_client: Optional LLM client for making completions
        """
        super().__init__()
        self.llm_client = llm_client

    def rollout(
        self,
        task: SentimentTask,
        resources: dict[str, Any],
        rollout: agl.Rollout,
    ) -> float:
        """Execute a sentiment classification rollout.

        Args:
            task: The sentiment classification task
            resources: Dictionary containing prompt_template and other resources
            rollout: The rollout context for tracking

        Returns:
            Reward score between 0.0 and 1.0
        """
        prompt_template = resources.get("prompt_template")

        if prompt_template is None:
            raise ValueError("prompt_template resource is required")

        # Format and execute the prompt
        formatted_prompt = prompt_template.format(text=task["text"])

        with agl.operation("sentiment_classification"):
            response = prompt_template.complete(formatted_prompt)

            # Track the response
            agl.emit_object({
                "input_text": task["text"],
                "prediction": response,
                "expected": task["expected_sentiment"],
            })

        # Calculate reward
        reward = sentiment_grader(response, task["expected_sentiment"])
        agl.emit_reward(reward)

        return reward

    def on_rollout_start(self, task: SentimentTask, runner: Any, tracer: Any) -> None:
        """Called before the rollout begins.

        Args:
            task: The task being processed
            runner: The runner executing this rollout
            tracer: The tracer for telemetry
        """
        agl.emit_message(f"Starting sentiment analysis for: {task['text'][:50]}...")

    def on_rollout_end(
        self,
        task: SentimentTask,
        rollout: agl.Rollout,
        runner: Any,
        tracer: Any,
    ) -> None:
        """Called after the rollout completes.

        Args:
            task: The task that was processed
            rollout: The completed rollout
            runner: The runner that executed this rollout
            tracer: The tracer for telemetry
        """
        agl.emit_message("Sentiment analysis completed")
