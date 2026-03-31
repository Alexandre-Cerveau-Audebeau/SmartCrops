# SmartCrops v2 🌱

Eco-friendly web application for virtual garden management. Browse a bilingual plant library, create virtual gardens, and manage your plants — all in one place.

**🔗 [View the project on GitHub](https://github.com/Alexandre-Cerveau-Audebeau/SmartCrops)**

## Features

- **Plant Library** — Browse plants with search, filters by type, and detailed growing conditions (FR/EN)
- **Virtual Gardens** — Create gardens, add plants with notes, inline editing
- **Authentication** — Email/password registration + Google OAuth with JWT
- **Responsive Design** — Mobile-first layout with hero image carousel
- **AI Code Review** — Every PR reviewed by CodeRabbit with 50+ comments addressed

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Material UI v7 |
| Backend | .NET 8, ASP.NET Core, Entity Framework Core 8 |
| Database | PostgreSQL 16 |
| Auth | ASP.NET Core Identity, JWT, Google OAuth |
| Infrastructure | Docker Compose (3 services) |
| CI/CD | GitHub Actions |
| Code Review | CodeRabbit (AI) |
| Dev Tools | Claude Code (AI pair programming) |

## Getting Started

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

### Run with Docker
```bash
git clone https://github.com/Alexandre-Cerveau-Audebeau/SmartCrops.git
cd SmartCrops
docker-compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| API (Swagger) | http://localhost:5000/swagger |
| Health check | http://localhost:5000/health |

## Development

### Full verification (run before each commit)
```bash
dotnet build SmartCrops.sln && dotnet test SmartCrops.sln && dotnet format SmartCrops.sln --verify-no-changes && cd src/frontend && npm run lint && npm test
```

## Project Status

- ✅ 19 PRs merged on develop
- ✅ 17 REST API endpoints (9 Plants + 4 Auth + 7 Gardens + PATCH)
- ✅ 10 backend integration tests
- ✅ Bilingual plant data (FR/EN)
- 🔜 Internationalization (react-i18next)
- 🔜 Cloud deployment (AWS)
- 🔜 Garden Planner (drag-and-drop grid)

## License

This project is for educational and portfolio purposes.

---

*Built by [Alexandre Cerveau Audebeau](https://linkedin.com/in/acervaude/) — rebuilt from a 2022 Master's thesis with modern tooling and AI-assisted development workflows.*
