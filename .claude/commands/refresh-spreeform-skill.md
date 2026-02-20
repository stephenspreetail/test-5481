---
description: Update Spreeform skill documentation by analyzing the latest package
---

# Refresh Spreeform Documentation

Updates the spreeform skill by analyzing the latest @spreetail/spreeform package.

## When to Run

- After Spreeform releases a new version
- When component APIs change
- Periodically (monthly) to stay current

## Process

### 1. Read Current Skill

First, read the current skill files to understand what we're updating:

```bash
cat kova-plugin/skills/spreeform/SKILL.md
cat kova-plugin/skills/spreeform/references/COMPONENTS.md
cat kova-plugin/skills/spreeform/references/TOKENS.md
cat kova-plugin/skills/spreeform/MAINTENANCE.md
```

Note the current version and component list.

### 2. Setup Analysis

```bash
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"
echo '{"name": "spreeform-analysis", "type": "module"}' > package.json
bun add @spreetail/spreeform
```

### 3. Get Version

```bash
cat node_modules/@spreetail/spreeform/package.json | grep version
```

### 4. Analyze Exports

```bash
cat node_modules/@spreetail/spreeform/dist/index.d.ts
```

Extract:
- All exported components (grouped by category)
- Component props interfaces
- Variant types
- Hooks and utilities

### 5. Analyze Theme

```bash
cat node_modules/@spreetail/spreeform/dist/theme.css
```

Extract:
- CSS custom properties (color tokens)
- Typography settings

### 6. Compare and Update

Compare findings against current skill (from Step 1). Update these files:

**`kova-plugin/skills/spreeform/SKILL.md`**
- Update version number
- Update component examples if APIs changed

**`kova-plugin/skills/spreeform/references/COMPONENTS.md`**
- Full component reference with all variants/props

**`kova-plugin/skills/spreeform/references/TOKENS.md`**
- Color tokens, typography, spacing

**`kova-plugin/skills/spreeform/MAINTENANCE.md`**
- Add changelog entry

### 7. Clean Up

```bash
rm -rf "$TEMP_DIR"
```

## Output

When complete, report:
1. Package version analyzed
2. Number of components found
3. New components added
4. Components removed
5. Breaking changes detected
