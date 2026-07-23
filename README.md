# SmartCrops v2 🌱

Full-stack web application for planning and managing virtual gardens. Browse a bilingual
catalogue of 536 plants, search it through a faceted finder, and design real garden layouts
on a grid that models sunlight, shade and plant footprints.

**🔗 [github.com/Alexandre-Cerveau-Audebeau/SmartCrops](https://github.com/Alexandre-Cerveau-Audebeau/SmartCrops)**

---

## Features

### Plant library & finder

- **536 plants** with bilingual content (FR/EN): common names, scientific names, growing
  conditions, watering and sunlight requirements, hardiness, spacing, dimensions.
- **Faceted search** powered by Typesense — typo-tolerant full-text search combined with
  enum facets (type, cycle, watering, care level…), boolean filters, and continuous range
  sliders for height, hardiness, pH, spacing and temperature.
- **Live facet counts** with disjunctive faceting: selecting a value updates the other
  facets' counts correctly, so the user always sees what a given filter *would* yield.
- **Plant detail pages** with a photo gallery, a growing calendar, and care data presented
  as gauges and structured sections.

### Garden planner

The core of the application: an interactive grid where a garden is designed cell by cell.

- **Garden configuration** — dimensions, cell size (25 cm / 50 cm / 1 m), orientation,
  garden type (balcony, terrace, open ground, greenhouse, indoor), hemisphere and latitude
  band, plus a light schedule for indoor gardens.
- **Sunlight exposure model** — per-cell sun exposure computed from orientation, time of day
  (morning / noon / evening) and season, rendered as a toggleable colour layer.
- **Infrastructures** — walls, fences, trellises, paths, water points and pots painted onto
  the grid, rendered by region, each casting **real directional shadows** that react to the
  selected time and season.
- **Plant placement** — a dedicated Place mode with click-to-place and pointer-based
  drag & drop: a floating ghost preview, grid-snapped target cells, valid/collision
  feedback, and existing placements that can be dragged to a new position.
- **Multi-cell footprints** — a plant occupies an area derived from its Perenual spacing
  data (a courgette spanning 2×2 cells at 50 cm/cell, for instance). The suggestion is
  clamped to the garden's dimensions and **remains fully adjustable by the user**: a tree
  grown in a pot can be resized down to a single cell.
- **Shape editing** — activate or deactivate individual cells to model non-rectangular
  gardens, with an undo history and unsaved-changes tracking.

### Accounts & platform

- **Authentication** — email/password registration and Google OAuth, built on ASP.NET Core
  Identity with JWT carried in HttpOnly cookies and security-stamp validation.
- **Bilingual interface** (FR/EN) across every page, including plant data and legal content.
- **Public pages** — home, about, legal notice, privacy policy, terms of use, and a contact
  form backed by a real transactional email service with per-IP rate limiting.
- **Responsive layouts** with light and dark themes.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Material UI v7, react-i18next |
| Backend | .NET 8, ASP.NET Core, Entity Framework Core 8 |
| Database | PostgreSQL 16 |
| Search | Typesense |
| Auth | ASP.NET Core Identity, JWT (HttpOnly cookies), Google OAuth |
| Email | MailKit (SMTP) |
| Infrastructure | Docker Compose (4 services) |
| CI | GitHub Actions |
| Code review | CodeRabbit |

### Plant data sources

Plant data is aggregated from three complementary APIs into a denormalised read model:

- **[GBIF](https://www.gbif.org/)** — canonical taxonomy and species identity resolution.
- **[Trefle](https://trefle.io/)** — photographs, multilingual common names, synonyms.
- **[Perenual](https://perenual.com/)** — care data, watering, dimensions, spacing.

---

## Getting started

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [.NET 8 SDK](https://dotnet.microsoft.com/download) (for local development)
- [Node.js 20+](https://nodejs.org/) (for local development)

### Run with Docker

```bash
git clone https://github.com/Alexandre-Cerveau-Audebeau/SmartCrops.git
cd SmartCrops
docker compose up --build -d
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| API (Swagger) | http://localhost:5000/swagger |
| Health check | http://localhost:5000/health |
| Typesense | http://localhost:8108 |

The stack runs four containers: PostgreSQL, the ASP.NET Core API, the built frontend, and
Typesense.

> Secrets (database credentials, API keys, SMTP password, OAuth client secrets) are supplied
> through .NET user-secrets in development and through a git-ignored
> `docker-compose.override.yml` for the containerised stack. No credentials are committed.

---

## Development

### Verification suite

Run before every commit — the frontend build is part of the suite, not optional
(TypeScript configuration errors surface only at build time):

```bash
dotnet build SmartCrops.sln && \
dotnet test SmartCrops.sln && \
dotnet format SmartCrops.sln --verify-no-changes && \
cd src/frontend && npm run lint && npm test && npm run build
```

### Repository layout

```
src/
  backend/          ASP.NET Core solution (API, Core, Infrastructure, Tests)
  frontend/         React + TypeScript application (Vite)
docs/
  design/           Design tokens and reference mockups
```

---

## Project status

_As of 22 July 2026 — develop branch._

**Delivered**

- ✅ Plant library with 536 bilingual entries and detail pages
- ✅ Faceted plant finder (Typesense, live facet counts, range sliders)
- ✅ Garden planner: configuration, shape editing, sunlight exposure, infrastructures with
  cast shadows, place mode, drag & drop, adjustable multi-cell footprints
- ✅ Authentication (email/password, Google OAuth, HttpOnly cookies)
- ✅ Full FR/EN internationalisation
- ✅ Legal pages, GDPR content, and a working contact form with transactional email
- ✅ 46 REST API endpoints
- ✅ 774 backend tests / 725 frontend tests
- ✅ 29 EF Core migrations

**In progress**

- 🚧 Garden planner polish — deletion confirmation, mobile layouts, garden templates,
  PDF/image export
- 🚧 Per-cell soil types

**Planned**

- 🔜 Production deployment (OVH VPS)
- 🔜 AI-assisted features — plant recommendations, weather integration, sowing and
  harvesting calendar, companion planting

---

## License

**All rights reserved.** This repository is published for portfolio and educational review
only. No licence is granted for reuse, redistribution or derivative works.

---

_Built by [Alexandre Cerveau Audebeau](https://linkedin.com/in/acervaude/) — a ground-up
rebuild of a 2022 Master's thesis project._
