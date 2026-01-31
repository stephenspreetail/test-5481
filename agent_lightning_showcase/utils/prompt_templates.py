"""Baseline prompt templates for agent training."""

SENTIMENT_BASELINE_PROMPT = """You are a sentiment analysis assistant.
Analyze the sentiment of the following text and classify it as one of:
- positive
- negative
- neutral

Text: {text}

Respond with only the sentiment label (positive, negative, or neutral)."""


QA_BASELINE_PROMPT = """You are a helpful question answering assistant.
Answer the following question based on the provided context.
If the answer cannot be found in the context, say "I don't know."

Context: {context}

Question: {question}

Answer:"""


MATH_BASELINE_PROMPT = """You are a math problem solver.
Solve the following math problem step by step.
Show your work and provide the final numerical answer.

Problem: {problem}

Solution:"""


def get_prompt_template(template_type: str) -> str:
    """Get a baseline prompt template by type.

    Args:
        template_type: One of 'sentiment', 'qa', or 'math'

    Returns:
        The baseline prompt template string
    """
    templates = {
        "sentiment": SENTIMENT_BASELINE_PROMPT,
        "qa": QA_BASELINE_PROMPT,
        "math": MATH_BASELINE_PROMPT,
    }
    if template_type not in templates:
        raise ValueError(f"Unknown template type: {template_type}. Choose from {list(templates.keys())}")
    return templates[template_type]
