# CLAUDE.md

Operational guide for AI coding agents and context for automated review.
**Code conventions live in `docs/coding-guidelines.md`** — the canonical source, linked from CodeRabbit's Knowledge Base. This file does **not** restate them; it captures operational knowledge and feature-specific structure found nowhere else in the repo.

## Stack

- Frontend: React 18 + TypeScript + Vite + MUI v7; i18n via react-i18next (`src/i18n/fr.json`, `src/i18n/en.json`).
- Backend: .NET 8 + EF Core + PostgreSQL; Docker; GitHub Actions CI.
- Search: **Typesense** is the selected engine (settled over Elasticsearch), but it is **not yet wired** into `docker-compose` or the backend on `develop` — it currently appears only as a tech-stack logo on the landing page. Verify the live search path before assuming Typesense is callable.

## Environment & commands

- **Docker**: `docker compose up --build -d` to (re)build the stack. **Never pass `-f`** — Compose auto-merges `docker-compose.override.yml`, which injects the secrets. **Never pass `-v`** unless a migration changed: `down -v` destroys the database. `docker compose down` at end of session.
- **Database is `smartcrops`** (not `smartcrops_dev`). Inspect it via `docker exec -it <postgres-container> psql -U smartcrops -d smartcrops` (container name from `docker ps`). A native Windows Postgres may squat port 5432, so the container is ground truth. Postman tests HTTP endpoints, not the DB.
- **API** host port: 5000.
- **Verification suite** (before every commit): `dotnet build SmartCrops.sln && dotnet test SmartCrops.sln && dotnet format SmartCrops.sln --verify-no-changes && cd src/frontend && npm run lint && npm test`.
- **Frontend tests**: the extended timeout (20000 ms) is baked into the package.json test script (`vitest run --testTimeout=20000`), so plain `npm test` carries it — the default 5000 ms flakes `PlantLibrary.test.tsx` under load (SMA-174). **Never pass `--testTimeout` on the npm CLI** (`npm test -- --testTimeout=20000`): vitest 4 rejects the duplicated flag. For single-file runs use `npx vitest run <file> --testTimeout=20000`.

## Git & review workflow (STOP-gated, human merges)

- Branch from `develop` → commit → push → open PR → trigger CodeRabbit (`@coderabbitai review`; re-review is **manual**) → harvest → human squash-merge with `--delete-branch`. **Never commit to `develop`. Never auto-merge.**
- **Harvest = STOP AND REPORT.** CodeRabbit findings live on three disjoint surfaces (GitHub inline comments, GitHub review body, VS Code extension JSON) — cross-check all three; they routinely diverge. **Every finding skipped/deferred/rejected becomes a Linear issue** (labels `cr-deferred`/`cr-rejected` + `tech-debt`/`post-v2`) **before merge**. A trivial fix still goes through push + re-review, never a silent edit.
- **No merge without green CI.** Known flake: `PlantLibrary.test.tsx` timeout (SMA-174) — re-run the failed job; on a no-code PR it is not a regression.

## Pre-flight audit

Before any schema / seed / structural change, or before editing a file outside the current scope, audit what already exists read-only — memory can be stale. Don't recreate what's already there.

## Data wiring — Plant Detail v2 (536 plants)

Gauge-worthy data lives in **`PlantPerenualData`** (~96% filled), **not** in the legacy `Plants` columns (SunExposure/WaterNeeds/Sowing/Harvest ~6%, Spread 0%). Sun/pH/temp/spacing come from Perenual xData; height/hardiness/care from `Plants`. Wire detail fields from `PlantPerenualData`.

## Licensing gate (SMA-70)

`ExposeSourceText=false` in both `appsettings.json` gates every Perenual free-text care field (full care-guide JSON, propagation/sowing instructions). Only non-copyrightable factual values are exposed. Don't un-gate free text without a product/legal decision.

## Plant Detail v2 — structure

- Frozen 15-section skeleton: 01 hero, 02 gallery, 03 distribution, 04 calendar, 05 scientific (`#scientific-data`), 06 characteristics (`#characteristics`), 07 culture (`#edible`), 08 pests (`#pests`, rendered only when `pests.length > 0`), 09–15 (names, synonyms, observations, resources, similar, FAQ, community).
- `SectionHeader` is a **default** export. Each section component is a **named** export, wrapped in `memo`, and mode-aware (reads `palette.mode`).
- Shared parse/util helpers live in `src/utils/plantDetail.ts` (e.g. `toCamelKey`, `getCultureFacts`) and are the single source feeding both a section's visibility gate and its render.
