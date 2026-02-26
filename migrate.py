#!/usr/bin/env python3
"""
GitLab → GitHub Branch Import Tool

Interactive mode (terminal):
    GITLAB_PAT=<token> python3 migrate.py

Non-interactive mode (Claude Code / scripting):
    python3 migrate.py --list-recent
    python3 migrate.py --list-all
    python3 migrate.py --refresh
    python3 migrate.py --import spreetail/some/repo [--branch claude/foo-XYZ] [--yes]
    python3 migrate.py --import 42               # number from --list-all
"""

import argparse
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

PROJECT_KEYS = ("id", "path", "path_with_namespace", "http_url_to_repo",
                "default_branch", "visibility")


# ---------------------------------------------------------------------------
# Cache
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
    cache["recent"] = [r for r in cache["recent"]
                       if r["path_with_namespace"] != slim["path_with_namespace"]]
    cache["recent"].insert(0, slim)
    cache["recent"] = cache["recent"][:MAX_RECENT]


def cache_age_str(fetched_at):
    if not fetched_at:
        return "no cache"
    try:
        ts = datetime.fromisoformat(fetched_at)
        delta = datetime.now(timezone.utc) - ts
        hours = int(delta.total_seconds() // 3600)
        return f"cache {hours}h old" if hours else "cache fresh"
    except ValueError:
        return "cache age unknown"


# ---------------------------------------------------------------------------
# GitLab API
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


def require_projects(cache, token):
    """Return cached repo list, fetching if empty."""
    if not cache["repos"]:
        cache["repos"] = fetch_projects(token)
        cache["fetched_at"] = datetime.now(timezone.utc).isoformat()
        save_cache(cache)
    return cache["repos"]


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
    rev_result = run(["git", "rev-list", "--objects", "--all"],
                     cwd=repo_path, capture=True, fatal=False)
    if rev_result.returncode != 0:
        return False
    proc = subprocess.run(
        ["git", "cat-file",
         "--batch-check=%(objecttype) %(objectname) %(objectsize) %(rest)"],
        input=rev_result.stdout, cwd=repo_path, capture_output=True, text=True,
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


def do_import(selected, github_url, gitlab_pat, branch_name):
    auth_url = inject_pat(selected["http_url_to_repo"], gitlab_pat)
    with tempfile.TemporaryDirectory(prefix="gl2gh_") as tmpdir:
        repo_path = os.path.join(tmpdir, "repo")
        print("\nStep 1/3  Cloning from GitLab…")
        run(["git", "clone", auth_url, repo_path])
        print("Step 2/3  Checking for large files…")
        if not strip_large_files(repo_path):
            print("  No oversized files found.")
        br = run(["git", "branch", "--show-current"],
                 cwd=repo_path, capture=True, fatal=False)
        source_branch = br.stdout.strip() or "main"
        print(f"Step 3/3  Pushing {source_branch} → {branch_name} on GitHub…")
        run(["git", "push", github_url, f"{source_branch}:{branch_name}"],
            cwd=repo_path)
    print(f"\nDone — '{selected['path_with_namespace']}' imported to '{branch_name}'.")


def default_branch_name(selected):
    repo_slug = selected["path"].replace("_", "-").lower()
    suffix = get_session_suffix()
    return f"claude/{repo_slug}-{suffix}" if suffix else f"claude/{repo_slug}"


def resolve_repo(cache, token, spec):
    """Resolve --import value: an integer index or a path_with_namespace string."""
    projects = require_projects(cache, token)
    try:
        idx = int(spec)
        if 1 <= idx <= len(projects):
            return projects[idx - 1]
        print(f"Error: index {idx} out of range (1–{len(projects)}).")
        sys.exit(1)
    except ValueError:
        pass
    # Match by path_with_namespace (exact or partial)
    matches = [p for p in projects if spec.lower() in p["path_with_namespace"].lower()]
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        print(f"Ambiguous: '{spec}' matches {len(matches)} repos:")
        for m in matches[:10]:
            print(f"  {m['path_with_namespace']}")
        sys.exit(1)
    print(f"Error: no repo matching '{spec}'.")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Non-interactive sub-commands
# ---------------------------------------------------------------------------

def cmd_list_recent(cache):
    recent = cache.get("recent", [])
    if not recent:
        print("No recently imported repos yet.")
        return
    print(f"Recently imported repos ({cache_age_str(cache['fetched_at'])}):\n")
    for i, r in enumerate(recent, 1):
        print(f"  {i}.  {r['path_with_namespace']}")
    print()
    print("To import one, run:")
    print("  python3 migrate.py --import <number-or-path> [--branch <name>] [--yes]")


def cmd_list_all(cache, token, page=1, page_size=50):
    projects = require_projects(cache, token)
    age = cache_age_str(cache["fetched_at"])
    total_pages = (len(projects) + page_size - 1) // page_size
    page = max(1, min(page, total_pages))
    start = (page - 1) * page_size
    end = min(start + page_size, len(projects))
    print(f"{len(projects)} GitLab repositories ({age}) — page {page}/{total_pages}:\n")
    for i, p in enumerate(projects[start:end], start + 1):
        vis = p.get("visibility", "")
        tag = f" [{vis}]" if vis else ""
        print(f"  {i:4}.  {p['path_with_namespace']}{tag}")
    print(f"\nPage {page}/{total_pages}  |  --page {page - 1} for previous  |  --page {page + 1} for next" if total_pages > 1 else "")


def cmd_refresh(cache, token):
    cache["repos"] = fetch_projects(token)
    cache["fetched_at"] = datetime.now(timezone.utc).isoformat()
    save_cache(cache)
    print(f"Cache updated: {len(cache['repos'])} repos stored.")


def cmd_import(cache, token, spec, branch_arg, yes):
    selected = resolve_repo(cache, token, spec)
    github_url = get_github_remote()
    if not github_url:
        print("Error: could not detect GitHub remote URL.")
        sys.exit(1)

    branch_name = branch_arg or default_branch_name(selected)
    default_branch = selected.get("default_branch") or "main"

    print(f"\nSelected: {selected['path_with_namespace']}")
    print(f" Default: {default_branch}")
    print(f"  Target: {github_url}  →  branch '{branch_name}'")

    if not yes:
        try:
            answer = input("\nProceed? [y/N] ").strip().lower()
        except (KeyboardInterrupt, EOFError):
            print("\nAborted.")
            sys.exit(0)
        if answer != "y":
            print("Aborted.")
            sys.exit(0)

    do_import(selected, github_url, token, branch_name)
    add_to_recent(cache, selected)
    save_cache(cache)


# ---------------------------------------------------------------------------
# Interactive mode (terminal)
# ---------------------------------------------------------------------------

def interactive(cache, token):
    if cache["recent"]:
        print("\nRecently imported repos:")
        for i, r in enumerate(cache["recent"], 1):
            print(f"  {i}.  {r['path_with_namespace']}")

        age = cache_age_str(cache["fetched_at"])
        prompt = (f"\nPick a recent repo (1–{len(cache['recent'])}), "
                  f"[b]rowse all ({age}), or [r]efresh: ")

        while True:
            try:
                raw = input(prompt).strip().lower()
            except (KeyboardInterrupt, EOFError):
                print("\nAborted.")
                sys.exit(0)
            if raw == "r":
                cmd_refresh(cache, token)
                selected = _browse(cache)
                break
            if raw == "b":
                require_projects(cache, token)
                selected = _browse(cache)
                break
            try:
                choice = int(raw)
                if 1 <= choice <= len(cache["recent"]):
                    selected = cache["recent"][choice - 1]
                    break
                print(f"  Please enter 1–{len(cache['recent'])}, b, or r.")
            except ValueError:
                print(f"  Please enter 1–{len(cache['recent'])}, b, or r.")
    else:
        require_projects(cache, token)
        selected = _browse(cache)

    github_url = get_github_remote()
    if not github_url:
        try:
            github_url = input("Enter target GitHub repo URL: ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nAborted.")
            sys.exit(0)

    branch_name = default_branch_name(selected)
    try:
        raw = input(f"Target branch name [{branch_name}]: ").strip()
        if raw:
            branch_name = raw
    except (KeyboardInterrupt, EOFError):
        print("\nAborted.")
        sys.exit(0)

    default_branch = selected.get("default_branch") or "main"
    print(f"\n  Import '{selected['path_with_namespace']}' (branch: {default_branch})")
    print(f"  → '{branch_name}' on GitHub")
    try:
        if input("\nProceed? [y/N] ").strip().lower() != "y":
            print("Aborted.")
            sys.exit(0)
    except (KeyboardInterrupt, EOFError):
        print("\nAborted.")
        sys.exit(0)

    do_import(selected, github_url, token, branch_name)
    add_to_recent(cache, selected)
    save_cache(cache)


def _browse(cache):
    projects = cache["repos"]
    print(f"\n{len(projects)} repos:\n")
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
            print(f"  Please enter 1–{len(projects)}.")
        except ValueError:
            print("  Please enter a valid number.")
        except (KeyboardInterrupt, EOFError):
            print("\nAborted.")
            sys.exit(0)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Import a GitLab repo as a branch in this GitHub repo.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Claude Code usage (non-interactive):
  python3 migrate.py --list-recent
  python3 migrate.py --list-all
  python3 migrate.py --refresh
  python3 migrate.py --import spreetail/some/repo --yes
  python3 migrate.py --import 42 --branch claude/my-branch --yes
        """,
    )
    parser.add_argument("--list-recent", action="store_true",
                        help="show recently imported repos and exit")
    parser.add_argument("--list-all", action="store_true",
                        help="show cached repos and exit")
    parser.add_argument("--page", type=int, default=1, metavar="N",
                        help="page number for --list-all (default: 1)")
    parser.add_argument("--page-size", type=int, default=50, metavar="N",
                        help="repos per page for --list-all (default: 50)")
    parser.add_argument("--refresh", action="store_true",
                        help="re-fetch repo list from GitLab and exit")
    parser.add_argument("--import", dest="import_repo", metavar="REPO",
                        help="repo index (from --list-all) or path to import")
    parser.add_argument("--branch", metavar="NAME",
                        help="target GitHub branch name (default: auto-generated)")
    parser.add_argument("--yes", "-y", action="store_true",
                        help="skip confirmation prompt")
    args = parser.parse_args()

    gitlab_pat = os.environ.get("GITLAB_PAT")
    if not gitlab_pat:
        # Only need the PAT for operations that hit the API
        needs_api = args.refresh or args.import_repo or not any(
            [args.list_recent, args.list_all]
        )
        if needs_api or not args.list_recent:
            try:
                gitlab_pat = input("Enter your GitLab Personal Access Token: ").strip()
            except (KeyboardInterrupt, EOFError):
                print("\nAborted.")
                sys.exit(0)
            if not gitlab_pat:
                print("No token provided.")
                sys.exit(1)

    cache = load_cache()

    if args.list_recent:
        cmd_list_recent(cache)
    elif args.list_all:
        cmd_list_all(cache, gitlab_pat, args.page, args.page_size)
    elif args.refresh:
        cmd_refresh(cache, gitlab_pat)
    elif args.import_repo:
        cmd_import(cache, gitlab_pat, args.import_repo, args.branch, args.yes)
    else:
        # No flags → fully interactive mode
        interactive(cache, gitlab_pat)


if __name__ == "__main__":
    main()
