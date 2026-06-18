"""mr_review — an AI merge-request / pull-request review agent powered by Claude."""

from .reviewer import Reviewer, ReviewResult, Finding
from .config import Config

__all__ = ["Reviewer", "ReviewResult", "Finding", "Config"]
__version__ = "0.1.0"
