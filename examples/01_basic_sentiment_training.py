#!/usr/bin/env python3
"""Example 1: Basic Sentiment Analysis Training with Agent Lightning.

This example demonstrates the simplest way to use Agent Lightning
to train a sentiment classification agent using the APO algorithm.

Usage:
    python examples/01_basic_sentiment_training.py

Requirements:
    - Set OPENAI_API_KEY environment variable
    - pip install agentlightning openai
"""

import os
from openai import AsyncOpenAI
import agentlightning as agl

from agent_lightning_showcase.datasets import create_sentiment_dataset
from agent_lightning_showcase.utils.prompt_templates import SENTIMENT_BASELINE_PROMPT


def create_baseline_prompt_template() -> agl.PromptTemplate:
    """Create the baseline prompt template for sentiment analysis."""
    return agl.PromptTemplate(
        template=SENTIMENT_BASELINE_PROMPT,
        engine="f-string",
    )


def main():
    """Run the sentiment analysis training."""
    print("=" * 60)
    print("Agent Lightning Showcase: Sentiment Analysis Training")
    print("=" * 60)

    # Check for API key
    if not os.environ.get("OPENAI_API_KEY"):
        print("\nWarning: OPENAI_API_KEY not set. This is a demo of the API structure.")
        print("Set your API key to run actual training.\n")

    # Load datasets
    print("\n1. Loading datasets...")
    train_dataset, val_dataset = create_sentiment_dataset()
    print(f"   Training samples: {len(train_dataset)}")
    print(f"   Validation samples: {len(val_dataset)}")

    # Create the OpenAI client
    print("\n2. Initializing OpenAI client...")
    openai_client = AsyncOpenAI()

    # Create the APO algorithm
    print("\n3. Setting up APO algorithm...")
    algorithm = agl.APO(
        openai_client,
        gradient_model="gpt-4o-mini",
        apply_edit_model="gpt-4o-mini",
        beam_width=2,
        branch_factor=2,
        beam_rounds=2,
        val_batch_size=3,
    )

    # Create the trainer
    print("\n4. Configuring trainer...")
    trainer = agl.Trainer(
        algorithm=algorithm,
        n_runners=4,
        initial_resources={
            "prompt_template": create_baseline_prompt_template(),
        },
        adapter=agl.TraceToMessages(),
    )

    # Define the agent using the functional decorator
    @agl.rollout
    def sentiment_agent(
        task: dict,
        prompt_template: agl.PromptTemplate,
    ) -> float:
        """Classify the sentiment of text."""
        from agent_lightning_showcase.utils.graders import sentiment_grader

        formatted_prompt = prompt_template.format(text=task["text"])
        response = prompt_template.complete(formatted_prompt)

        agl.emit_message(f"Text: {task['text'][:50]}...")
        agl.emit_message(f"Prediction: {response}")

        reward = sentiment_grader(response, task["expected_sentiment"])
        agl.emit_reward(reward)
        return reward

    # Run training
    print("\n5. Starting training...")
    print("-" * 40)

    try:
        trainer.fit(
            agent=sentiment_agent,
            train_dataset=train_dataset,
            val_dataset=val_dataset,
        )
        print("\nTraining completed successfully!")

    except Exception as e:
        print(f"\nTraining error: {e}")
        print("(This is expected if running without API credentials)")

    print("\n" + "=" * 60)
    print("Example complete. Check the documentation for more details.")
    print("=" * 60)


if __name__ == "__main__":
    main()
