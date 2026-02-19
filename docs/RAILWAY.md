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

- `orchwiz-node` -> `node`
- `orchwiz-data-core` -> `services/data-core`
- `orchwiz-provider-proxy` -> `services/provider-proxy`

## 3) Set Config-as-Code path for each service

- `orchwiz-node` -> `/node/railway.toml`
- `orchwiz-data-core` -> `/services/data-core/railway.toml`
- `orchwiz-provider-proxy` -> `/services/provider-proxy/railway.toml`

## 4) Set required environment variables

### `orchwiz-node`

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SITE_URL`

### `orchwiz-data-core`

- `DATA_CORE_DATABASE_URL`

### `orchwiz-provider-proxy`

- `PROVIDER_PROXY_API_KEY` (recommended)

## 5) Optional internal wiring variables

- Node -> Data Core: `DATA_CORE_BASE_URL`
- Node -> Provider Proxy: `CODEX_PROVIDER_PROXY_URL`

## Scope and defaults

- Build strategy: Dockerfile
- Included services: `node`, `data-core`, `provider-proxy`
- Out of scope: `wallet-enclave`, `kugelaudio-tts`
- DB migrations: operator-managed (no automatic migration hook in Railway manifests)
