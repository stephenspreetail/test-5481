# Frontend dev guide

## Prereqs

- Bun `>= 1.0` (see `package.json` "engines")
- Install deps from repo root:
  - `bun install`
  - (CI/clean install) `bun install --frozen-lockfile`

## Run (local dev)

Start the frontend dev server:

- `bun run dev:web`

Start the backend (if you need API features locally):

- `bun run dev:backend`

Start both frontend + backend together:

- `bun run dev:full`

## Format

Format everything:

- `bun run prettier`

Check formatting (no writes):

- `bun run prettier:check`

## Lint

Lint with auto-fixes (standard):

- `bun run lint`

Lint but allow specific rules (example: allow unused vars):

- `bun run lint -- -A eslint/no-unused-vars`

Lint with more aggressive fixes:

- `bun run lint:fix`

## Organize imports

This repo primarily uses `oxlint` + `prettier`, but import sorting is handled via Biome.

- Organize imports across the repo:
  - `bun run imports:fix`

## Type check

- Run TypeScript typecheck:
  - `bun run ts`

## Tests

Run tests once:

- `bun test`

Watch mode:

- `bun run test:watch`

UI runner:

- `bun run test:ui`

## Before pushing

- Quick presubmit check:
  - `bun run presubmit`
