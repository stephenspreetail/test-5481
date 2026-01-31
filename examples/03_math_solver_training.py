#!/usr/bin/env python3
"""Example 3: Math Problem Solver Training with Agent Lightning.

This example demonstrates training a math problem solving agent
with step-by-step reasoning capabilities.

Usage:
    python examples/03_math_solver_training.py

Requirements:
    - Set OPENAI_API_KEY environment variable
    - pip install agentlightning openai
"""

import os
from openai import AsyncOpenAI
import agentlightning as agl

from agent_lightning_showcase.datasets import create_math_dataset
from agent_lightning_showcase.agents.math_agent import MathAgent, math_solver
from agent_lightning_showcase.utils.prompt_templates import MATH_BASELINE_PROMPT


def create_math_prompt_template() -> agl.PromptTemplate:
    """Create an enhanced prompt template for math problem solving."""
    enhanced_prompt = """You are an expert math problem solver.
Solve the following problem step by step.

Instructions:
1. Read the problem carefully
2. Identify what is being asked
3. Show your work with clear steps
4. Provide the final numerical answer on a new line starting with "Answer: "

Problem: {problem}

Solution:"""

    return agl.PromptTemplate(
        template=enhanced_prompt,
        engine="f-string",
    )


def run_with_verification():
    """Run math training with solution verification enabled."""
    print("\n--- Training with Solution Verification ---\n")

    openai_client = AsyncOpenAI()

    algorithm = agl.APO(
        openai_client,
        gradient_model="gpt-4o-mini",
        apply_edit_model="gpt-4o-mini",
        beam_width=3,
        branch_factor=3,
        beam_rounds=3,
    )

    # Create agent with verification enabled
    math_agent = MathAgent(
        llm_client=openai_client,
        verify_steps=True,
    )

    trainer = agl.Trainer(
        algorithm=algorithm,
        n_runners=6,
        initial_resources={
            "prompt_template": create_math_prompt_template(),
        },
        adapter=agl.TraceToMessages(),
    )

    train_dataset, val_dataset = create_math_dataset()

    print(f"Training samples: {len(train_dataset)}")
    print(f"Validation samples: {len(val_dataset)}")
    print("\nStarting training with verification...")

    try:
        trainer.fit(
            agent=math_agent,
            train_dataset=train_dataset,
            val_dataset=val_dataset,
        )
        print("\nMath agent training completed!")
    except Exception as e:
        print(f"\nTraining error: {e}")


def run_dev_mode():
    """Run in development mode for faster iteration."""
    print("\n--- Development Mode (Fast Debugging) ---\n")

    openai_client = AsyncOpenAI()

    # Using the simpler functional approach for dev mode
    trainer = agl.Trainer(
        n_runners=2,
        initial_resources={
            "prompt_template": create_math_prompt_template(),
        },
    )

    train_dataset, val_dataset = create_math_dataset()

    # Take just a few samples for quick testing
    small_train = train_dataset[:3]
    small_val = val_dataset[:2]

    print(f"Dev mode with {len(small_train)} training, {len(small_val)} validation samples")

    try:
        # Use dev() for faster synchronous debugging
        trainer.dev(
            agent=math_solver,
            train_dataset=small_train,
            val_dataset=small_val,
        )
        print("\nDev mode run completed!")
    except Exception as e:
        print(f"\nDev mode error: {e}")


def main():
    """Run the math solver training examples."""
    print("=" * 60)
    print("Agent Lightning Showcase: Math Problem Solver Training")
    print("=" * 60)

    if not os.environ.get("OPENAI_API_KEY"):
        print("\nWarning: OPENAI_API_KEY not set. This is a demo of the API structure.")
        print("Set your API key to run actual training.\n")

    # Run both modes
    run_dev_mode()
    run_with_verification()

    print("\n" + "=" * 60)
    print("Math solver training examples complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()
