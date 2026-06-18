"""Where the agent gets the change to review.

Two sources are supported:

* ``GitDiffSource`` — a local ``git diff`` between two refs (works anywhere a
  repo is checked out).
* ``GitHubPRSource`` — a pull request fetched from the GitHub REST API (the diff
  plus the metadata needed to post a review back).
"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass, field
from urllib.parse import quote

import requests


@dataclass
class ChangeSet:
    """A unit of work for the reviewer: a title, an optional description, and a diff."""

    title: str
    description: str
    diff: str
    # GitHub-only context, used when posting the review back.
    repo: str | None = None
    pr_number: int | None = None
    head_sha: str | None = None
    files: list[str] = field(default_factory=list)
    # GitLab-only context, used when posting the review back.
    project: str | None = None
    mr_iid: int | None = None
    diff_refs: dict | None = None
    # new_path -> old_path, needed to anchor GitLab inline comments on renames.
    path_map: dict[str, str] = field(default_factory=dict)


class GitDiffSource:
    """A diff produced locally by git."""

    def __init__(self, base: str = "origin/main", head: str = "HEAD", cwd: str | None = None):
        self.base = base
        self.head = head
        self.cwd = cwd

    def _git(self, *args: str) -> str:
        result = subprocess.run(
            ["git", *args],
            cwd=self.cwd,
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout

    def fetch(self) -> ChangeSet:
        diff_range = f"{self.base}...{self.head}"
        diff = self._git("diff", "--no-color", diff_range)
        files = [f for f in self._git("diff", "--name-only", diff_range).splitlines() if f]
        try:
            subject = self._git("log", "-1", "--format=%s", self.head).strip()
            body = self._git("log", "-1", "--format=%b", self.head).strip()
        except subprocess.CalledProcessError:
            subject, body = diff_range, ""
        return ChangeSet(
            title=subject or diff_range,
            description=body,
            diff=diff,
            files=files,
        )


class GitHubPRSource:
    """A pull request fetched from the GitHub REST API."""

    API_ROOT = "https://api.github.com"

    def __init__(self, repo: str, pr_number: int, token: str, api_root: str | None = None):
        self.repo = repo
        self.pr_number = pr_number
        self.token = token
        self.api_root = api_root or self.API_ROOT

    def _headers(self, diff: bool = False) -> dict[str, str]:
        accept = "application/vnd.github.v3.diff" if diff else "application/vnd.github+json"
        return {
            "Authorization": f"Bearer {self.token}",
            "Accept": accept,
            "X-GitHub-Api-Version": "2022-11-28",
        }

    def fetch(self) -> ChangeSet:
        url = f"{self.api_root}/repos/{self.repo}/pulls/{self.pr_number}"
        meta = requests.get(url, headers=self._headers(), timeout=30)
        meta.raise_for_status()
        data = meta.json()

        diff_resp = requests.get(url, headers=self._headers(diff=True), timeout=30)
        diff_resp.raise_for_status()

        files = self._fetch_files()

        return ChangeSet(
            title=data.get("title", f"PR #{self.pr_number}"),
            description=data.get("body") or "",
            diff=diff_resp.text,
            repo=self.repo,
            pr_number=self.pr_number,
            head_sha=data.get("head", {}).get("sha"),
            files=files,
        )

    def _fetch_files(self) -> list[str]:
        files: list[str] = []
        page = 1
        while True:
            resp = requests.get(
                f"{self.api_root}/repos/{self.repo}/pulls/{self.pr_number}/files",
                headers=self._headers(),
                params={"per_page": 100, "page": page},
                timeout=30,
            )
            resp.raise_for_status()
            batch = resp.json()
            if not batch:
                break
            files.extend(f["filename"] for f in batch)
            if len(batch) < 100:
                break
            page += 1
        return files


def assemble_gitlab_diff(diffs: list[dict]) -> tuple[str, list[str], dict[str, str]]:
    """Turn GitLab's per-file diff objects into a single unified diff.

    GitLab returns each file's hunks without the ``diff --git`` / ``---`` / ``+++``
    headers, so we synthesise them. Returns ``(diff_text, new_paths, path_map)``
    where ``path_map`` maps each new path back to its old path (for renames).
    """
    parts: list[str] = []
    files: list[str] = []
    path_map: dict[str, str] = {}
    for d in diffs:
        old_path = d.get("old_path") or d.get("new_path") or "?"
        new_path = d.get("new_path") or d.get("old_path") or "?"
        files.append(new_path)
        path_map[new_path] = old_path
        a = "/dev/null" if d.get("new_file") else f"a/{old_path}"
        b = "/dev/null" if d.get("deleted_file") else f"b/{new_path}"
        header = f"diff --git a/{old_path} b/{new_path}\n--- {a}\n+++ {b}\n"
        parts.append(header + (d.get("diff") or ""))
    return "\n".join(parts), files, path_map


class GitLabMRSource:
    """A merge request fetched from the GitLab REST API (v4)."""

    API_ROOT = "https://gitlab.com"

    def __init__(self, project: str, mr_iid: int, token: str, api_root: str | None = None):
        self.project = project
        self.mr_iid = mr_iid
        self.token = token
        self.api_root = (api_root or self.API_ROOT).rstrip("/")

    def _headers(self) -> dict[str, str]:
        return {"PRIVATE-TOKEN": self.token}

    def _base_url(self) -> str:
        # Project ids may be numeric or "namespace/path"; the path form must be encoded.
        encoded = quote(str(self.project), safe="")
        return f"{self.api_root}/api/v4/projects/{encoded}/merge_requests/{self.mr_iid}"

    def fetch(self) -> ChangeSet:
        base = self._base_url()
        meta = requests.get(base, headers=self._headers(), timeout=30)
        meta.raise_for_status()
        data = meta.json()

        diffs = self._fetch_diffs(base)
        diff_text, files, path_map = assemble_gitlab_diff(diffs)

        return ChangeSet(
            title=data.get("title", f"MR !{self.mr_iid}"),
            description=data.get("description") or "",
            diff=diff_text,
            project=self.project,
            mr_iid=self.mr_iid,
            diff_refs=data.get("diff_refs"),
            path_map=path_map,
            files=files,
        )

    def _fetch_diffs(self, base: str) -> list[dict]:
        diffs: list[dict] = []
        page = 1
        while True:
            resp = requests.get(
                f"{base}/diffs",
                headers=self._headers(),
                params={"per_page": 100, "page": page},
                timeout=30,
            )
            resp.raise_for_status()
            batch = resp.json()
            if not batch:
                break
            diffs.extend(batch)
            if len(batch) < 100:
                break
            page += 1
        return diffs
