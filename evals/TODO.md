# Evals TODO

## CLI non-interactive mode

Add a `--mode cli|sdk` flag to the batch runner so builds can run via Claude Code CLI instead of the Agent SDK.

Claude Code supports `claude -p "prompt" --plugin-dir <path>` which runs non-interactively (no TUI) and exits when done. This would let us:

- Test plugin behavior in the actual CLI environment (not just the SDK)
- A/B test CLI vs SDK using the same profiles, checks, and evaluator
- Catch issues that only surface in one runtime

The CLI mode would spawn `claude -p` with `--output-format json` and `--plugin-dir` pointed at `kova-plugin`, writing output to `workspaces/cli/app-N/`. The evaluator already works on any workspace directory, so no changes needed there.

## GitLab CI integration

Add a `.gitlab-ci.yml` job that runs evals on MRs:

- `when: manual` so it doesn't run on every push (API costs)
- `artifacts:reports:metrics` to surface score diffs in the MR widget
- Hard-gate on deterministic checks (bun, tanstack, init-project)
- Soft-gate on non-deterministic checks (typescript, dev-server)

See [plugin-compliance-testing.md](../docs/plugin-compliance-testing.md) for the CI design.
