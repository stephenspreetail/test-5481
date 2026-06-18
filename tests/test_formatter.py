from mr_review.formatter import to_markdown, to_terminal, _sorted
from mr_review.reviewer import ReviewResult, Finding


def _result():
    return ReviewResult(
        summary="Looks mostly good, one real bug.",
        verdict="request_changes",
        findings=[
            Finding("a.py", 12, "nit", "style", "low", "Rename var", "x is unclear", None),
            Finding("b.py", 5, "critical", "security", "high", "SQLi", "unsanitized input", "use params"),
        ],
    )


def test_sorted_orders_by_severity():
    ordered = _sorted(_result().findings)
    assert ordered[0].severity == "critical"
    assert ordered[-1].severity == "nit"


def test_markdown_contains_key_parts():
    md = to_markdown(_result())
    assert "MR Review Agent" in md
    assert "Request changes" in md
    assert "SQLi" in md
    assert "b.py:5" in md
    assert "use params" in md


def test_markdown_clean_review():
    md = to_markdown(ReviewResult(summary="Clean.", verdict="approve", findings=[]))
    assert "No issues found" in md


def test_terminal_output():
    txt = to_terminal(_result())
    assert "Verdict: request_changes" in txt
    assert "[CRITICAL]" in txt


def test_blocking_detection():
    assert _result().has_blocking_findings is True
    clean = ReviewResult(summary="", verdict="approve", findings=[])
    assert clean.has_blocking_findings is False
