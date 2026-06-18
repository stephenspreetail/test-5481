"""Command-line entry point for the MR review agent.

Examples:
    # Review local changes against origin/main and print to the terminal
    mr-review local --base origin/main --head HEAD

    # Review a GitHub PR and print Markdown
    mr-review github --repo owner/name --pr 42 --format markdown

    # Review a GitHub PR and post the review back to it
    mr-review github --repo owner/name --pr 42 --post
"""

from __future__ import annotations

import argparse
import os
import sys

from .config import Config
from .diff_source import GitDiffSource, GitHubPRSource
from .formatter import to_markdown, to_terminal
from .reviewer import Reviewer


def _add_common(p: argparse.ArgumentParser) -> None:
    p.add_argument(
        "--format",
        choices=["terminal", "markdown"],
        default="terminal",
        help="Output format (default: terminal).",
    )
    p.add_argument(
        "--fail-on-blocking",
        action="store_true",
        help="Exit non-zero if any critical/high finding is reported.",
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="mr-review", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    local = sub.add_parser("local", help="Review a local git diff.")
    local.add_argument("--base", default="origin/main", help="Base ref (default: origin/main).")
    local.add_argument("--head", default="HEAD", help="Head ref (default: HEAD).")
    local.add_argument("--cwd", default=None, help="Repository path (default: current dir).")
    _add_common(local)

    gh = sub.add_parser("github", help="Review a GitHub pull request.")
    gh.add_argument("--repo", required=True, help="owner/name of the repository.")
    gh.add_argument("--pr", required=True, type=int, help="Pull request number.")
    gh.add_argument(
        "--token",
        default=None,
        help="GitHub token (default: $GITHUB_TOKEN).",
    )
    gh.add_argument("--post", action="store_true", help="Post the review back to the PR.")
    gh.add_argument(
        "--approve",
        action="store_true",
        help="Allow the agent to APPROVE (otherwise approvals downgrade to a comment).",
    )
    _add_common(gh)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    config = Config.from_env()

    if not config.api_key:
        print("error: ANTHROPIC_API_KEY is not set.", file=sys.stderr)
        return 2

    if args.command == "local":
        change = GitDiffSource(base=args.base, head=args.head, cwd=args.cwd).fetch()
    else:  # github
        token = args.token or os.environ.get("GITHUB_TOKEN")
        if not token:
            print("error: a GitHub token is required (--token or $GITHUB_TOKEN).", file=sys.stderr)
            return 2
        change = GitHubPRSource(repo=args.repo, pr_number=args.pr, token=token).fetch()

    if not change.diff.strip():
        print("No changes to review.", file=sys.stderr)
        return 0

    result = Reviewer(config).review(change)

    if args.format == "markdown":
        print(to_markdown(result))
    else:
        print(to_terminal(result))

    if args.command == "github" and getattr(args, "post", False):
        from .github import post_review

        token = args.token or os.environ.get("GITHUB_TOKEN")
        review = post_review(change, result, token, approve_enabled=args.approve)
        print(f"\nPosted review: {review.get('html_url', '(no url)')}", file=sys.stderr)

    if args.fail_on_blocking and result.has_blocking_findings:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
