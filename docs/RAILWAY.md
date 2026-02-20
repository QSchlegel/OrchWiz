# Railway Deployment (Core Cloud Set)

This guide configures the core cloud service set on Railway using Dockerfile builds:

- `orchwiz-node` -> `/Users/quirinschlegel/git/orchwiz/node`
- `orchwiz-data-core` -> `/Users/quirinschlegel/git/orchwiz/services/data-core`
- `orchwiz-provider-proxy` -> `/Users/quirinschlegel/git/orchwiz/services/provider-proxy`

## 1) Create Railway services

Create these services in a Railway project:

- `orchwiz-node`
- `orchwiz-data-core`
- `orchwiz-provider-proxy`

## 2) Set each service Root Directory

Use monorepo root directories so each service builds from its own folder:

- `orchwiz-node` -> `/node`
- `orchwiz-data-core` -> `/services/data-core`
- `orchwiz-provider-proxy` -> `/services/provider-proxy`

## 3) Set Config-as-Code path for each service

- `orchwiz-node` -> `/node/railway.toml`
- `orchwiz-data-core` -> `/services/data-core/railway.toml`
- `orchwiz-provider-proxy` -> `/services/provider-proxy/railway.toml`

## 4) Set required environment variables

### `orchwiz-node`

- `DATABASE_URL` — must be set **on the orchwiz-node service** (not only on the Postgres service). After adding or changing it, **redeploy** the service so the new value is injected at process start.
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL` — **must be a full URL with scheme** (e.g. `https://orchwiz.com`). Host-only values like `orchwiz.com` are normalized to `https://` in code, but setting the full URL avoids "Invalid base URL" errors from auth and metrics.
- `NEXT_PUBLIC_APP_URL` — same as above; use full URL (e.g. `https://orchwiz.com`).
- `NEXT_PUBLIC_SITE_URL` — same as above; used for metadata and as fallback for auth base URL.
- Optional for Bridge Runtime Rail SSH console mode:
  - `ORCHWIZ_BRIDGE_SSH_TTY_ENABLED=true` (or keep `ENABLE_LOCAL_COMMAND_EXECUTION=true`)
  - `ORCHWIZ_BRIDGE_SSH_TTY_MAX_SESSION_MS` (optional; defaults to `1800000`)

### `orchwiz-data-core`

- `DATA_CORE_DATABASE_URL`

### `orchwiz-provider-proxy`

- `PROVIDER_PROXY_API_KEY` (recommended)

## 5) Optional internal wiring variables

- Node -> Data Core: `DATA_CORE_BASE_URL`
- Node -> Provider Proxy: `CODEX_PROVIDER_PROXY_URL`

## 6) Bridge Runtime Rail SSH mode prerequisites (optional)

If you want the OpenClaw `SSH` interaction mode in Bridge Runtime Rail:

- Node runtime image must include `ssh` and `kubectl` on `PATH`.
- Ship deployment must resolve an SSH target (deployment tunnel metadata, ship metadata tunnel host, or local terraform fallback when command execution is enabled).
- SSH private key material must be present/decryptable via existing Ship Yard vault flow (`resolveCloudSshPrivateKey`).
- When preflight fails, Bridge stays in SSH mode and shows structured diagnostics (no automatic UI fallback).

## Troubleshooting

### `Prisma did not receive DATABASE_URL` / `datasource.url property is required`

Ensure `DATABASE_URL` is set on the **orchwiz-node** (web) service, not only on the Postgres service. Redeploy after adding or changing the variable so the new env is available at startup. The app also passes the migrate env file by absolute path so the Prisma subprocess can load `DATABASE_URL` from it.

### `The table public.User does not exist` / `The table public.Verification does not exist` (P2021)

The database has not had Prisma migrations applied. Fix:

1. Ensure `DATABASE_URL` is set for `orchwiz-node` and points to the same Postgres used in production.
2. Ensure automatic migrations run on startup: `NODE_ENV=production` (Railway sets this for production) and do **not** set `RUN_MIGRATIONS_ON_STARTUP=false`.
3. If the app started before `DATABASE_URL` was set, restart the service so that startup migrations run.
4. To run migrations manually once (e.g. from your machine), from the repo root: `cd node && npx prisma migrate deploy` (with `DATABASE_URL` in the environment).

### `Invalid base URL: orchwiz.com. Please provide a valid base URL.`

Set `BETTER_AUTH_URL` and/or `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_SITE_URL` to a **full URL** with scheme, e.g. `https://orchwiz.com`. Host-only values are normalized in code, but some code paths (e.g. auth getSession) can still see the raw env; using the full URL everywhere avoids this.

### `Dockerfile \`Dockerfile\` does not exist`

If Railway shows this build error, the service is usually building from the repository root instead of the service directory.

Fix checklist:

1. Open service `Settings` -> `Source` in Railway.
2. Confirm `Root Directory` is set to the correct folder (`/node`, `/services/data-core`, or `/services/provider-proxy`).
3. Confirm `Config as Code` path points to the matching manifest (`/node/railway.toml`, `/services/data-core/railway.toml`, `/services/provider-proxy/railway.toml`).
4. Redeploy the latest commit.

Reference: [Railway Config as Code docs](https://docs.railway.com/config-as-code)

## Scope and defaults

- Build strategy: Dockerfile
- Included services: `node`, `data-core`, `provider-proxy`
- Out of scope: `wallet-enclave`, `kugelaudio-tts`
- DB migrations: **automatic** — on startup the node service runs `prisma migrate deploy` when `NODE_ENV=production` and `DATABASE_URL` is set. To disable: `RUN_MIGRATIONS_ON_STARTUP=false`. To run in non-production: `RUN_MIGRATIONS_ON_STARTUP=true`.
