#!/usr/bin/env python3
"""
GitLab → GitHub Branch Import Tool
Imports a selected GitLab repository as a new branch in this GitHub repository.
Usage:
    GITLAB_PAT=<token> python3 migrate.py
    python3 migrate.py          # will prompt for PAT
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from datetime import datetime, timezone

GITLAB_API = "https://gitlab.com/api/v4"
REPO_ROOT = os.path.dirname(os.path.abspath(__file__))
CACHE_FILE = os.path.expanduser("~/.cache/gl2gh_migrate.json")
MAX_RECENT = 5

# Fields we need to keep per project (avoids storing giant blobs in the cache)
PROJECT_KEYS = ("id", "path", "path_with_namespace", "http_url_to_repo",
                "default_branch", "visibility")


# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------

def _slim(project):
    return {k: project.get(k) for k in PROJECT_KEYS}


def load_cache():
    try:
        with open(CACHE_FILE) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"repos": [], "fetched_at": None, "recent": []}


def save_cache(cache):
    os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
    with open(CACHE_FILE, "w") as f:
        json.dump(cache, f)


def add_to_recent(cache, project):
    slim = _slim(project)
    # Remove existing entry for the same repo, then prepend
    cache["recent"] = [r for r in cache["recent"]
                       if r["path_with_namespace"] != slim["path_with_namespace"]]
    cache["recent"].insert(0, slim)
    cache["recent"] = cache["recent"][:MAX_RECENT]


# ---------------------------------------------------------------------------
# GitLab API helpers
# ---------------------------------------------------------------------------

def gitlab_get(path, token):
    url = f"{GITLAB_API}{path}"
    req = urllib.request.Request(url, headers={"PRIVATE-TOKEN": token})
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        print(f"GitLab API error {e.code}: {body}")
        sys.exit(1)


def fetch_projects(token):
    """Fetch all GitLab projects from the API and return slim dicts."""
    print("Fetching your GitLab repositories…", end="", flush=True)
    projects, page = [], 1
    while True:
        batch = gitlab_get(
            f"/projects?membership=true&per_page=100&page={page}"
            "&order_by=last_activity_at&sort=desc",
            token,
        )
        if not batch:
            break
        projects.extend(batch)
        print(".", end="", flush=True)
        if len(batch) < 100:
            break
        page += 1
    print(f" {len(projects)} repos found.")
    return [_slim(p) for p in projects]


# ---------------------------------------------------------------------------
# Git helpers
# ---------------------------------------------------------------------------

def run(cmd, cwd=None, capture=False, fatal=True):
    result = subprocess.run(cmd, cwd=cwd, capture_output=capture, text=True)
    if result.returncode != 0 and fatal:
        print(f"\nCommand failed: {' '.join(str(c) for c in cmd)}")
        if capture:
            print(result.stderr.strip())
        sys.exit(1)
    return result


def get_github_remote():
    result = run(["git", "remote", "get-url", "origin"], cwd=REPO_ROOT,
                 capture=True, fatal=False)
    return result.stdout.strip() if result.returncode == 0 else None


def inject_pat(url, pat):
    if url.startswith("https://"):
        return url.replace("https://", f"https://oauth2:{pat}@", 1)
    return url


def get_session_suffix():
    result = run(["git", "branch", "--show-current"], cwd=REPO_ROOT,
                 capture=True, fatal=False)
    branch = result.stdout.strip()
    if branch and branch.startswith("claude/") and "-" in branch:
        return branch.rsplit("-", 1)[1]
    return None


def ensure_filter_repo():
    if shutil.which("git-filter-repo"):
        return True
    print("  git-filter-repo not found — installing via pip…")
    result = run(
        [sys.executable, "-m", "pip", "install", "--quiet", "git-filter-repo"],
        capture=True, fatal=False,
    )
    if result.returncode != 0:
        print("  Warning: could not install git-filter-repo. "
              "Large files will NOT be stripped — the push may fail.")
        return False
    return True


def strip_large_files(repo_path):
    rev_result = run(
        ["git", "rev-list", "--objects", "--all"],
        cwd=repo_path, capture=True, fatal=False,
    )
    if rev_result.returncode != 0:
        return False

    proc = subprocess.run(
        ["git", "cat-file",
         "--batch-check=%(objecttype) %(objectname) %(objectsize) %(rest)"],
        input=rev_result.stdout,
        cwd=repo_path, capture_output=True, text=True,
    )
    over_limit = [
        line for line in proc.stdout.splitlines()
        if line.startswith("blob") and int(line.split()[2]) > 99 * 1024 * 1024
    ]

    if not over_limit:
        return False

    total_mb = sum(int(l.split()[2]) for l in over_limit) / 1024 / 1024
    print(f"  Found {len(over_limit)} blob(s) over 99 MB ({total_mb:.0f} MB total) — stripping…")

    if not ensure_filter_repo():
        return False

    run(["git-filter-repo", "--strip-blobs-bigger-than", "99M", "--force"],
        cwd=repo_path)
    return True


def import_branch(gitlab_clone_url, github_push_url, gitlab_pat, branch_name):
    auth_url = inject_pat(gitlab_clone_url, gitlab_pat)

    with tempfile.TemporaryDirectory(prefix="gl2gh_") as tmpdir:
        repo_path = os.path.join(tmpdir, "repo")

        print("\nStep 1/3  Cloning from GitLab…")
        run(["git", "clone", auth_url, repo_path])

        print("Step 2/3  Checking for large files…")
        if not strip_large_files(repo_path):
            print("  No oversized files found.")

        br_result = run(["git", "branch", "--show-current"],
                        cwd=repo_path, capture=True, fatal=False)
        source_branch = br_result.stdout.strip() or "main"

        print(f"Step 3/3  Pushing {source_branch} → {branch_name} on GitHub…")
        run(["git", "push", github_push_url, f"{source_branch}:{branch_name}"],
            cwd=repo_path)

    print(f"\nDone — GitLab default branch imported to '{branch_name}' successfully.")


# ---------------------------------------------------------------------------
# Interactive prompts
# ---------------------------------------------------------------------------

def prompt_pat():
    try:
        pat = input("Enter your GitLab Personal Access Token: ").strip()
    except (KeyboardInterrupt, EOFError):
        print("\nAborted.")
        sys.exit(0)
    if not pat:
        print("No token provided. Exiting.")
        sys.exit(1)
    return pat


def prompt_recent_or_browse(recent, fetched_at):
    """
    Show recent repos. Returns ('recent', project) or ('browse', None)
    or ('refresh', None).
    """
    print("\nRecently imported repos:")
    for i, r in enumerate(recent, 1):
        print(f"  {i}.  {r['path_with_namespace']}")

    age = ""
    if fetched_at:
        try:
            ts = datetime.fromisoformat(fetched_at)
            delta = datetime.now(timezone.utc) - ts
            hours = int(delta.total_seconds() // 3600)
            age = f" (cache {hours}h old)" if hours else " (cache fresh)"
        except ValueError:
            pass

    print()
    prompt = (
        f"Pick a recent repo (1–{len(recent)}), "
        f"[b]rowse all{age}, or [r]efresh cache: "
    )
    while True:
        try:
            raw = input(prompt).strip().lower()
        except (KeyboardInterrupt, EOFError):
            print("\nAborted.")
            sys.exit(0)

        if raw == "r":
            return "refresh", None
        if raw == "b":
            return "browse", None
        try:
            choice = int(raw)
            if 1 <= choice <= len(recent):
                return "recent", recent[choice - 1]
            print(f"  Please enter 1–{len(recent)}, b, or r.")
        except ValueError:
            print(f"  Please enter 1–{len(recent)}, b, or r.")


def prompt_project(projects):
    print(f"\n{len(projects)} GitLab repositories (cached):\n")
    for i, p in enumerate(projects, 1):
        vis = p.get("visibility", "")
        tag = f" [{vis}]" if vis else ""
        print(f"  {i:4}.  {p['path_with_namespace']}{tag}")

    print()
    while True:
        try:
            raw = input(f"Select repo (1–{len(projects)}): ").strip()
            choice = int(raw)
            if 1 <= choice <= len(projects):
                return projects[choice - 1]
            print(f"  Please enter a number between 1 and {len(projects)}.")
        except ValueError:
            print("  Please enter a valid number.")
        except (KeyboardInterrupt, EOFError):
            print("\nAborted.")
            sys.exit(0)


def prompt_branch(default):
    try:
        raw = input(f"Target branch name [{default}]: ").strip()
    except (KeyboardInterrupt, EOFError):
        print("\nAborted.")
        sys.exit(0)
    return raw if raw else default


def confirm(message):
    try:
        answer = input(message).strip().lower()
    except (KeyboardInterrupt, EOFError):
        print("\nAborted.")
        sys.exit(0)
    return answer == "y"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    # 1. GitLab PAT
    gitlab_pat = os.environ.get("GITLAB_PAT") or prompt_pat()

    cache = load_cache()

    # 2. Select a project
    selected = None

    if cache["recent"]:
        action, project = prompt_recent_or_browse(cache["recent"], cache["fetched_at"])

        if action == "recent":
            selected = project

        elif action == "refresh":
            cache["repos"] = fetch_projects(gitlab_pat)
            cache["fetched_at"] = datetime.now(timezone.utc).isoformat()
            save_cache(cache)
            selected = prompt_project(cache["repos"])

        else:  # browse
            if not cache["repos"]:
                print("No cached repo list — fetching…")
                cache["repos"] = fetch_projects(gitlab_pat)
                cache["fetched_at"] = datetime.now(timezone.utc).isoformat()
                save_cache(cache)
            selected = prompt_project(cache["repos"])

    else:
        # No recents yet — fetch (or use cache) and browse
        if not cache["repos"]:
            cache["repos"] = fetch_projects(gitlab_pat)
            cache["fetched_at"] = datetime.now(timezone.utc).isoformat()
            save_cache(cache)
        selected = prompt_project(cache["repos"])

    gitlab_url = selected["http_url_to_repo"]
    default_branch = selected.get("default_branch") or "main"
    print(f"\nSelected: {selected['path_with_namespace']}")
    print(f"   Clone: {gitlab_url}")
    print(f" Default: {default_branch}")

    # 3. Resolve GitHub target
    github_url = get_github_remote()
    if not github_url:
        print("\nCould not detect GitHub remote URL from git config.")
        try:
            github_url = input("Enter target GitHub repo URL: ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nAborted.")
            sys.exit(0)
        if not github_url:
            print("No URL provided. Exiting.")
            sys.exit(1)

    print(f"  Target: {github_url}")

    # 4. Target branch name
    repo_slug = selected["path"].replace("_", "-").lower()
    suffix = get_session_suffix()
    default_target = f"claude/{repo_slug}-{suffix}" if suffix else f"claude/{repo_slug}"
    print()
    target_branch = prompt_branch(default_target)

    # 5. Confirm
    print(f"\n  This will import '{selected['path_with_namespace']}' "
          f"(default branch: {default_branch})")
    print(f"  into the branch '{target_branch}' of the GitHub repo.")
    print("  Any existing content on that branch will be overwritten.")
    if not confirm("\nProceed? [y/N] "):
        print("Aborted.")
        sys.exit(0)

    # 6. Import
    import_branch(gitlab_url, github_url, gitlab_pat, target_branch)

    # 7. Save to recents
    add_to_recent(cache, selected)
    save_cache(cache)


if __name__ == "__main__":
    main()
