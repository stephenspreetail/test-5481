# TanStack Start + Spreeform Template

Pre-configured TanStack Start project with Spreeform UI components.

## What's Included

- TanStack Start with SSR support
- TanStack Router (file-based routing)
- TanStack Query (data fetching)
- Spreeform UI components
- Tailwind CSS v4
- TypeScript
- QueryClientProvider pre-configured
- ClientOnly wrapper for SSR-safe providers (built-in via `@tanstack/react-router`)
- 404 page pre-configured

## Template Variables

Files with `.template` extension or containing `{{PROJECT_NAME}}` need substitution:

- `package.json.template` → `package.json`
- `README.md.template` → `README.md`
- `src/routes/__root.tsx` (title)
- `src/routes/index.tsx` (welcome message)
- `public/manifest.json` (app name)

## Usage

The template is automatically copied to `.claude/templates/tanstack-start/` when the Kova agent starts.

```bash
# Copy template (from project root)
cp -r .claude/templates/tanstack-start/* .
cp .claude/templates/tanstack-start/.gitignore .
cp -r .claude/templates/tanstack-start/.vscode .

# Rename template files
mv package.json.template package.json
mv README.md.template README.md

# Substitute project name
sed -i '' 's/{{PROJECT_NAME}}/my-app/g' package.json README.md src/routes/__root.tsx src/routes/index.tsx public/manifest.json

# Install and run
bun install
bun dev
```

## Created From

This template was created by:
1. Running `bun create @tanstack/start@latest`
2. Removing demo files (src/routes/demo/, src/data/, etc.)
3. Adding Spreeform + Tailwind
4. Configuring QueryClientProvider in __root.tsx
5. Adding notFoundComponent

## Version Info

- **Created**: 2026-01-27
- **TanStack Start CLI**: Latest
- **Spreeform**: ^0.0.39
