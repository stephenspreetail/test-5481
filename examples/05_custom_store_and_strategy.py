#!/usr/bin/env python3
"""Example 5: Custom Store and Execution Strategy with Agent Lightning.

This example demonstrates advanced configuration options including
custom LightningStore implementations and execution strategies.

Usage:
    python examples/05_custom_store_and_strategy.py

Requirements:
    - Set OPENAI_API_KEY environment variable
    - pip install agentlightning openai
"""

import os
from openai import AsyncOpenAI
import agentlightning as agl

from agent_lightning_showcase.datasets import create_sentiment_dataset
from agent_lightning_showcase.utils.prompt_templates import SENTIMENT_BASELINE_PROMPT


def create_prompt_template() -> agl.PromptTemplate:
    """Create baseline prompt template."""
    return agl.PromptTemplate(
        template=SENTIMENT_BASELINE_PROMPT,
        engine="f-string",
    )


def example_in_memory_store():
    """Example using the InMemoryLightningStore."""
    print("\n--- InMemoryLightningStore Example ---\n")

    # Create an in-memory store (good for development/testing)
    store = agl.InMemoryLightningStore(thread_safe=True)

    print("Store created:", type(store).__name__)
    print("Capabilities:")
    print(f"  - Thread safe: {store.capabilities.thread_safe}")
    print(f"  - Async safe: {store.capabilities.async_safe}")

    openai_client = AsyncOpenAI()

    algorithm = agl.APO(
        openai_client,
        gradient_model="gpt-4o-mini",
        beam_width=2,
        beam_rounds=1,
    )

    # Create trainer with custom store
    trainer = agl.Trainer(
        algorithm=algorithm,
        store=store,
        n_runners=2,
        initial_resources={
            "prompt_template": create_prompt_template(),
        },
    )

    @agl.rollout
    def sentiment_agent(task: dict, prompt_template: agl.PromptTemplate) -> float:
        from agent_lightning_showcase.utils.graders import sentiment_grader

        formatted_prompt = prompt_template.format(text=task["text"])
        response = prompt_template.complete(formatted_prompt)
        reward = sentiment_grader(response, task["expected_sentiment"])
        agl.emit_reward(reward)
        return reward

    train_data, val_data = create_sentiment_dataset()

    try:
        trainer.fit(
            agent=sentiment_agent,
            train_dataset=train_data[:5],
            val_dataset=val_data[:2],
        )
        print("\nTraining with in-memory store completed!")
    except Exception as e:
        print(f"\nError: {e}")


def example_shared_memory_strategy():
    """Example using SharedMemoryExecutionStrategy."""
    print("\n--- SharedMemoryExecutionStrategy Example ---\n")

    print("This strategy runs everything in a single process.")
    print("Good for development and debugging.\n")

    openai_client = AsyncOpenAI()

    algorithm = agl.APO(
        openai_client,
        gradient_model="gpt-4o-mini",
        beam_width=2,
        beam_rounds=1,
    )

    # Use shared memory strategy explicitly
    trainer = agl.Trainer(
        algorithm=algorithm,
        strategy="shared_memory",  # or SharedMemoryExecutionStrategy()
        n_runners=2,
        initial_resources={
            "prompt_template": create_prompt_template(),
        },
    )

    @agl.rollout
    def sentiment_agent(task: dict, prompt_template: agl.PromptTemplate) -> float:
        from agent_lightning_showcase.utils.graders import sentiment_grader

        formatted_prompt = prompt_template.format(text=task["text"])
        response = prompt_template.complete(formatted_prompt)
        reward = sentiment_grader(response, task["expected_sentiment"])
        agl.emit_reward(reward)
        return reward

    train_data, val_data = create_sentiment_dataset()

    try:
        trainer.fit(
            agent=sentiment_agent,
            train_dataset=train_data[:5],
            val_dataset=val_data[:2],
        )
        print("\nShared memory training completed!")
    except Exception as e:
        print(f"\nError: {e}")


