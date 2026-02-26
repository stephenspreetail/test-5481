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

GITLAB_API = "https://gitlab.com/api/v4"
REPO_ROOT = os.path.dirname(os.path.abspath(__file__))


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


def list_projects(token):
    """Return all GitLab projects the token can access, sorted by recent activity."""
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
        if len(batch) < 100:
            break
        page += 1
    return projects


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
    """Embed a GitLab PAT into an HTTPS clone URL."""
    if url.startswith("https://"):
        return url.replace("https://", f"https://oauth2:{pat}@", 1)
    return url  # SSH URLs: leave unchanged (PAT not used for SSH)


def get_session_suffix():
    """
    Extract the trailing suffix from the current Claude branch.
    e.g. 'lN1wh' from 'claude/gitlab-to-github-copy-lN1wh'.
    Returns None if the current branch doesn't match the expected pattern.
    """
    result = run(["git", "branch", "--show-current"], cwd=REPO_ROOT,
                 capture=True, fatal=False)
    branch = result.stdout.strip()
    if branch and branch.startswith("claude/") and "-" in branch:
        return branch.rsplit("-", 1)[1]
    return None


def ensure_filter_repo():
    """Install git-filter-repo via pip if it's not already available."""
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
    """
    Remove blobs larger than 99 MB from the repo history using git-filter-repo.
    This keeps the push under GitHub's 100 MB hard limit.
    Returns True if any stripping was done.
    """
    # Detect blobs over the limit first
    result = run(
        ["git", "cat-file", "--batch-check=%(objecttype) %(objectname) %(objectsize) %(rest)"],
        cwd=repo_path, capture=True, fatal=False,
        # pipe all objects through cat-file
    )
    # Use rev-list to enumerate all objects, then cat-file to check sizes
    rev_result = run(
        ["git", "rev-list", "--objects", "--all"],
        cwd=repo_path, capture=True, fatal=False,
    )
    if rev_result.returncode != 0:
        return False

    proc = subprocess.run(
        ["git", "cat-file", "--batch-check=%(objecttype) %(objectname) %(objectsize) %(rest)"],
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

    run(
        ["git-filter-repo", "--strip-blobs-bigger-than", "99M", "--force"],
        cwd=repo_path,
    )
    return True


def import_branch(gitlab_clone_url, github_push_url, gitlab_pat, branch_name):
    """Clone the GitLab repo, strip large files, and push as a branch to GitHub."""
    auth_url = inject_pat(gitlab_clone_url, gitlab_pat)

    with tempfile.TemporaryDirectory(prefix="gl2gh_") as tmpdir:
        repo_path = os.path.join(tmpdir, "repo")

        print("\nStep 1/3  Cloning from GitLab…")
        run(["git", "clone", auth_url, repo_path])

        print("Step 2/3  Checking for large files…")
        stripped = strip_large_files(repo_path)
        if not stripped:
            print("  No oversized files found.")

        # Determine the default branch name in the clone
        br_result = run(
            ["git", "branch", "--show-current"],
            cwd=repo_path, capture=True, fatal=False,
        )
        source_branch = br_result.stdout.strip() or "main"

        print(f"Step 3/3  Pushing {source_branch} → {branch_name} on GitHub…")
        run(
            ["git", "push", github_push_url, f"{source_branch}:{branch_name}"],
            cwd=repo_path,
        )

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


def prompt_project(projects):
    print(f"\nFound {len(projects)} GitLab repositories:\n")
    for i, p in enumerate(projects, 1):
        visibility = p.get("visibility", "")
        tag = f" [{visibility}]" if visibility else ""
        print(f"  {i:4}.  {p['path_with_namespace']}{tag}")

    print()
    while True:
        try:
            raw = input(f"Select repo (1–{len(projects)}): ").strip()
            choice = int(raw)
            if 1 <= choice <= len(projects):
                return projects[choice - 1]
            print(f"       Please enter a number between 1 and {len(projects)}.")
        except ValueError:
            print("       Please enter a valid number.")
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

    # 2. Verify token + list projects
    print("\nFetching your GitLab repositories…")
    projects = list_projects(gitlab_pat)
    if not projects:
        print("No projects found for this token.")
        sys.exit(1)

    # 3. User selects a project
    selected = prompt_project(projects)
    gitlab_url = selected["http_url_to_repo"]
    default_branch = selected.get("default_branch") or "main"
    print(f"\nSelected: {selected['path_with_namespace']}")
    print(f"   Clone: {gitlab_url}")
    print(f" Default: {default_branch}")

    # 4. Resolve GitHub target
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

    # 5. Determine target branch name
    #    Use claude/<repo-slug>-<session-suffix> so the push passes the proxy.
    repo_slug = selected["path"].replace("_", "-").lower()
    suffix = get_session_suffix()
    default_target = f"claude/{repo_slug}-{suffix}" if suffix else f"claude/{repo_slug}"
    print()
    target_branch = prompt_branch(default_target)

    # 6. Confirm
    print(f"\n  This will import '{selected['path_with_namespace']}' (default branch: {default_branch})")
    print(f"  into the branch '{target_branch}' of the GitHub repo.")
    print("  Any existing content on that branch will be overwritten.")
    if not confirm("\nProceed? [y/N] "):
        print("Aborted.")
        sys.exit(0)

    # 7. Do the import
    import_branch(gitlab_url, github_url, gitlab_pat, target_branch)


if __name__ == "__main__":
    main()
