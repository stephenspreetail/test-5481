from unittest.mock import patch, MagicMock

from mr_review.github import post_review, VERDICT_TO_EVENT
from mr_review.diff_source import ChangeSet
from mr_review.reviewer import ReviewResult, Finding


def _change():
    return ChangeSet(
        title="t",
        description="d",
        diff="diff",
        repo="owner/name",
        pr_number=7,
        head_sha="abc123",
        files=["a.py", "b.py"],
    )


def _result():
    return ReviewResult(
        summary="s",
        verdict="request_changes",
        findings=[
            Finding("a.py", 10, "high", "correctness", "high", "Bug", "boom", "fix it"),
            Finding("missing.py", None, "low", "style", "low", "Nit", "x", None),
        ],
    )


def test_post_review_builds_inline_and_leftover():
    with patch("mr_review.github.requests.post") as mock_post:
        mock_post.return_value = MagicMock(status_code=200)
        mock_post.return_value.json.return_value = {"html_url": "u"}
        post_review(_change(), _result(), token="tok")

        payload = mock_post.call_args.kwargs["json"]
        assert payload["event"] == VERDICT_TO_EVENT["request_changes"]
        # a.py:10 is in the diff -> inline; missing.py has no line -> leftover in body
        assert len(payload["comments"]) == 1
        assert payload["comments"][0]["path"] == "a.py"
        assert "Additional findings" in payload["body"]


def test_approval_downgrades_without_optin():
    res = ReviewResult(summary="s", verdict="approve", findings=[])
    with patch("mr_review.github.requests.post") as mock_post:
        mock_post.return_value = MagicMock(status_code=200)
        mock_post.return_value.json.return_value = {}
        post_review(_change(), res, token="tok", approve_enabled=False)
        assert mock_post.call_args.kwargs["json"]["event"] == "COMMENT"
