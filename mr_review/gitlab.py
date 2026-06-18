"""Post a review back to a GitLab merge request.

GitLab has no single "review" object like GitHub, so the agent:

* opens an inline discussion for each finding that anchors to a changed line,
* posts the full review as a summary note, and
* optionally approves the MR (opt-in).

Inline anchoring needs the MR's ``diff_refs`` (base/start/head SHAs); if those are
missing the findings are rolled into the summary note instead.
"""

from __future__ import annotations

from urllib.parse import quote

import requests

from .diff_source import ChangeSet
from .formatter import to_markdown
from .reviewer import ReviewResult


def _base_url(api_root: str, project: str, mr_iid: int) -> str:
    encoded = quote(str(project), safe="")
    return f"{api_root.rstrip('/')}/api/v4/projects/{encoded}/merge_requests/{mr_iid}"


def _finding_body(f) -> str:
    body = f"**{f.severity}/{f.category}: {f.title}**\n\n{f.detail}"
    if f.suggestion:
        body += f"\n\n```suggestion\n{f.suggestion}\n```"
    return body


def post_review(
    change: ChangeSet,
    result: ReviewResult,
    token: str,
    api_root: str = "https://gitlab.com",
    approve_enabled: bool = False,
) -> dict:
    if not (change.project and change.mr_iid):
        raise ValueError("ChangeSet is missing GitLab context (project/mr_iid).")

    base = _base_url(api_root, change.project, change.mr_iid)
    headers = {"PRIVATE-TOKEN": token}
    changed = set(change.files)
    diff_refs = change.diff_refs or {}
    can_inline = all(diff_refs.get(k) for k in ("base_sha", "start_sha", "head_sha"))

    leftover: list[str] = []
    for f in result.findings:
        body = _finding_body(f)
        anchored = False
        if f.line and f.file in changed and can_inline:
            payload = {"body": body}
            position = {
                "base_sha": diff_refs["base_sha"],
                "start_sha": diff_refs["start_sha"],
                "head_sha": diff_refs["head_sha"],
                "position_type": "text",
                "new_path": f.file,
                "old_path": change.path_map.get(f.file, f.file),
                "new_line": f.line,
            }
            for key, value in position.items():
                payload[f"position[{key}]"] = value
            resp = requests.post(f"{base}/discussions", headers=headers, data=payload, timeout=30)
            anchored = resp.ok
        if not anchored:
            loc = f.file + (f":{f.line}" if f.line else "")
            leftover.append(f"- `{loc}` — {body}")

    note_body = to_markdown(result)
    if leftover:
        note_body += "\n\n### Additional findings (not anchored to a diff line)\n\n" + "\n\n".join(leftover)

    note = requests.post(f"{base}/notes", headers=headers, data={"body": note_body}, timeout=30)
    note.raise_for_status()

    if result.verdict == "approve" and approve_enabled:
        approve = requests.post(f"{base}/approve", headers=headers, timeout=30)
        # Approval can be disabled or unpermitted on a project; don't fail the run for it.
        if not approve.ok and approve.status_code not in (401, 403, 404):
            approve.raise_for_status()

    return note.json()
