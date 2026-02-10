# OrchWiz Node App

This directory contains the main Next.js application (`node/`) for OrchWiz.

## Current Status

- Runtime path is implemented with OpenClaw-first selection and fallback provider/local fallback.
- Command execution is implemented behind explicit safety gating + permission matching.
- Forwarding ingest/config/test routes are implemented with auth/signature/replay/rate-limit checks.
- Forwarded aggregate reads are implemented across sessions, commands, actions, tasks, verification, deployments, and applications.
- SSE realtime stream is implemented at `/api/events/stream` and used by dashboard pages.

## Prerequisites

- Node.js 18+
- PostgreSQL

## Setup

```bash
cd node
cp .env.example .env
npm install
npm run db:migrate
npm run db:generate
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

Copy `node/.env.example`. Key groups:

- Core auth/db: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`
- User role bootstrap: `ORCHWIZ_ADMIN_EMAILS` (comma-separated emails promoted to `admin`; default role is `captain`)
- GitHub auth/webhooks: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET`, `ENABLE_GITHUB_WEBHOOK_COMMENTS`, `GITHUB_TOKEN`
- Command execution policy: `ENABLE_LOCAL_COMMAND_EXECUTION`, `LOCAL_COMMAND_TIMEOUT_MS`, `COMMAND_EXECUTION_SHELL`, `ENABLE_LOCAL_INFRA_AUTO_INSTALL`, `LOCAL_INFRA_COMMAND_TIMEOUT_MS`
- Runtime provider: `OPENCLAW_*`, `OPENCLAW_DISPATCH_PATH`, `OPENCLAW_DISPATCH_TIMEOUT_MS`, `ENABLE_OPENAI_RUNTIME_FALLBACK`, `OPENAI_API_KEY`, `OPENAI_RUNTIME_FALLBACK_MODEL`, `CODEX_CLI_PATH`, `CODEX_RUNTIME_TIMEOUT_MS`, `CODEX_RUNTIME_MODEL`, `RUNTIME_PROFILE_DEFAULT`, `RUNTIME_PROFILE_QUARTERMASTER`
- Bridge chat compatibility auth: `BRIDGE_ADMIN_TOKEN`
- Ship Yard machine auth: `SHIPYARD_API_TOKEN`
- Wallet enclave: `WALLET_ENCLAVE_ENABLED`, `WALLET_ENCLAVE_URL`, `WALLET_ENCLAVE_TIMEOUT_MS`, `WALLET_ENCLAVE_REQUIRE_BRIDGE_SIGNATURES`, `WALLET_ENCLAVE_REQUIRE_PRIVATE_MEMORY_ENCRYPTION`, `WALLET_ENCLAVE_SHARED_SECRET`
- Encrypted Langfuse traces: `TRACE_ENCRYPT_ENABLED`, `TRACE_ENCRYPT_REQUIRED`, `TRACE_ENCRYPT_FIELDS`, `LANGFUSE_BASE_URL`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `OBSERVABILITY_DECRYPT_ADMIN_TOKEN`
- Deployment connector: `DEPLOYMENT_CONNECTOR_URL`, `DEPLOYMENT_CONNECTOR_API_KEY`, `DEPLOYMENT_AGENT_PATH`, `DEPLOYMENT_APPLICATION_PATH`
- Forwarding ingest/source defaults: `ENABLE_FORWARDING_INGEST`, `FORWARDING_RATE_LIMIT`, `FORWARDING_RATE_WINDOW_MS`, `DEFAULT_FORWARDING_API_KEY`, `DEFAULT_SOURCE_NODE_ID`, `DEFAULT_SOURCE_NODE_NAME`, `FORWARD_TARGET_URL`, `FORWARD_API_KEY`, `FORWARDING_FEATURE_ENABLED`
- Bridge dispatch queue: `BRIDGE_DISPATCH_RETRY_BASE_MS`, `BRIDGE_DISPATCH_MAX_ATTEMPTS`, `BRIDGE_DISPATCH_RETAIN_COUNT`
- AgentSync loop + nightly cron: `AGENTSYNC_ENABLED`, `AGENTSYNC_CRON_TOKEN`, `AGENTSYNC_LOOKBACK_DAYS`, `AGENTSYNC_MIN_SIGNALS`
- Realtime toggle: `ENABLE_SSE_EVENTS`

Optional magic-link email config used by auth in non-local environments:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

## Deployment Profiles

Create flows for both agent and application deployments support profile-aware fields:

- `deploymentProfile`: `local_starship_build` or `cloud_shipyard`
- `provisioningMode`: `terraform_ansible`, `terraform_only`, or `ansible_only`
- `config.infrastructure`:
  - `kind` (`kind`, `minikube`, `existing_k8s`)
  - `kubeContext`
  - `namespace`
  - `terraformWorkspace`
  - `terraformEnvDir`
  - `ansibleInventory`
  - `ansiblePlaybook`

### Ship Yard Local Launch (Sane Bootstrap)

`POST /api/ship-yard/launch` now supports local provisioning for `deploymentProfile=local_starship_build`.

- Request option: `saneBootstrap?: boolean` (defaults to `true` for local profile)
- Assisted mode (`saneBootstrap=true`) can auto-install missing local CLIs when `ENABLE_LOCAL_INFRA_AUTO_INSTALL=true`
- Local provisioning execution still requires `ENABLE_LOCAL_COMMAND_EXECUTION=true`
- Local flow validates kube context presence but does not auto-create/start clusters
- Failures return structured non-2xx responses with `error`, `code`, and optional `details.suggestedCommands`

Machine-auth for Ship Yard can use `Authorization: Bearer ${SHIPYARD_API_TOKEN}`.

- If bearer auth is used, `userId` is required (`body.userId`, `?userId=...`, or `x-orchwiz-user-id` header).
- If no bearer header is provided, the route falls back to session auth.

`GET /api/ship-yard/status/:id` returns deployment + bridge crew state with the same auth behavior.

### Ship Yard curl examples

```bash
curl -X POST http://localhost:3000/api/ship-yard/launch \
  -H "Authorization: Bearer ${SHIPYARD_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_cuid_here",
    "name": "NX-74205",
    "description": "Local Ship Yard launch via machine token",
    "nodeId": "local-node",
    "deploymentProfile": "local_starship_build",
    "provisioningMode": "terraform_ansible",
    "nodeType": "local",
    "saneBootstrap": true,
    "crewRoles": ["xo", "ops", "eng", "sec", "med", "cou"],
    "config": {
      "infrastructure": {
        "kind": "kind",
        "kubeContext": "kind-orchwiz",
        "namespace": "orchwiz-starship",
        "terraformWorkspace": "starship-local",
        "terraformEnvDir": "infra/terraform/environments/starship-local",
        "ansibleInventory": "infra/ansible/inventory/local.ini",
        "ansiblePlaybook": "infra/ansible/playbooks/starship_local.yml"
      }
    }
  }'
