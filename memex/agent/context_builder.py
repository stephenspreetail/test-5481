from __future__ import annotations

from typing import List

from memex.core.experience import Experience

# Approximate chars-per-token ratio (conservative)
_CHARS_PER_TOKEN = 4


class ContextBuilder:
    """
    Formats retrieved experiences into a structured prompt block
    inserted before the user instruction in a Claude messages call.
    """

    def __init__(
        self,
        max_experiences: int = 5,
        max_tokens_per_exp: int = 200,
    ) -> None:
        self._max_experiences = max_experiences
        self._max_chars = max_tokens_per_exp * _CHARS_PER_TOKEN

    def build_memory_block(self, experiences: List[Experience]) -> str:
        if not experiences:
            return ""

        lines = ["## Relevant Past Experiences\n"]
        for i, exp in enumerate(experiences[: self._max_experiences], 1):
            snippet = exp.to_context_snippet(max_chars=self._max_chars)
            lines.append(
                f"Experience {i} (importance={exp.importance:.2f}):\n"
                f"{snippet}\n"
            )
        lines.append("---")
        return "\n".join(lines)

    def build_system_prompt(self, base_prompt: str, memory_block: str) -> str:
        if not memory_block:
            return base_prompt
        return f"{base_prompt}\n\n{memory_block}"
