"""Runtime configuration for the review agent.

Everything is overridable via environment variables so the agent behaves the
same on a laptop and inside CI.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

# Default to the most capable Opus-tier model. Override with MR_REVIEW_MODEL.
DEFAULT_MODEL = "claude-opus-4-8"

# Diffs and reviews can be large; stream and give the model room to work.
DEFAULT_MAX_TOKENS = 16000

# A single diff that exceeds this many characters is truncated before being
# sent to the model, with a marker so the model knows the input was clipped.
DEFAULT_MAX_DIFF_CHARS = 400_000


@dataclass
class Config:
    model: str = DEFAULT_MODEL
    max_tokens: int = DEFAULT_MAX_TOKENS
    effort: str = "high"
    max_diff_chars: int = DEFAULT_MAX_DIFF_CHARS
    api_key: str | None = None

    @classmethod
    def from_env(cls) -> "Config":
        return cls(
            model=os.environ.get("MR_REVIEW_MODEL", DEFAULT_MODEL),
            max_tokens=int(os.environ.get("MR_REVIEW_MAX_TOKENS", DEFAULT_MAX_TOKENS)),
            effort=os.environ.get("MR_REVIEW_EFFORT", "high"),
            max_diff_chars=int(
                os.environ.get("MR_REVIEW_MAX_DIFF_CHARS", DEFAULT_MAX_DIFF_CHARS)
            ),
            api_key=os.environ.get("ANTHROPIC_API_KEY"),
        )
