#!/usr/bin/env python3
"""
GitLab → GitHub Repository Mirror Tool
Mirrors a selected GitLab repository into this GitHub repository.
Usage:
    GITLAB_PAT=<token> python3 migrate.py
    python3 migrate.py          # will prompt for PAT
"""

import json
import os
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


def mirror_repo(gitlab_clone_url, github_push_url, gitlab_pat):
    """Clone from GitLab with --mirror then push --mirror to GitHub."""
    auth_url = inject_pat(gitlab_clone_url, gitlab_pat)

    with tempfile.TemporaryDirectory(prefix="gl2gh_") as tmpdir:
        bare_path = os.path.join(tmpdir, "repo.git")

        print("\nStep 1/2  Cloning from GitLab (bare mirror)…")
        run(["git", "clone", "--mirror", auth_url, bare_path])

        print("Step 2/2  Pushing mirror to GitHub…")
        run(["git", "push", "--mirror", github_push_url], cwd=bare_path)

    print("\nDone — repository mirrored successfully.")


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
    print(f"\nSelected: {selected['path_with_namespace']}")
    print(f"   Clone: {gitlab_url}")

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

    # 5. Confirm — this is destructive
    print(
        "\n  WARNING: --mirror push will REPLACE all branches, tags, and refs"
        "\n           in the target GitHub repository with the GitLab content."
    )
    if not confirm("\nProceed? [y/N] "):
        print("Aborted.")
        sys.exit(0)

    # 6. Do the mirror
    mirror_repo(gitlab_url, github_url, gitlab_pat)


if __name__ == "__main__":
    main()
