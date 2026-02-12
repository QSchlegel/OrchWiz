# OrchWiz Getting Started

This guide gets OrchWiz running locally with the current app stack (`node/` + local Postgres).

For ISO 27001 + SOC 2 cert-ready baseline documentation, see
[Compliance overview](compliance/README.md).

## Prerequisites

- Node.js 18+ (Node.js 20 recommended)
- npm
- Docker + Docker Compose
- Git

## 1) Clone and start Postgres

```bash
git clone git@github.com:QSchlegel/OrchWiz.git
cd OrchWiz

cd dev-local
docker compose up -d
```

Local Postgres is exposed on `localhost:5435`.

## 2) Configure app environment

```bash
cd ../node
cp .env.example .env
```

Update these values in `node/.env`:

```dotenv
DATABASE_URL=postgresql://orchwiz:orchwiz_dev@localhost:5435/orchis?schema=public
BETTER_AUTH_SECRET=<set-a-random-secret>
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
# Optional: make specific users admin at sign-in
ORCHWIZ_ADMIN_EMAILS=you@example.com
# Landing XO teaser is enabled by default
LANDING_XO_ENABLED=true
LANDING_XO_STAGE=public-preview
```

Optional Quartermaster Codex runtime settings (recommended for local ship-quartermaster prompts):

```dotenv
CODEX_CLI_PATH=/Applications/Codex.app/Contents/Resources/codex
# Optional:
CODEX_RUNTIME_MODEL=
CODEX_RUNTIME_WORKDIR=/absolute/path/to/workspace
```

Generate a local auth secret:

```bash
openssl rand -base64 32
```

## 3) Install, initialize DB, and run

```bash
npm install
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Optional: verify Ship Yard API smoke harness

Use this after local setup when you want a quick auth + endpoint readiness check for Ship Yard user API key flows.

```bash
cd /path/to/OrchWiz/node
export SHIPYARD_BEARER_TOKEN="owz_shipyard_v1.<keyId>.<secret>"
npm run shipyard:smoke
```

Optional base URL override:

```bash
export SHIPYARD_BASE_URL="http://localhost:3000"
```

Expected result:

- Checks print `PASS`/`FAIL`/`ERR` lines and a summary.
- Exit code `0` means smoke checks passed.

For full endpoint matrix, flags, exit codes, and troubleshooting, see:
[Ship Yard API Smoke Harness](../node/README.md#ship-yard-api-smoke-harness).

## Optional: run Ship Yard local launch debug loop

Use this to run a full local launch + probe loop for `local_starship_build` and get direct remediation hints when provisioning fails.

```bash
cd /path/to/OrchWiz/node
export SHIPYARD_BEARER_TOKEN="owz_shipyard_v1.<keyId>.<secret>"
npm run shipyard:local:debug
```

Notes:

- For `kind`, local bootstrap uses Docker to build/load `orchwiz:local-dev` from `node/Dockerfile.shipyard` when `saneBootstrap=true`.
- Debug loop enforces one-ship-at-a-time for debug ships: it deletes prior debug ships by name prefix and recreates the target kind cluster before launching.
- kind control-plane containers are expected to run in Docker for local kind-based testing.
- First run can take several minutes, and launch can be quiet while Terraform/Ansible runs inline.
- On `failed` status, the loop automatically calls `/api/ship-yard/status/<deploymentId>/inspection?includeRuntime=true&deliveriesTake=6` and prints curated failure/readout diagnostics.
- Terminal exit code:
  - `0`: ship reached `active`
  - `1`: ship reached `failed`
  - `2`: preflight/runtime failure

Detailed controls and local bootstrap variables are documented in:
[Ship Yard Local Launch (Sane Bootstrap)](../node/README.md#ship-yard-local-launch-sane-bootstrap).

## Optional: expose local webhook flows with ngrok

Use this when you need external services to reach local webhook endpoints (`/api/github/webhook`, `/api/hooks/trigger`) and when your PostToolUse hooks target ngrok-hosted receivers.

1. Start app and receiver tunnels in separate terminals:

```bash
cd node
npm run dev:ngrok:app
```

```bash
cd node
npm run dev:ngrok:webhooks
```

2. Print discovered URLs and copy-ready snippets:

```bash
cd node
npm run dev:ngrok:urls
```

3. In `node/.env`, opt in to ngrok webhook domains:

```dotenv
HOOK_WEBHOOK_ALLOW_NGROK=true
```

Keep this disabled in environments where ngrok targets should not be accepted.

## Optional: run modular knowledge ingest (llm-graph-builder provider)

This is an opt-in external ingest path and is isolated from default local startup.

1. Clone `llm-graph-builder` next to this repo (or set `LGB_REPO_PATH`):

```bash
cd ..
git clone https://github.com/neo4j-labs/llm-graph-builder.git
```

2. Start overlay services:

```bash
cd /path/to/OrchWiz/dev-local
docker compose -f docker-compose.yml -f docker-compose.ingest.llm-graph-builder.yml up -d
```

3. Configure `node/.env` ingest vars (`KNOWLEDGE_INGEST_*`, `LGB_*`), then run:

```bash
cd /path/to/OrchWiz/node
npm run knowledge:ingest:dry-run
npm run knowledge:ingest
```

## 4) Sign in

- Go to `/login`
- Use passkey sign-in, or create an account with email + passkey
- Magic-link sign-in is also available
  - In non-production without Resend configured, the generated link is logged to the server console

Landing-specific notes:

- `/` includes an XO teaser chat window that requires passkey unlock before chat is available.
- `/docs` is a public docs hub for XO slash commands, passkey guardrails, and cloud toggle behavior.
- Set `LANDING_XO_ENABLED=false` to disable XO on public cloud without code changes.

## Optional: run with wallet-enclave enabled

Some security-sensitive features use wallet-enclave encryption/signing.

Start wallet-enclave:

```bash
cd services/wallet-enclave
npm install
export WALLET_ENCLAVE_MASTER_SECRET="$(openssl rand -base64 32)"
export WALLET_ENCLAVE_SHARED_SECRET="dev-wallet-token"
npm run dev
```

Use matching settings in `node/.env`:

```dotenv
WALLET_ENCLAVE_ENABLED=true
WALLET_ENCLAVE_REQUIRE_PRIVATE_MEMORY_ENCRYPTION=true
WALLET_ENCLAVE_REQUIRE_BRIDGE_SIGNATURES=true
WALLET_ENCLAVE_URL=http://127.0.0.1:3377
WALLET_ENCLAVE_SHARED_SECRET=dev-wallet-token
```

If you are not running wallet-enclave locally, set:

```dotenv
WALLET_ENCLAVE_ENABLED=false
WALLET_ENCLAVE_REQUIRE_PRIVATE_MEMORY_ENCRYPTION=false
WALLET_ENCLAVE_REQUIRE_BRIDGE_SIGNATURES=false
```

## First-run checklist

After login, verify these paths:

1. `/sessions`: create a session.
2. `/commands`: confirm seeded shared commands are visible.
3. `/ship-yard`: open launch wizard and profile options.
4. `/security`: run a security audit.
5. `/vault`: browse vault explorer and graph.

## Troubleshooting

- `Prisma can't connect`: check `DATABASE_URL` points to port `5435` and Postgres is running.
- `BETTER_AUTH_SECRET` errors: ensure it is set and non-empty.
- Wallet enclave errors (`WALLET_ENCLAVE_DISABLED`/`WALLET_ENCLAVE_UNREACHABLE`):
  - Start wallet-enclave, or disable enclave-required flags in local `.env`.
- Port conflicts:
  - App default: `3000`
  - Local Postgres: `5435`
