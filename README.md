# MR Review Agent

An AI merge-request / pull-request review agent powered by Claude. It reads a
diff — either a local `git diff` or a GitHub pull request — asks Claude to review
it as a staff engineer would, and returns structured findings (severity,
category, confidence, location, and a suggested fix). It can print the review to
your terminal, render it as Markdown, or post it straight back to a GitHub PR
with inline comments.

## How it works

```
diff source ─▶ Reviewer (Claude) ─▶ ReviewResult ─▶ terminal / markdown / GitHub PR
```

- **`mr_review/diff_source.py`** — fetches the change to review (`GitDiffSource`,
  `GitHubPRSource`).
- **`mr_review/reviewer.py`** — the review brain. Sends the diff to Claude with a
  structured-output JSON schema so every finding has a severity, category,
  confidence, file/line, and suggestion.
- **`mr_review/formatter.py`** — renders a `ReviewResult` as Markdown or plain text.
- **`mr_review/github.py`** — posts the review back to a PR, placing inline
  comments on findings that anchor to a changed line.
- **`mr_review/cli.py`** — the `mr-review` command.

The agent uses Claude with adaptive thinking and `effort: high`, streams the
response (so large diffs don't trip request timeouts), and constrains the output
to a JSON schema for reliable parsing.

## Install

```bash
pip install -e .
# or, without installing the console script:
pip install -r requirements.txt
```

Set your API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## Usage

Review local changes against `origin/main` and print to the terminal:

```bash
mr-review local --base origin/main --head HEAD
```

Review a GitHub pull request and print Markdown:

```bash
export GITHUB_TOKEN=ghp_...
mr-review github --repo owner/name --pr 42 --format markdown
```

Review a GitHub PR and post the review back to it:

```bash
mr-review github --repo owner/name --pr 42 --post
```

Use it as a CI gate (exit non-zero on any critical/high finding):

```bash
mr-review local --fail-on-blocking
```

You can also run it as a module: `python -m mr_review ...`.

## Configuration

All settings have sensible defaults and can be overridden via environment
variables:

| Variable                 | Default            | Purpose                                  |
| ------------------------ | ------------------ | ---------------------------------------- |
| `ANTHROPIC_API_KEY`      | —                  | Required. Your Anthropic API key.        |
| `MR_REVIEW_MODEL`        | `claude-opus-4-8`  | Model to use for the review.             |
| `MR_REVIEW_MAX_TOKENS`   | `16000`            | Max output tokens.                       |
| `MR_REVIEW_EFFORT`       | `high`             | Effort: `low`/`medium`/`high`/`xhigh`/`max`. |
| `MR_REVIEW_MAX_DIFF_CHARS` | `400000`         | Diffs larger than this are truncated.    |

## GitHub Action

`.github/workflows/mr-review.yml` runs the agent on every pull request and posts
the review back. It needs one repository secret, `ANTHROPIC_API_KEY` (the
built-in `GITHUB_TOKEN` provides PR write access). By default the agent never
self-approves — an `approve` verdict is downgraded to a plain comment unless you
pass `--approve`.

## Tests

```bash
pip install pytest
pytest
```

The tests cover the formatter, the output schema/config, diff truncation, and
the GitHub review payload (the GitHub HTTP call is mocked). They do not call the
Anthropic API.
