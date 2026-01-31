"""Sample datasets for training and evaluating agents."""

from typing import TypedDict


class SentimentTask(TypedDict):
    """Task structure for sentiment classification."""
    text: str
    expected_sentiment: str


class QATask(TypedDict):
    """Task structure for question answering."""
    context: str
    question: str
    expected_answer: str


class MathTask(TypedDict):
    """Task structure for math problems."""
    problem: str
    expected_answer: float


def create_sentiment_dataset() -> tuple[list[SentimentTask], list[SentimentTask]]:
    """Create training and validation datasets for sentiment analysis.

    Returns:
        Tuple of (train_dataset, val_dataset)
    """
    train_data: list[SentimentTask] = [
        {"text": "I absolutely love this product! It exceeded all my expectations.", "expected_sentiment": "positive"},
        {"text": "This is the worst purchase I've ever made. Complete waste of money.", "expected_sentiment": "negative"},
        {"text": "The product arrived on time and works as described.", "expected_sentiment": "neutral"},
        {"text": "Amazing customer service! They went above and beyond to help me.", "expected_sentiment": "positive"},
        {"text": "Very disappointed with the quality. It broke after one week.", "expected_sentiment": "negative"},
        {"text": "It's okay, nothing special but gets the job done.", "expected_sentiment": "neutral"},
        {"text": "Best decision I ever made! Highly recommend to everyone!", "expected_sentiment": "positive"},
        {"text": "Terrible experience from start to finish. Never buying again.", "expected_sentiment": "negative"},
        {"text": "The item matches the description. Standard shipping time.", "expected_sentiment": "neutral"},
        {"text": "So happy with my purchase! The quality is outstanding.", "expected_sentiment": "positive"},
        {"text": "Broken on arrival and customer support was unhelpful.", "expected_sentiment": "negative"},
        {"text": "Average product for the price. Nothing exceptional.", "expected_sentiment": "neutral"},
        {"text": "Exceeded expectations in every way! Will buy again!", "expected_sentiment": "positive"},
        {"text": "Don't waste your money. Poor quality and misleading description.", "expected_sentiment": "negative"},
        {"text": "Does what it's supposed to do. No complaints.", "expected_sentiment": "neutral"},
    ]

    val_data: list[SentimentTask] = [
        {"text": "Fantastic! I couldn't be happier with this purchase.", "expected_sentiment": "positive"},
        {"text": "Regret buying this. It's cheaply made and doesn't work properly.", "expected_sentiment": "negative"},
        {"text": "It's a standard product. Works fine for basic needs.", "expected_sentiment": "neutral"},
        {"text": "Wonderful experience! The product is exactly what I needed.", "expected_sentiment": "positive"},
        {"text": "Extremely frustrating. The instructions were wrong and it still doesn't work.", "expected_sentiment": "negative"},
    ]

    return train_data, val_data


def create_qa_dataset() -> tuple[list[QATask], list[QATask]]:
    """Create training and validation datasets for question answering.

    Returns:
        Tuple of (train_dataset, val_dataset)
    """
    train_data: list[QATask] = [
        {
            "context": "The Eiffel Tower is a wrought-iron lattice tower located on the Champ de Mars in Paris, France. It was constructed from 1887 to 1889 and stands 330 meters tall.",
            "question": "How tall is the Eiffel Tower?",
            "expected_answer": "330 meters"
        },
        {
            "context": "Python is a high-level programming language created by Guido van Rossum. It was first released in 1991 and emphasizes code readability.",
            "question": "Who created Python?",
            "expected_answer": "Guido van Rossum"
        },
        {
            "context": "The Amazon River is the largest river by discharge volume of water in the world. It flows through Brazil, Peru, and Colombia.",
            "question": "Which countries does the Amazon River flow through?",
            "expected_answer": "Brazil, Peru, and Colombia"
        },
        {
            "context": "Microsoft was founded by Bill Gates and Paul Allen on April 4, 1975. The company is headquartered in Redmond, Washington.",
            "question": "When was Microsoft founded?",
            "expected_answer": "April 4, 1975"
        },
        {
            "context": "The speed of light in a vacuum is approximately 299,792 kilometers per second. This is often rounded to 300,000 km/s for calculations.",
            "question": "What is the speed of light?",
            "expected_answer": "299,792 kilometers per second"
        },
        {
            "context": "Mount Everest is Earth's highest mountain above sea level, located in the Mahalangur Himal sub-range of the Himalayas. Its peak is 8,848.86 meters above sea level.",
            "question": "What is the height of Mount Everest?",
            "expected_answer": "8,848.86 meters"
        },
        {
            "context": "The Great Wall of China is a series of fortifications made of stone, brick, and other materials. It was built over many centuries starting from the 7th century BC.",
            "question": "What materials was the Great Wall of China made of?",
            "expected_answer": "stone, brick, and other materials"
        },
        {
            "context": "Albert Einstein developed the theory of relativity in the early 20th century. His famous equation E=mc² describes the relationship between energy and mass.",
            "question": "What is Einstein's famous equation?",
            "expected_answer": "E=mc²"
        },
    ]

    val_data: list[QATask] = [
        {
            "context": "The Mona Lisa was painted by Leonardo da Vinci in the early 16th century. It is currently displayed at the Louvre Museum in Paris.",
            "question": "Where is the Mona Lisa displayed?",
            "expected_answer": "the Louvre Museum in Paris"
        },
        {
            "context": "The human heart beats approximately 100,000 times per day. It pumps about 2,000 gallons of blood through the body daily.",
            "question": "How many times does the human heart beat per day?",
            "expected_answer": "100,000 times"
        },
        {
            "context": "The first iPhone was released by Apple on June 29, 2007. It revolutionized the smartphone industry with its touchscreen interface.",
            "question": "When was the first iPhone released?",
            "expected_answer": "June 29, 2007"
        },
    ]

    return train_data, val_data


def create_math_dataset() -> tuple[list[MathTask], list[MathTask]]:
    """Create training and validation datasets for math problems.

    Returns:
        Tuple of (train_dataset, val_dataset)
    """
    train_data: list[MathTask] = [
        {"problem": "Calculate 15 + 27", "expected_answer": 42.0},
        {"problem": "What is 144 divided by 12?", "expected_answer": 12.0},
        {"problem": "If a rectangle has length 8 and width 5, what is its area?", "expected_answer": 40.0},
        {"problem": "Solve: 3x + 7 = 22. What is x?", "expected_answer": 5.0},
        {"problem": "What is 25% of 200?", "expected_answer": 50.0},
        {"problem": "Calculate the perimeter of a square with side length 9.", "expected_answer": 36.0},
        {"problem": "If you have 45 apples and give away 18, how many remain?", "expected_answer": 27.0},
        {"problem": "What is 7 squared plus 3 squared?", "expected_answer": 58.0},
        {"problem": "A train travels 240 miles in 4 hours. What is its speed in mph?", "expected_answer": 60.0},
        {"problem": "Calculate 15 * 8 - 20", "expected_answer": 100.0},
    ]

    val_data: list[MathTask] = [
        {"problem": "What is the sum of 123 and 456?", "expected_answer": 579.0},
        {"problem": "Calculate the area of a circle with radius 5 (use π = 3.14)", "expected_answer": 78.5},
        {"problem": "If 2x - 5 = 11, what is x?", "expected_answer": 8.0},
        {"problem": "What is 75% of 80?", "expected_answer": 60.0},
    ]

    return train_data, val_data
