#!/usr/bin/env python3
"""Example 4: Multi-Agent Pipeline Training with Agent Lightning.

This example demonstrates training a multi-agent system where
multiple specialized agents work together in a pipeline.

Usage:
    python examples/04_multi_agent_pipeline.py

Requirements:
    - Set OPENAI_API_KEY environment variable
    - pip install agentlightning openai
"""

import os
from openai import AsyncOpenAI
import agentlightning as agl

from agent_lightning_showcase.agents.multi_agent import (
    MultiAgentPipeline,
    create_multi_agent_dataset,
)
from agent_lightning_showcase.utils.prompt_templates import (
    SENTIMENT_BASELINE_PROMPT,
    QA_BASELINE_PROMPT,
)


def create_analyzer_prompt() -> agl.PromptTemplate:
    """Create prompt template for the analyzer agent."""
    return agl.PromptTemplate(
        template=SENTIMENT_BASELINE_PROMPT,
        engine="f-string",
    )


def create_responder_prompt() -> agl.PromptTemplate:
    """Create prompt template for the responder agent."""
    enhanced_qa_prompt = """You are a helpful assistant that answers questions about text.
The text has been analyzed and may include sentiment information.

Context: {context}

Question: {question}

Provide a clear, concise answer based on the context above."""

    return agl.PromptTemplate(
        template=enhanced_qa_prompt,
        engine="f-string",
    )


def run_pipeline_training():
    """Train the multi-agent pipeline."""
    print("\n--- Multi-Agent Pipeline Training ---\n")

    openai_client = AsyncOpenAI()

    # Configure APO for multi-resource optimization
    # Note: APO currently optimizes one template at a time
    # For multi-agent training, you might train each agent separately
    algorithm = agl.APO(
        openai_client,
        gradient_model="gpt-4o-mini",
        apply_edit_model="gpt-4o-mini",
        beam_width=2,
        beam_rounds=2,
    )

    # Create the multi-agent pipeline
    pipeline = MultiAgentPipeline()

    # Configure trainer with resources for both agents
    trainer = agl.Trainer(
        algorithm=algorithm,
        n_runners=4,
        initial_resources={
            "analyzer_prompt": create_analyzer_prompt(),
            "responder_prompt": create_responder_prompt(),
        },
        adapter=agl.TraceToMessages(),
    )

    train_dataset, val_dataset = create_multi_agent_dataset()

    print("Multi-Agent Pipeline Structure:")
    print("  1. Analyzer Agent → Sentiment Classification")
    print("  2. Responder Agent → Question Answering (with sentiment context)")
    print(f"\nTraining samples: {len(train_dataset)}")
    print(f"Validation samples: {len(val_dataset)}")

    print("\nStarting pipeline training...")

    try:
        trainer.fit(
            agent=pipeline,
            train_dataset=train_dataset,
            val_dataset=val_dataset,
        )
        print("\nPipeline training completed!")
    except Exception as e:
        print(f"\nTraining error: {e}")


def run_selective_agent_training():
    """Train individual agents in the pipeline selectively."""
    print("\n--- Selective Agent Training ---\n")

    openai_client = AsyncOpenAI()

    # Train the analyzer agent first
    print("Phase 1: Training Analyzer Agent...")

    from agent_lightning_showcase.agents.multi_agent import analyzer_agent

    analyzer_algorithm = agl.APO(
        openai_client,
        gradient_model="gpt-4o-mini",
        beam_width=2,
        beam_rounds=2,
    )

    analyzer_trainer = agl.Trainer(
        algorithm=analyzer_algorithm,
        n_runners=4,
        initial_resources={
            "prompt_template": create_analyzer_prompt(),
        },
    )

    train_dataset, val_dataset = create_multi_agent_dataset()

    try:
        analyzer_trainer.fit(
            agent=analyzer_agent,
            train_dataset=train_dataset,
            val_dataset=val_dataset,
        )
        print("Analyzer agent training completed!")
    except Exception as e:
        print(f"Analyzer training error: {e}")

    # Train the responder agent next
    print("\nPhase 2: Training Responder Agent...")

    from agent_lightning_showcase.agents.multi_agent import responder_agent

    responder_algorithm = agl.APO(
        openai_client,
        gradient_model="gpt-4o-mini",
        beam_width=2,
        beam_rounds=2,
    )

    responder_trainer = agl.Trainer(
        algorithm=responder_algorithm,
        n_runners=4,
        initial_resources={
            "prompt_template": create_responder_prompt(),
        },
    )

    try:
        responder_trainer.fit(
            agent=responder_agent,
            train_dataset=train_dataset,
            val_dataset=val_dataset,
        )
        print("Responder agent training completed!")
    except Exception as e:
        print(f"Responder training error: {e}")


def main():
    """Run the multi-agent training examples."""
    print("=" * 60)
    print("Agent Lightning Showcase: Multi-Agent Pipeline Training")
    print("=" * 60)

    if not os.environ.get("OPENAI_API_KEY"):
        print("\nWarning: OPENAI_API_KEY not set. This is a demo of the API structure.")
        print("Set your API key to run actual training.\n")

    # Run both approaches
    run_pipeline_training()
    run_selective_agent_training()

    print("\n" + "=" * 60)
    print("Multi-agent training examples complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()
