"""Grading functions to evaluate agent outputs and compute rewards."""

import re
from typing import Optional


def sentiment_grader(prediction: str, expected: str) -> float:
    """Grade sentiment classification predictions.

    Args:
        prediction: The model's sentiment prediction
        expected: The expected sentiment label

    Returns:
        Reward score between 0.0 and 1.0
    """
    prediction_clean = prediction.strip().lower()
    expected_clean = expected.strip().lower()

    # Extract sentiment label from prediction
    valid_labels = ["positive", "negative", "neutral"]
    predicted_label = None

    for label in valid_labels:
        if label in prediction_clean:
            predicted_label = label
            break

    if predicted_label is None:
        return 0.0

    return 1.0 if predicted_label == expected_clean else 0.0


def qa_grader(prediction: str, expected: str, partial_match: bool = True) -> float:
    """Grade question answering predictions.

    Args:
        prediction: The model's answer
        expected: The expected answer
        partial_match: Whether to allow partial matches for partial credit

    Returns:
        Reward score between 0.0 and 1.0
    """
    prediction_clean = prediction.strip().lower()
    expected_clean = expected.strip().lower()

    # Exact match
    if prediction_clean == expected_clean:
        return 1.0

    # Check if expected answer is contained in prediction
    if expected_clean in prediction_clean:
        return 0.8

    if partial_match:
        # Word-level overlap scoring
        pred_words = set(re.findall(r'\w+', prediction_clean))
        exp_words = set(re.findall(r'\w+', expected_clean))

        if not exp_words:
            return 0.0

        overlap = len(pred_words & exp_words)
        precision = overlap / len(pred_words) if pred_words else 0
        recall = overlap / len(exp_words)

        if precision + recall == 0:
            return 0.0

        f1 = 2 * (precision * recall) / (precision + recall)
        return round(f1 * 0.6, 2)  # Cap partial match at 0.6

    return 0.0


def math_grader(prediction: str, expected: float, tolerance: float = 0.01) -> float:
    """Grade math problem solutions.

    Args:
        prediction: The model's solution text
        expected: The expected numerical answer
        tolerance: Relative tolerance for numerical comparison

    Returns:
        Reward score between 0.0 and 1.0
    """
    # Try to extract a number from the prediction
    numbers = re.findall(r'-?\d+\.?\d*', prediction)

    if not numbers:
        return 0.0

    # Check the last number (usually the final answer)
    try:
        predicted_value = float(numbers[-1])
    except ValueError:
        return 0.0

    # Check for exact or near match
    if abs(expected) < 1e-10:
        if abs(predicted_value) < tolerance:
            return 1.0
    else:
        relative_error = abs(predicted_value - expected) / abs(expected)
        if relative_error < tolerance:
            return 1.0
        elif relative_error < tolerance * 10:
            return 0.5  # Partial credit for close answers

    return 0.0


def extract_answer_from_response(response: str, answer_prefix: str = "Answer:") -> Optional[str]:
    """Extract the answer portion from a model response.

    Args:
        response: The full model response
        answer_prefix: The prefix that marks the answer section

    Returns:
        The extracted answer or None if not found
    """
    if answer_prefix in response:
        parts = response.split(answer_prefix)
        if len(parts) > 1:
            return parts[-1].strip()
    return response.strip()
