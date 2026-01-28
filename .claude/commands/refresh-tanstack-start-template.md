---
description: Rebuild the TanStack Start template from latest CLI and update init-project skill
---

# Refresh TanStack Start Template

Rebuilds the project template from the latest TanStack Start CLI, applies Spreeform configuration, and updates the init-project skill if CLI behavior changed.

## When to Run

- After TanStack Start/Router/Query major releases
- After Spreeform releases
- Periodically (monthly) to catch updates
- When users report initialization issues

## Process

### 1. Read Current State

Read the current template and init-project skill:

```bash
cat packages/agent/src/templates/tanstack-start/TEMPLATE.md
cat packages/agent/src/templates/tanstack-start/src/routes/__root.tsx
cat packages/agent/src/skills/init-project/SKILL.md
```

Note current assumptions about what CLI includes/excludes.

### 2. Create Fresh CLI Project

```bash
rm -rf /tmp/template-rebuild
mkdir /tmp/template-rebuild
cd /tmp/template-rebuild
bun create @tanstack/start@latest .
```

### 3. Document CLI Output

Check what the CLI includes and document any changes:

```bash
cat package.json | grep -A 50 '"dependencies"'
cat vite.config.ts
cat src/styles.css
```

**Record findings:**
- [ ] `tailwindcss` included? (expect: NO)
- [ ] `@tailwindcss/vite` included? (expect: NO)
- [ ] `@tanstack/react-query` included? (expect: NO)
- [ ] `lucide-react` included? (expect: YES)
- [ ] Tailwind configured in vite.config.ts? (expect: NO)

### 4. Remove Demo Content

```bash
rm -rf src/routes/demo src/data
rm -f src/components/Header.tsx src/components/Header.css
rm -f src/App.css src/logo.svg
rm -f public/tanstack-circle-logo.png public/tanstack-word-logo-white.svg
rm -f public/logo192.png public/logo512.png
rm -f .cta.json README.md
```

### 5. Add Dependencies

```bash
bun add @spreetail/spreeform tailwindcss@^4 tw-animate-css @tailwindcss/vite @tanstack/react-query
```

### 6. Configure Vite

Add `tailwindcss()` plugin to `vite.config.ts`:

```typescript
import tailwindcss from '@tailwindcss/vite'
// Add to plugins array
```

### 7. Update styles.css

```css
@import '@spreetail/spreeform';
@source '../node_modules/@spreetail/spreeform/';
@source './**/*.{ts,tsx}';
```

### 8. Update __root.tsx

Use the same `__root.tsx` structure from the current template (Step 1) - it has QueryClientProvider configured correctly for SSR.

### 9. Add Template Variables

Add `{{PROJECT_NAME}}` to:
- `package.json` → rename to `package.json.template`
- `README.md` → create as `README.md.template`
- `src/routes/__root.tsx` (in title)
- `src/routes/index.tsx` (in welcome)
- `public/manifest.json`

### 10. Clean Up Build Artifacts

```bash
rm -rf node_modules bun.lock .git .tanstack
rm -f src/routeTree.gen.ts
```

### 11. Copy to Kova

```bash
rm -rf packages/agent/src/templates/tanstack-start
cp -r /tmp/template-rebuild packages/agent/src/templates/tanstack-start
```

### 12. Update init-project Skill (if needed)

If CLI behavior changed from Step 3, update the init-project skill:

```bash
# Edit packages/agent/src/skills/init-project/SKILL.md
```

Update:
- Dependencies that CLI now includes/excludes
- Configuration steps that are now needed/unnecessary
- Any version-specific notes

### 13. Test

```bash
mkdir /tmp/template-test
cp -r packages/agent/src/templates/tanstack-start/* /tmp/template-test/
cd /tmp/template-test
mv package.json.template package.json
mv README.md.template README.md
sed -i '' 's/{{PROJECT_NAME}}/test-app/g' package.json README.md src/routes/__root.tsx src/routes/index.tsx public/manifest.json
bun install
bun run dev
```

Verify:
- [ ] Dev server starts without errors
- [ ] Page loads at localhost:3000
- [ ] No "QueryClient" errors

## Output

When complete, report:
1. TanStack Start version used
2. Any CLI changes detected
3. Whether init-project skill was updated
4. Test results
