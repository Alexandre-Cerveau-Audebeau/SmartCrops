# SmartCrops — frontend

The single-page application of [SmartCrops](../../README.md): React 19, TypeScript, Vite,
Material UI 7 and react-i18next.

## Commands

Run them from this folder (`src/frontend`). The lockfile accepts Node.js 20 (20.19 or
later), 22 (22.13 or later) and 24 or later; CI runs Node 20.

| Command | What it does |
| --- | --- |
| `npm ci` | Installs the exact dependencies of `package-lock.json`. |
| `npm run dev` | Starts the Vite dev server. Requests to `/api` are proxied to `VITE_API_URL`, or to `http://localhost:5000` when it is not set. |
| `npm run lint` | Runs ESLint on `src/`. |
| `npm test` | Runs the whole Vitest suite once (the layout suites need Google Chrome: see [Tests](#tests)). The 20-second test timeout is part of the script: do not pass another one. |
| `npm run build` | Type-checks the project (`tsc -b`), then builds it into `dist/`. |
| `npm run format` | Formats `src/` with Prettier. |

`npm run lint`, `npm test` and `npm run build` are the frontend half of the verification
suite described in the [root README](../../README.md#verification-suite).

## Tests

Vitest runs two projects, declared in [`vite.config.ts`](vite.config.ts):

- **`unit`** — every test file except the two below, in jsdom.
- **`layout`** — the two suites of [`src/test/layout`](src/test/layout) that measure real
  layout in a headless Chrome. They run after the `unit` project, one file at a time.

The layout suites need Google Chrome. They look for it in `CHROME_BIN`, then in the usual
install locations. When Chrome is missing, the job fails in CI; on a workstation the two
suites are skipped and `npm test` still passes, so check that its summary reports no
skipped test.

## Where things are

```text
src/
  pages/        One component per route, plus the planner's own modules
  components/   Shared and feature components (Dashboard, Garden, library, plantDetail…)
  contexts/     React contexts
  hooks/        Shared hooks
  services/     Calls to the API
  utils/        Pure helpers and their tests
  types/        Shared TypeScript types
  constants/    Shared constants
  i18n/         en.json and fr.json, kept in parity by a test
  test/         Test setup, fixtures and the layout harness
  theme.ts      Material UI theme, light and dark
  theme/        Design tokens of the dashboard and the planner
public/         Static assets
```

## Containers

- [`Dockerfile`](Dockerfile) — the development image: it runs the Vite dev server and is
  used by the root `docker-compose.yml`.
- [`Dockerfile.prod`](Dockerfile.prod) — the production image: a multi-stage build whose
  result is served by an unprivileged nginx, configured by [`nginx.conf`](nginx.conf).
