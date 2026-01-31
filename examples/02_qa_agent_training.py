#!/usr/bin/env python3
"""Example 2: Question Answering Agent Training with Agent Lightning.

This example shows how to train a question answering agent using
both the functional and class-based approaches.

Usage:
    python examples/02_qa_agent_training.py

Requirements:
    - Set OPENAI_API_KEY environment variable
    - pip install agentlightning openai
"""

import os
from openai import AsyncOpenAI
import agentlightning as agl

from agent_lightning_showcase.datasets import create_qa_dataset
from agent_lightning_showcase.agents.qa_agent import QAAgent, question_answerer
from agent_lightning_showcase.utils.prompt_templates import QA_BASELINE_PROMPT


def create_qa_prompt_template() -> agl.PromptTemplate:
    """Create the baseline prompt template for QA."""
    return agl.PromptTemplate(
        template=QA_BASELINE_PROMPT,
        engine="f-string",
    )


def run_functional_example():
    """Run training using the functional @rollout decorator approach."""
    print("\n--- Functional Approach (@rollout decorator) ---\n")

    openai_client = AsyncOpenAI()

    algorithm = agl.APO(
        openai_client,
        gradient_model="gpt-4o-mini",
        apply_edit_model="gpt-4o-mini",
        beam_width=2,
        beam_rounds=2,
    )

    trainer = agl.Trainer(
        algorithm=algorithm,
        n_runners=4,
        initial_resources={
            "prompt_template": create_qa_prompt_template(),
        },
    )

    train_dataset, val_dataset = create_qa_dataset()

    print(f"Training with {len(train_dataset)} samples...")

    try:
        trainer.fit(
            agent=question_answerer,
            train_dataset=train_dataset,
            val_dataset=val_dataset,
        )
        print("Functional training completed!")
    except Exception as e:
        print(f"Training error: {e}")


def run_class_based_example():
    """Run training using the class-based LitAgent approach."""
    print("\n--- Class-Based Approach (LitAgent) ---\n")

    openai_client = AsyncOpenAI()

    algorithm = agl.APO(
        openai_client,
        gradient_model="gpt-4o-mini",
        apply_edit_model="gpt-4o-mini",
        beam_width=2,
        beam_rounds=2,
    )

    # Create the class-based agent
    qa_agent = QAAgent(
        llm_client=openai_client,
        use_chain_of_thought=True,
    )

    trainer = agl.Trainer(
        algorithm=algorithm,
        n_runners=4,
        initial_resources={
            "prompt_template": create_qa_prompt_template(),
        },
    )

    train_dataset, val_dataset = create_qa_dataset()

    print(f"Training with {len(train_dataset)} samples...")

    try:
        trainer.fit(
            agent=qa_agent,
            train_dataset=train_dataset,
            val_dataset=val_dataset,
        )
        print("Class-based training completed!")
    except Exception as e:
        print(f"Training error: {e}")


def main():
    """Run the QA agent training examples."""
    print("=" * 60)
    print("Agent Lightning Showcase: Question Answering Training")
    print("=" * 60)

    if not os.environ.get("OPENAI_API_KEY"):
        print("\nWarning: OPENAI_API_KEY not set. This is a demo of the API structure.")
        print("Set your API key to run actual training.\n")

    # Run both examples
    run_functional_example()
    run_class_based_example()

    print("\n" + "=" * 60)
    print("QA training examples complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()
