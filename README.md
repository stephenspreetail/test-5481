# Spreetail Claude Code Plugins

Spreetail's internal marketplace for [Claude Code](https://code.claude.com/docs/en/quickstart) plugins.

**Team:** Scaled Innovation

## Plugins

| Plugin | Description | Docs |
|--------|-------------|------|
| **[kova](./kova-plugin)** | AI App Builder — TanStack Start apps with Spreetail's data platform | [README](./kova-plugin/README.md) · [Quick Start](./kova-plugin/QUICKSTART.md) |

## Adding a Plugin

Each plugin lives in its own directory and is registered in [`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json). To add a new plugin:

1. Create a directory with a `.claude-plugin/plugin.json` manifest
2. Add an entry to `marketplace.json`
3. Document it with a `README.md` and `QUICKSTART.md`

See the [Claude Code plugin docs](https://code.claude.com/docs/en/plugins) for the full authoring guide.

## Installing a Plugin

```bash
claude plugin add ./path/to/plugin-directory
```

## Claude Code Plugin Resources

- [Create plugins](https://code.claude.com/docs/en/plugins) — Plugin authoring guide
- [Plugins reference](https://code.claude.com/docs/en/plugins-reference) — Full technical spec (manifest schema, directory structure, versioning)
- [Plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces) — Creating and distributing marketplaces
- [Skills](https://code.claude.com/docs/en/skills) — Skill development details
- [Hooks](https://code.claude.com/docs/en/hooks) — Event handling and automation
- [MCP](https://code.claude.com/docs/en/mcp) — External tool integration