def example_client_server_strategy():
    """Example using ClientServerExecutionStrategy."""
    print("\n--- ClientServerExecutionStrategy Example ---\n")

    print("This strategy runs algorithm and runners as separate processes.")
    print("Good for distributed training and production deployments.\n")

    openai_client = AsyncOpenAI()

    algorithm = agl.APO(
        openai_client,
        gradient_model="gpt-4o-mini",
        beam_width=2,
        beam_rounds=1,
    )

    # Use client-server strategy with both roles in one process (for demo)
    trainer = agl.Trainer(
        algorithm=algorithm,
        strategy="client_server",
        port=4747,  # HTTP port for the store server
        n_runners=2,
        initial_resources={
            "prompt_template": create_prompt_template(),
        },
    )

    @agl.rollout
    def sentiment_agent(task: dict, prompt_template: agl.PromptTemplate) -> float:
        from agent_lightning_showcase.utils.graders import sentiment_grader

        formatted_prompt = prompt_template.format(text=task["text"])
        response = prompt_template.complete(formatted_prompt)
        reward = sentiment_grader(response, task["expected_sentiment"])
        agl.emit_reward(reward)
        return reward

    train_data, val_data = create_sentiment_dataset()

    try:
        trainer.fit(
            agent=sentiment_agent,
            train_dataset=train_data[:3],
            val_dataset=val_data[:2],
        )
        print("\nClient-server training completed!")
    except Exception as e:
        print(f"\nError: {e}")


def example_with_hooks():
    """Example using trainer hooks for lifecycle callbacks."""
    print("\n--- Training with Hooks Example ---\n")

    class LoggingHook:
        """Custom hook that logs training events."""

        def on_training_start(self, trainer):
            print("[Hook] Training started!")

        def on_rollout_complete(self, rollout_id, reward):
            print(f"[Hook] Rollout {rollout_id} completed with reward: {reward}")

        def on_round_complete(self, round_num, metrics):
            print(f"[Hook] Round {round_num} complete. Metrics: {metrics}")

        def on_training_end(self, trainer, final_resources):
            print("[Hook] Training ended!")
            print(f"[Hook] Final resources: {list(final_resources.keys())}")

    openai_client = AsyncOpenAI()

    algorithm = agl.APO(
        openai_client,
        gradient_model="gpt-4o-mini",
        beam_width=2,
        beam_rounds=1,
    )

    # Add custom hooks
    trainer = agl.Trainer(
        algorithm=algorithm,
        n_runners=2,
        initial_resources={
            "prompt_template": create_prompt_template(),
        },
        hooks=[LoggingHook()],
    )

    @agl.rollout
    def sentiment_agent(task: dict, prompt_template: agl.PromptTemplate) -> float:
        from agent_lightning_showcase.utils.graders import sentiment_grader

        formatted_prompt = prompt_template.format(text=task["text"])
        response = prompt_template.complete(formatted_prompt)
        reward = sentiment_grader(response, task["expected_sentiment"])
        agl.emit_reward(reward)
        return reward

    train_data, val_data = create_sentiment_dataset()

    try:
        trainer.fit(
            agent=sentiment_agent,
            train_dataset=train_data[:3],
            val_dataset=val_data[:2],
        )
        print("\nTraining with hooks completed!")
    except Exception as e:
        print(f"\nError: {e}")


def main():
    """Run the advanced configuration examples."""
    print("=" * 60)
    print("Agent Lightning Showcase: Custom Store & Strategy")
    print("=" * 60)

    if not os.environ.get("OPENAI_API_KEY"):
        print("\nWarning: OPENAI_API_KEY not set. This is a demo of the API structure.")
        print("Set your API key to run actual training.\n")

    # Run all examples
    example_in_memory_store()
    example_shared_memory_strategy()
    example_client_server_strategy()
    example_with_hooks()

    print("\n" + "=" * 60)
    print("Advanced configuration examples complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()
