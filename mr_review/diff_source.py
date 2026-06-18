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
