# Frontend dev guide

## Prereqs

- Node.js `>= 20` (see `package.json` "engines")
- Install deps from repo root:
  - `npm install`
  - (CI/clean install) `npm ci`

## Run (local dev)

- Start the frontend dev server:
  - `npm run dev:web`

- Start the backend (if you need API features locally):
  - `npm run dev:backend`

- Start both frontend + backend together:
  - `npm run dev:full`

## Format

- Format everything:
  - `npm run prettier`

- Check formatting (no writes):
  - `npm run prettier:check`

## Lint

- Lint with auto-fixes (standard):
  - `npm run lint`

- Lint with more aggressive fixes:
  - `npm run lint:fix`

## Organize imports

This repo primarily uses `oxlint` + `prettier`, but import sorting is handled via Biome.

- Organize imports across the repo:
  - `npm run imports:fix`

## Type check

- Run TypeScript typecheck:
  - `npm run ts`

## Tests

- Run tests once:
  - `npm test`

- Watch mode:
  - `npm run test:watch`

- UI runner:
  - `npm run test:ui`

## Before pushing

- Quick presubmit check:
  - `npm run presubmit`
