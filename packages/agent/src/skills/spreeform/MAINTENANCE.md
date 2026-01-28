# Spreeform Skill Maintenance

Instructions for refreshing the Spreeform documentation when the package is updated.

## When to Refresh

Refresh this skill when:
- `@spreetail/spreeform` has a major or minor version bump
- New components are added to Spreeform
- Significant API changes occur
- Design tokens are updated

## Quick Refresh (Claude Code)

Run this command in Claude Code from the kova repo root:

```
/refresh-spreeform
```

> **Note:** The `/refresh-spreeform` skill is a project-level maintenance command located in `.claude/skills/refresh-spreeform/`. It's separate from the bundled `spreeform` skill in `packages/agent/src/skills/` because it's for maintaining this repo, not for distribution with the agent.

Or ask Claude Code directly:

> "Refresh the spreeform skill documentation by analyzing the latest @spreetail/spreeform package. Follow the instructions in packages/agent/src/skills/spreeform/MAINTENANCE.md"

## Manual Refresh Process

### Step 1: Create Analysis Environment

```bash
# Create temp directory
mkdir -p /tmp/spreeform-analysis
cd /tmp/spreeform-analysis

# Initialize and install
echo '{"name": "spreeform-analysis", "type": "module"}' > package.json
bun add @spreetail/spreeform
```

### Step 2: Analyze Package Exports

Check the TypeScript definitions for all exports:

```bash
# List all exports
cat node_modules/@spreetail/spreeform/dist/index.d.ts
```

Key things to document:
- All exported components (Button, Card, Dialog, etc.)
- Component props and variants
- Hooks (useTheme, useSidebar, etc.)
- Utilities (cn, toast functions)

### Step 3: Analyze CSS/Theme

Check the theme CSS for design tokens:

```bash
cat node_modules/@spreetail/spreeform/dist/theme.css
```

Document:
- Color tokens (semantic and raw)
- Typography settings
- Spacing/sizing values

### Step 4: Check Storybook (Optional)

For additional context, check:
- https://spreeform-docs.prod01.tk.dev/?path=/docs/tokens-colors--docs
- https://spreeform-docs.prod01.tk.dev/?path=/docs/tokens-typography--docs
- https://spreeform-docs.prod01.tk.dev/?path=/docs/design-specs-spacing--docs

### Step 5: Update Documentation Files

Update these files in `packages/agent/src/skills/spreeform/`:

| File | Content |
|------|---------|
| `SKILL.md` | Quick start, common components, key patterns |
| `references/COMPONENTS.md` | Full component reference with all variants |
| `references/TOKENS.md` | Design tokens (colors, typography, spacing) |

### Step 6: Update Version

Add version note to SKILL.md frontmatter or header:

```markdown
**Package Version:** 0.0.X (analyzed YYYY-MM-DD)
```

## What to Include

### SKILL.md (Keep Concise)
- Installation commands
- CSS setup (critical)
- 5-6 most common components with examples
- Quick reference for hooks and utilities
- Links to reference files

### COMPONENTS.md (Comprehensive)
- Every exported component
- All variants and props
- Usage examples for each
- Grouped by category (Form, Layout, Display, etc.)

### TOKENS.md (Complete Reference)
- All semantic color tokens
- Typography utilities
- Spacing scale
- Sizing values
- Theming instructions

## Verification

After updating, verify:

1. **Skill loads correctly**:
   ```bash
   cd /path/to/test/project
   cat .claude/skills/spreeform/SKILL.md
   ```

2. **No broken references**: Check all component names are correct

3. **Test with agent**: Ask Kova to build a simple UI and verify it uses correct imports

## Current Version

**Package Version:** 0.0.39 (analyzed 2026-01-27)

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-27 | 0.0.39 | Initial skill creation from package analysis |
