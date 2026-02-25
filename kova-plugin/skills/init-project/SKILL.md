---
name: init-project
description: Initialize a new TanStack Start project with React, TypeScript, Vite, and Spreeform. Use when creating a new app, starting from scratch, or when the user mentions "new project", "initialize", "scaffold", "create app", or "start fresh".
---

# Initialize New Project

This skill initializes a new TanStack Start project using Spreetail's pre-configured template.

## Quick Start

### 1. Copy Template Files

Copy all files from the template directory to your project. The template is located in the kova plugin's `templates/tanstack-start/` directory.

Find the plugin root by locating the `.claude-plugin/plugin.json` file — the template is at `${PLUGIN_ROOT}/templates/tanstack-start/`:

```bash
# PLUGIN_ROOT is the kova plugin's installation directory
cp -r ${PLUGIN_ROOT}/templates/tanstack-start/* .
cp ${PLUGIN_ROOT}/templates/tanstack-start/.gitignore .
cp -r ${PLUGIN_ROOT}/templates/tanstack-start/.vscode .
```

**IMPORTANT**: The template is bundled with the kova plugin. Use the plugin root path to locate it.

### 2. Rename Template Files

```bash
mv package.json.template package.json
mv README.md.template README.md
```

### 3. Substitute Project Name

Replace `{{PROJECT_NAME}}` with the actual project name in these files:
- `package.json`
- `README.md`
- `src/routes/__root.tsx`
- `src/routes/index.tsx`
- `public/manifest.json`

```bash
PROJECT_NAME="my-app"
sed -i '' "s/{{PROJECT_NAME}}/$PROJECT_NAME/g" package.json README.md src/routes/__root.tsx src/routes/index.tsx public/manifest.json
```

### 4. Install Dependencies

```bash
bun install
```

### 5. Start Development

```bash
bun dev
```

The app will be available at http://localhost:3000

## What's Pre-Configured

The template includes everything needed for a Spreetail app:

| Feature | Status |
|---------|--------|
| TanStack Start | Configured |
| TanStack Router | File-based routing ready |
| TanStack Query | QueryClientProvider in __root.tsx |
| Spreeform | Installed and CSS configured |
| ClientOnly wrapper | Built-in via `@tanstack/react-router` for SSR-safe providers |
| Tailwind CSS v4 | Vite plugin configured |
| TypeScript | Strict mode enabled |
| 404 Page | notFoundComponent configured |

## Project Structure

```
project/
├── package.json          # Dependencies and scripts
├── vite.config.ts        # Vite with Tailwind plugin
├── tsconfig.json         # TypeScript config
├── .gitignore            # Git ignore rules
├── .vscode/              # VS Code settings
├── public/               # Static assets
│   └── robots.txt
├── src/
│   ├── router.tsx        # Router configuration
│   ├── styles.css        # Tailwind + Spreeform imports
│   ├── components/       # UI components (create as needed)
│   ├── server/           # Server functions (create as needed)
│   └── routes/
│       ├── __root.tsx    # Root layout with QueryClientProvider
│       └── index.tsx     # Home page
└── README.md             # Project documentation
```

## TanStack Start API Patterns

### CRITICAL: Common Mistakes to Avoid

| Wrong | Correct |
|-------|---------|
| `import { ... } from '@tanstack/start'` | `import { ... } from '@tanstack/react-start'` |
| `.validator()` | `.inputValidator()` |

For server functions, routing, TanStack Query, and TanStack Table patterns, see the **/tanstack** skill.

## Adding Spreeform Page Layout

When adding a full page layout with sidebar, theme, or navigation — refer to the **/spreeform** skill for complete examples and SSR compatibility rules.

**Key points:**
- `ThemeProvider` and `SidebarProvider` **must** be wrapped in `<ClientOnly>` (from `@tanstack/react-router`) to avoid `localStorage` crashes during server-side rendering
- See **/spreeform** → "SSR Compatibility" and "Page Layout" sections for full code examples

## Architecture Guidelines

1. **Server functions** for all backend operations (database, external APIs)
2. **File-based routing** in `src/routes/`
3. **UI components** in `src/components/`
4. **Server code** in `src/server/`
5. **Types** can go in `src/types/` or colocated with components

## Checklist

- [ ] Copy template files to project directory
- [ ] Rename `.template` files (package.json, README.md)
- [ ] Replace `{{PROJECT_NAME}}` with actual project name
- [ ] Run `bun install`
- [ ] Run `bun dev` to verify setup

## Template Info

- **Template Version**: 1.0.0
- **Location**: `${PLUGIN_ROOT}/templates/tanstack-start/` (bundled with kova plugin)
- **Last Updated**: 2026-01-27

## Related Skills

- **/tanstack** - Detailed TanStack Start, Router, Query, and Table patterns
- **/spreeform** - Spreeform component library reference

## Maintenance

- **/refresh-template** - Project-level command to update template dependencies
