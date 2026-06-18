"""The review brain: send a changeset to Claude and get structured findings back."""

from __future__ import annotations

import json
from dataclasses import dataclass, field

import anthropic

from .config import Config
from .diff_source import ChangeSet

SEVERITIES = ["critical", "high", "medium", "low", "nit"]
CATEGORIES = [
    "correctness",
    "security",
    "performance",
    "maintainability",
    "testing",
    "style",
    "other",
]

SYSTEM_PROMPT = """\
You are an experienced staff engineer performing a merge-request review. You are \
thorough, fair, and concrete.

Review the diff for real problems a human reviewer would flag: correctness bugs, \
security issues, performance regressions, missing or wrong tests, and significant \
maintainability concerns. Comment on the changed lines, not the pre-existing code \
around them.

Guidance:
- Report every issue you find, including ones you are uncertain about. Give each a \
confidence and severity so they can be ranked or filtered downstream — do not \
silently drop a finding because it seems minor.
- Anchor each finding to a specific file and, where possible, a line number from the \
diff's new-file side (the numbers after the @@ hunk header).
- Prefer a small number of high-value findings over a flood of style nits. Mark pure \
style/preference points as severity "nit".
- For each finding, explain the problem and suggest a concrete fix.
- The "summary" should give the author a quick, honest read on the change: what it \
does well and what most needs attention. Recommend approve / comment / request \
changes via the "verdict" field.
- If the diff is clean, say so plainly and return an empty findings list.
"""

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {
            "type": "string",
            "description": "A short overall assessment of the change for the author.",
        },
        "verdict": {
            "type": "string",
            "enum": ["approve", "comment", "request_changes"],
        },
        "findings": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "file": {"type": "string"},
                    "line": {
                        "type": ["integer", "null"],
                        "description": "Line number on the new side of the diff, or null.",
                    },
                    "severity": {"type": "string", "enum": SEVERITIES},
                    "category": {"type": "string", "enum": CATEGORIES},
                    "confidence": {
                        "type": "string",
                        "enum": ["high", "medium", "low"],
                    },
                    "title": {"type": "string"},
                    "detail": {"type": "string"},
                    "suggestion": {
                        "type": ["string", "null"],
                        "description": "A concrete fix, or null if none applies.",
                    },
                },
                "required": [
                    "file",
                    "line",
                    "severity",
                    "category",
                    "confidence",
                    "title",
                    "detail",
                    "suggestion",
                ],
                "additionalProperties": False,
            },
        },
    },
    "required": ["summary", "verdict", "findings"],
    "additionalProperties": False,
}


@dataclass
class Finding:
    file: str
    line: int | None
    severity: str
    category: str
    confidence: str
    title: str
    detail: str
    suggestion: str | None = None

    @classmethod
    def from_dict(cls, d: dict) -> "Finding":
        return cls(
            file=d.get("file", "?"),
            line=d.get("line"),
            severity=d.get("severity", "low"),
            category=d.get("category", "other"),
            confidence=d.get("confidence", "low"),
            title=d.get("title", ""),
            detail=d.get("detail", ""),
            suggestion=d.get("suggestion"),
        )


@dataclass
class ReviewResult:
    summary: str
    verdict: str
    findings: list[Finding] = field(default_factory=list)

    @property
    def has_blocking_findings(self) -> bool:
        return any(f.severity in ("critical", "high") for f in self.findings)


class Reviewer:
    def __init__(self, config: Config | None = None):
        self.config = config or Config.from_env()
        self.client = anthropic.Anthropic(api_key=self.config.api_key)

    def _build_user_message(self, change: ChangeSet) -> str:
        diff = change.diff
        truncated = ""
        if len(diff) > self.config.max_diff_chars:
            diff = diff[: self.config.max_diff_chars]
            truncated = (
                "\n\n[diff truncated: it exceeded the size limit; review what is "
                "shown and note that the change is larger than this excerpt]"
            )
        files = "\n".join(f"- {f}" for f in change.files) or "(file list unavailable)"
        return (
            f"Title: {change.title}\n\n"
            f"Description:\n{change.description or '(none)'}\n\n"
            f"Changed files:\n{files}\n\n"
            f"Unified diff:\n```diff\n{diff}\n```{truncated}"
        )

    def review(self, change: ChangeSet) -> ReviewResult:
        user_message = self._build_user_message(change)

        # Stream so large diffs/reviews don't trip request timeouts; collect the
        # final structured message at the end.
        with self.client.messages.stream(
            model=self.config.model,
            max_tokens=self.config.max_tokens,
            thinking={"type": "adaptive"},
            output_config={
                "effort": self.config.effort,
                "format": {"type": "json_schema", "schema": OUTPUT_SCHEMA},
            },
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        ) as stream:
            message = stream.get_final_message()

        if message.stop_reason == "refusal":
            raise RuntimeError(
                "The model declined to review this change "
                f"(stop_reason=refusal, details={message.stop_details})."
            )

        text = next((b.text for b in message.content if b.type == "text"), "")
        try:
            data = json.loads(text)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"Model did not return valid JSON: {exc}\n{text[:500]}")

        return ReviewResult(
            summary=data.get("summary", ""),
            verdict=data.get("verdict", "comment"),
            findings=[Finding.from_dict(f) for f in data.get("findings", [])],
        )
