"""Multi-Agent System using Agent Lightning.

This module demonstrates how to create and train a multi-agent system
where multiple specialized agents work together to solve complex tasks.
"""

from typing import Any, TypedDict

import agentlightning as agl

from ..utils.graders import sentiment_grader, qa_grader


class MultiStepTask(TypedDict):
    """Task structure for multi-step processing."""
    text: str
    question: str
    expected_sentiment: str
    expected_answer: str


@agl.rollout
def analyzer_agent(
    task: MultiStepTask,
    prompt_template: agl.PromptTemplate,
) -> float:
    """First agent in the pipeline: analyzes sentiment of the text.

    Args:
        task: The multi-step task
        prompt_template: The trainable prompt template

    Returns:
        Reward based on sentiment classification accuracy
    """
    with agl.operation("sentiment_analysis"):
        formatted_prompt = prompt_template.format(text=task["text"])
        response = prompt_template.complete(formatted_prompt)

        agl.emit_object({
            "agent": "analyzer",
            "input": task["text"],
            "output": response,
        })

    reward = sentiment_grader(response, task["expected_sentiment"])
    agl.emit_reward(reward)
    return reward


@agl.rollout
def responder_agent(
    task: MultiStepTask,
    prompt_template: agl.PromptTemplate,
) -> float:
    """Second agent in the pipeline: answers questions about the text.

    Args:
        task: The multi-step task
        prompt_template: The trainable prompt template

    Returns:
        Reward based on answer quality
    """
    with agl.operation("question_answering"):
        formatted_prompt = prompt_template.format(
            context=task["text"],
            question=task["question"],
        )
        response = prompt_template.complete(formatted_prompt)

        agl.emit_object({
            "agent": "responder",
            "context": task["text"],
            "question": task["question"],
            "answer": response,
        })

    reward = qa_grader(response, task["expected_answer"])
    agl.emit_reward(reward)
    return reward


class MultiAgentPipeline(agl.LitAgent):
    """A pipeline of multiple agents working together.

    This demonstrates how Agent Lightning can be used to train
    individual agents within a larger multi-agent system.
    """

    def __init__(self):
        """Initialize the multi-agent pipeline."""
        super().__init__()

    def rollout(
        self,
        task: MultiStepTask,
        resources: dict[str, Any],
        rollout: agl.Rollout,
    ) -> float:
        """Execute the multi-agent pipeline.

        Args:
            task: The multi-step task
            resources: Dictionary containing prompt templates for each agent
            rollout: The rollout context for tracking

        Returns:
            Combined reward from all agents
        """
        analyzer_template = resources.get("analyzer_prompt")
        responder_template = resources.get("responder_prompt")

        if analyzer_template is None or responder_template is None:
            raise ValueError("Both analyzer_prompt and responder_prompt resources are required")

        rewards = []

        # Step 1: Run the analyzer agent
        with agl.operation("pipeline_step_1_analyze"):
            agl.emit_message("Running analyzer agent...")

            formatted_prompt = analyzer_template.format(text=task["text"])
            sentiment_response = analyzer_template.complete(formatted_prompt)

            agl.emit_object({
                "step": 1,
                "agent": "analyzer",
                "input": task["text"],
                "output": sentiment_response,
            })

            sentiment_reward = sentiment_grader(sentiment_response, task["expected_sentiment"])
            rewards.append(sentiment_reward)
            agl.emit_reward(sentiment_reward, primary_key="sentiment")

        # Step 2: Run the responder agent (with context from analyzer)
        with agl.operation("pipeline_step_2_respond"):
            agl.emit_message("Running responder agent...")

            # The responder uses the sentiment as additional context
            enhanced_context = f"[Sentiment: {sentiment_response}] {task['text']}"

            formatted_prompt = responder_template.format(
                context=enhanced_context,
                question=task["question"],
            )
            answer_response = responder_template.complete(formatted_prompt)

            agl.emit_object({
                "step": 2,
                "agent": "responder",
                "context": enhanced_context,
                "question": task["question"],
                "answer": answer_response,
            })

            answer_reward = qa_grader(answer_response, task["expected_answer"])
            rewards.append(answer_reward)
            agl.emit_reward(answer_reward, primary_key="answer")

        # Calculate combined reward (weighted average)
        combined_reward = sum(rewards) / len(rewards)
        agl.emit_reward(combined_reward, primary_key="combined")

        agl.emit_message(f"Pipeline complete. Combined reward: {combined_reward:.2f}")

        return combined_reward


def create_multi_agent_dataset() -> tuple[list[MultiStepTask], list[MultiStepTask]]:
    """Create training and validation datasets for multi-agent tasks.

    Returns:
        Tuple of (train_dataset, val_dataset)
    """
    train_data: list[MultiStepTask] = [
        {
            "text": "I absolutely love this new smartphone! The camera quality is amazing and the battery lasts all day.",
            "question": "What features does the user like about the smartphone?",
            "expected_sentiment": "positive",
            "expected_answer": "camera quality and battery life"
        },
        {
            "text": "The restaurant was terrible. The food was cold and the service was incredibly slow.",
            "question": "What problems did the customer experience?",
            "expected_sentiment": "negative",
            "expected_answer": "cold food and slow service"
        },
        {
            "text": "The hotel room was clean and the location was convenient. Nothing special but it met our needs.",
            "question": "How would you describe the hotel experience?",
            "expected_sentiment": "neutral",
            "expected_answer": "adequate and convenient"
        },
    ]

    val_data: list[MultiStepTask] = [
        {
            "text": "This is the best laptop I've ever owned! It's fast, lightweight, and the display is gorgeous.",
            "question": "What are the positive attributes of the laptop?",
            "expected_sentiment": "positive",
            "expected_answer": "fast, lightweight, and gorgeous display"
        },
    ]

    return train_data, val_data
