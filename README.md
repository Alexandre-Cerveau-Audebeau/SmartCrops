# SmartCrops

Eco-friendly web application for virtual garden management.

## Tech Stack

- **Backend:** .NET 8 (ASP.NET Core)
- **Frontend:** React 19, TypeScript, Vite
- **Database:** PostgreSQL 16
- **Infrastructure:** Docker, Docker Compose
- **CI:** GitHub Actions

## Getting Started

### Prerequisites

- [Node.js 20+](https://nodejs.org/)
- [.NET 8 SDK](https://dotnet.microsoft.com/download)
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

### Testing

```bash
# Backend
dotnet test SmartCrops.sln

# Frontend
cd src/frontend && npm test
```

### Linting & Formatting

```bash
# Frontend — ESLint
cd src/frontend && npm run lint

# Backend — dotnet format
dotnet format SmartCrops.sln
```