```

```bash
curl http://localhost:3000/api/ship-yard/status/<deployment-id>?userId=<user_cuid_here> \
  -H "Authorization: Bearer ${SHIPYARD_API_TOKEN}"
```

Profile behavior:

- `local_starship_build` derives node type `local`
- `local_starship_build` defaults to `config.infrastructure.kind=kind` and `kubeContext=kind-orchwiz`
- `cloud_shipyard` derives node type `cloud` (advanced UI override can select `hybrid`)
- `cloud_shipyard` defaults to `config.infrastructure.kind=existing_k8s`

## Runtime Profiles

Runtime execution uses provider chains resolved by profile:

- `default`: `openclaw -> openai-fallback -> local-fallback`
- `quartermaster`: `codex-cli -> openclaw -> openai-fallback -> local-fallback`

You can override chain order per profile with:

- `RUNTIME_PROFILE_DEFAULT`
- `RUNTIME_PROFILE_QUARTERMASTER`

Unknown provider ids are ignored and `local-fallback` is always appended.

Quartermaster prompts set `metadata.runtime.profile=quartermaster` and include ship-scoped metadata for `QTM-LGR`.

## Key APIs

- Core: `/api/sessions`, `/api/commands`, `/api/subagents`, `/api/tasks`, `/api/verification`, `/api/actions`
- Bridge connections: `/api/bridge/connections`, `/api/bridge/connections/:id`, `/api/bridge/connections/:id/test`, `/api/bridge/connections/dispatch`
- Bridge chat compatibility: `/api/threads`, `/api/threads/:threadId/messages`
- Deployments: `/api/deployments`, `/api/applications`
- Ship Yard: `/api/ship-yard/launch`, `/api/ship-yard/status/:id`
- Ship Quartermaster: `/api/ships/:id/quartermaster` (GET/POST), `/api/ships/:id/quartermaster/provision` (POST)
- Docs: `/api/docs/claude`, `/api/docs/guidance`
- GitHub: `/api/github/prs`, `/api/github/webhook`
- Forwarding: `/api/forwarding/config`, `/api/forwarding/events`, `/api/forwarding/test`
  - `GET/POST /api/forwarding/config` returns masked `targetApiKey` metadata (no plaintext key in response).
  - `targetApiKey` response fields: `storageMode`, `hasValue`, `maskedValue`.
- Realtime: `/api/events/stream`
- AgentSync: `/api/agentsync/runs`, `/api/agentsync/runs/:id`, `/api/agentsync/preferences`, `/api/agentsync/suggestions/:id/apply`, `/api/agentsync/suggestions/:id/reject`, `/api/agentsync/nightly`
- Observability decrypt: `/api/observability/traces/:traceId/decrypt` (session owner, session `admin`, or bearer admin token)

Forwarded aggregate list endpoints support:

- `includeForwarded=true`
- `sourceNodeId=<node-id>`

Bridge chat mobile utility:

- `/bridge-chat` is a mobile-first utility route with station tabs, sticky composer, and quick directives.
- `GET /api/threads?view=station` lazily ensures canonical station threads are available and linked to bridge sessions.

Bridge Ops external connections:

- `/bridge-connections` manages Telegram/Discord/WhatsApp outbound patch-through per ship deployment.
- COU station responses can auto-relay to enabled `autoRelay` connectors when session metadata includes bridge ship/deployment context.

## Scripts

```bash
npm run dev
npm run lint
npm run test
npm run build
npm run start
npm run db:migrate
npm run db:generate
npm run db:push
npm run db:studio
npm run db:seed
```
