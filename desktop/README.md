# OrchWiz Desktop

Electron desktop wrapper that:

1. Starts a Docker-managed Postgres (`docker compose`).
2. Runs the bundled OrchWiz server locally.
3. Opens the UI in a dedicated desktop window.

## Local Dev (from repo)

Prereqs:

- Docker Desktop / Docker Engine (daemon running)
- Node.js 18+

Build the backend once:

```bash
cd node
npm ci
DATABASE_URL="postgresql://orchwiz:orchwiz_dev@localhost:5432/orchis?schema=public" npm run db:generate
npm run build
```

Run the desktop app:

```bash
cd desktop
npm ci
npm run dev
```

## Build Installers

```bash
cd desktop
npm ci
npm run dist
```

Artifacts land in `desktop/dist-app/`.

