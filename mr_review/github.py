"""Post a review back to a GitHub pull request.

Inline comments are placed on findings that carry a line number and target a file
in the PR diff; everything else is rolled into the review body. The review event
is derived from the model's verdict.
"""

from __future__ import annotations

import requests

from .diff_source import ChangeSet
from .formatter import to_markdown
from .reviewer import ReviewResult

API_ROOT = "https://api.github.com"

VERDICT_TO_EVENT = {
    "approve": "APPROVE",
    "comment": "COMMENT",
    "request_changes": "REQUEST_CHANGES",
}


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def post_review(
    change: ChangeSet,
    result: ReviewResult,
    token: str,
    api_root: str = API_ROOT,
    approve_enabled: bool = False,
) -> dict:
    """Create a PR review with inline comments where possible."""
    if not (change.repo and change.pr_number and change.head_sha):
        raise ValueError("ChangeSet is missing GitHub context (repo/pr_number/head_sha).")

    changed = set(change.files)
    inline = []
    leftover = []
    for f in result.findings:
        body = f"**{f.severity}/{f.category}: {f.title}**\n\n{f.detail}"
        if f.suggestion:
            body += f"\n\n```suggestion\n{f.suggestion}\n```"
        if f.line and f.file in changed:
            inline.append({"path": f.file, "line": f.line, "side": "RIGHT", "body": body})
        else:
            loc = f.file + (f":{f.line}" if f.line else "")
            leftover.append(f"- `{loc}` — {body}")

    body = to_markdown(result)
    if leftover:
        body += "\n\n### Additional findings (not anchored to a diff line)\n\n" + "\n\n".join(leftover)

    # A PR author cannot APPROVE/REQUEST_CHANGES their own PR, and auto-approval
    # is opt-in; fall back to a plain COMMENT review otherwise.
    event = VERDICT_TO_EVENT.get(result.verdict, "COMMENT")
    if event == "APPROVE" and not approve_enabled:
        event = "COMMENT"

    payload = {
        "commit_id": change.head_sha,
        "body": body,
        "event": event,
        "comments": inline,
    }
    resp = requests.post(
        f"{api_root}/repos/{change.repo}/pulls/{change.pr_number}/reviews",
        headers=_headers(token),
        json=payload,
        timeout=30,
    )
    if resp.status_code == 422 and inline:
        # Inline comment anchoring can fail if a line isn't in the diff hunk;
        # retry once with everything in the body so the review still lands.
        payload["comments"] = []
        payload["body"] = body + "\n\n_(inline comments could not be anchored)_"
        resp = requests.post(
            f"{api_root}/repos/{change.repo}/pulls/{change.pr_number}/reviews",
            headers=_headers(token),
            json=payload,
            timeout=30,
        )
    resp.raise_for_status()
    return resp.json()
