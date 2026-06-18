"""Render a ReviewResult as Markdown (for PR comments) or plain text (for the terminal)."""

from __future__ import annotations

from .reviewer import ReviewResult, Finding

SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3, "nit": 4}
SEVERITY_EMOJI = {
    "critical": "🔴",
    "high": "🟠",
    "medium": "🟡",
    "low": "🔵",
    "nit": "⚪",
}
VERDICT_LABEL = {
    "approve": "✅ Approve",
    "comment": "💬 Comment",
    "request_changes": "🛑 Request changes",
}


def _sorted(findings: list[Finding]) -> list[Finding]:
    return sorted(findings, key=lambda f: SEVERITY_ORDER.get(f.severity, 99))


def to_markdown(result: ReviewResult) -> str:
    lines = ["## 🤖 MR Review Agent", ""]
    lines.append(f"**Verdict:** {VERDICT_LABEL.get(result.verdict, result.verdict)}")
    lines.append("")
    lines.append(result.summary.strip() or "_No summary provided._")
    lines.append("")

    if not result.findings:
        lines.append("No issues found. 🎉")
        return "\n".join(lines)

    lines.append(f"### Findings ({len(result.findings)})")
    lines.append("")
    for f in _sorted(result.findings):
        emoji = SEVERITY_EMOJI.get(f.severity, "•")
        loc = f.file + (f":{f.line}" if f.line else "")
        lines.append(
            f"#### {emoji} {f.title}  "
            f"<sub>{f.severity} · {f.category} · confidence: {f.confidence}</sub>"
        )
        lines.append(f"`{loc}`")
        lines.append("")
        lines.append(f.detail.strip())
        if f.suggestion:
            lines.append("")
            lines.append("**Suggestion:**")
            lines.append("")
            lines.append("```")
            lines.append(f.suggestion.strip())
            lines.append("```")
        lines.append("")
    return "\n".join(lines)


def to_terminal(result: ReviewResult) -> str:
    lines = []
    lines.append(f"Verdict: {result.verdict}")
    lines.append("")
    lines.append(result.summary.strip())
    lines.append("")
    if not result.findings:
        lines.append("No issues found.")
        return "\n".join(lines)
    lines.append(f"Findings ({len(result.findings)}):")
    for f in _sorted(result.findings):
        loc = f.file + (f":{f.line}" if f.line else "")
        lines.append("")
        lines.append(f"  [{f.severity.upper()}] {f.title}  ({f.category}, {f.confidence} confidence)")
        lines.append(f"    {loc}")
        for detail_line in f.detail.strip().splitlines():
            lines.append(f"    {detail_line}")
        if f.suggestion:
            lines.append("    Suggestion:")
            for sug_line in f.suggestion.strip().splitlines():
                lines.append(f"      {sug_line}")
    return "\n".join(lines)
