# OrchWiz Node App

This directory contains the main Next.js application (`node/`) for OrchWiz.

## Current Status

- Runtime path is implemented with OpenClaw-first selection and fallback provider/local fallback.
- Command execution is implemented behind explicit safety gating + permission matching.
- Forwarding ingest/config/test routes are implemented with auth/signature/replay/rate-limit checks.
- Forwarded aggregate reads are implemented across sessions, commands, actions, tasks, verification, deployments, and applications.
- SSE realtime stream is implemented at `/api/events/stream` and used by dashboard pages.
- Vault is implemented as an Obsidian-lite workspace (create/edit/save/rename/move/delete, soft-trash safety, and joined graph view).
- Vault RAG is implemented with hybrid retrieval (OpenAI embeddings + lexical fallback), ship/fleet/global scope ranking, and quartermaster citation enforcement.
- Data-core integration is implemented behind feature flags for non-private memory domains (`orchwiz`, `ship`, `agent-public`) while private memory remains local.
- Ship knowledge base APIs are implemented at `/api/ships/:id/knowledge*` with owner-scoped read/write/query/resync support.

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
- PostToolUse hooks/webhooks: `HOOK_TRIGGER_BEARER_TOKEN`, `HOOK_WEBHOOK_TARGET_ALLOWLIST`, `HOOK_WEBHOOK_ALLOW_NGROK`, `HOOK_WEBHOOK_TIMEOUT_MS`
- Command execution policy: `ENABLE_LOCAL_COMMAND_EXECUTION`, `LOCAL_COMMAND_TIMEOUT_MS`, `COMMAND_EXECUTION_SHELL`, `ENABLE_LOCAL_INFRA_AUTO_INSTALL`, `LOCAL_INFRA_COMMAND_TIMEOUT_MS`, `CLOUD_DEPLOY_ONLY` (set `true` to block local starship launches and force cloud-only Ship Yard posture)
- Runtime provider: `OPENCLAW_*`, `OPENCLAW_DISPATCH_PATH`, `OPENCLAW_DISPATCH_TIMEOUT_MS`, `ENABLE_OPENAI_RUNTIME_FALLBACK`, `OPENAI_API_KEY`, `OPENAI_RUNTIME_FALLBACK_MODEL`, `CODEX_CLI_PATH`, `CODEX_RUNTIME_TIMEOUT_MS`, `CODEX_RUNTIME_MODEL`, `RUNTIME_PROFILE_DEFAULT`, `RUNTIME_PROFILE_QUARTERMASTER`
- Runtime intelligence policy: `RUNTIME_INTELLIGENCE_POLICY_ENABLED`, `RUNTIME_INTELLIGENCE_REQUIRE_CONTROLLABLE_PROVIDERS`, `RUNTIME_INTELLIGENCE_MAX_MODEL`, `RUNTIME_INTELLIGENCE_SIMPLE_MODEL`, `RUNTIME_INTELLIGENCE_CLASSIFIER_MODEL`, `RUNTIME_INTELLIGENCE_CLASSIFIER_TIMEOUT_MS`, `RUNTIME_INTELLIGENCE_LANGFUSE_PROMPT_NAME`, `RUNTIME_INTELLIGENCE_LANGFUSE_PROMPT_LABEL`, `RUNTIME_INTELLIGENCE_LANGFUSE_PROMPT_VERSION`, `RUNTIME_INTELLIGENCE_LANGFUSE_PROMPT_CACHE_TTL_SECONDS`, `RUNTIME_INTELLIGENCE_USD_TO_EUR`, `RUNTIME_INTELLIGENCE_MODEL_PRICING_USD_PER_1M`, `RUNTIME_INTELLIGENCE_THRESHOLD_DEFAULT`, `RUNTIME_INTELLIGENCE_THRESHOLD_MIN`, `RUNTIME_INTELLIGENCE_THRESHOLD_MAX`, `RUNTIME_INTELLIGENCE_LEARNING_RATE`, `RUNTIME_INTELLIGENCE_EXPLORATION_RATE`, `RUNTIME_INTELLIGENCE_TARGET_REWARD`, `RUNTIME_INTELLIGENCE_NIGHTLY_CRON_TOKEN`
- Bridge TTS (optional Kugelaudio sidecar): `BRIDGE_TTS_ENABLED`, `KUGELAUDIO_TTS_BASE_URL`, `KUGELAUDIO_TTS_TIMEOUT_MS`, `KUGELAUDIO_TTS_BEARER_TOKEN`, `KUGELAUDIO_TTS_CFG_SCALE`, `KUGELAUDIO_TTS_MAX_TOKENS`, `KUGELAUDIO_TTS_VOICE_DEFAULT`, `KUGELAUDIO_TTS_VOICE_XO`, `KUGELAUDIO_TTS_VOICE_OPS`, `KUGELAUDIO_TTS_VOICE_ENG`, `KUGELAUDIO_TTS_VOICE_SEC`, `KUGELAUDIO_TTS_VOICE_MED`, `KUGELAUDIO_TTS_VOICE_COU`
- Skills catalog/import: `ORCHWIZ_CODEX_HOME_ROOT`, `ORCHWIZ_SKILL_IMPORT_TIMEOUT_MS`, `ORCHWIZ_SKILL_CATALOG_STALE_MS`
- Bridge chat compatibility auth: `BRIDGE_ADMIN_TOKEN`
- Ship Yard machine auth: `SHIPYARD_API_TOKEN`
- Ship Yard token scope controls: `SHIPYARD_API_ALLOWED_USER_IDS`, `SHIPYARD_API_TOKEN_USER_ID`, `SHIPYARD_API_ALLOW_IMPERSONATION`, `SHIPYARD_API_DEFAULT_USER_ID`
- Landing XO teaser controls: `LANDING_XO_ENABLED` (default `true`), `LANDING_XO_STAGE` (default `public-preview`)
- Wallet enclave: `WALLET_ENCLAVE_ENABLED`, `WALLET_ENCLAVE_URL`, `WALLET_ENCLAVE_TIMEOUT_MS`, `WALLET_ENCLAVE_REQUIRE_BRIDGE_SIGNATURES`, `WALLET_ENCLAVE_REQUIRE_PRIVATE_MEMORY_ENCRYPTION`, `WALLET_ENCLAVE_SHARED_SECRET`
- Encrypted Langfuse traces: `TRACE_ENCRYPT_ENABLED`, `TRACE_ENCRYPT_REQUIRED`, `TRACE_ENCRYPT_FIELDS`, `LANGFUSE_BASE_URL`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `OBSERVABILITY_DECRYPT_ADMIN_TOKEN`
- Deployment connector: `DEPLOYMENT_CONNECTOR_URL`, `DEPLOYMENT_CONNECTOR_API_KEY`, `DEPLOYMENT_AGENT_PATH`, `DEPLOYMENT_APPLICATION_PATH`
- Forwarding ingest/source defaults: `ENABLE_FORWARDING_INGEST`, `FORWARDING_RATE_LIMIT`, `FORWARDING_RATE_WINDOW_MS`, `DEFAULT_FORWARDING_API_KEY`, `DEFAULT_SOURCE_NODE_ID`, `DEFAULT_SOURCE_NODE_NAME`, `FORWARD_TARGET_URL`, `FORWARD_API_KEY`, `FORWARDING_FEATURE_ENABLED`
- Forwarding test guardrails: `FORWARDING_TEST_TARGET_ALLOWLIST`
- Bridge dispatch queue: `BRIDGE_DISPATCH_RETRY_BASE_MS`, `BRIDGE_DISPATCH_MAX_ATTEMPTS`, `BRIDGE_DISPATCH_RETAIN_COUNT`
- AgentSync loop + nightly cron: `AGENTSYNC_ENABLED`, `AGENTSYNC_CRON_TOKEN`, `AGENTSYNC_LOOKBACK_DAYS`, `AGENTSYNC_MIN_SIGNALS`
- Security audits: `SECURITY_AUDIT_CRON_TOKEN`, `STRICT_RESOURCE_OWNERSHIP`, `ENABLE_BRIDGE_CREW_LIVE_STRESS`
- Realtime toggle: `ENABLE_SSE_EVENTS`
- Vault limits: `VAULT_MAX_PREVIEW_BYTES`, `VAULT_MAX_EDIT_BYTES`, `VAULT_SEARCH_MAX_BYTES`, `VAULT_GRAPH_MAX_NOTES`, `VAULT_GRAPH_MAX_EDGES`
- Vault RAG: `VAULT_RAG_ENABLED`, `VAULT_RAG_EMBEDDING_MODEL`, `VAULT_RAG_TOP_K`, `VAULT_RAG_SYNC_ON_WRITE`, `VAULT_RAG_CHUNK_CHARS`, `VAULT_RAG_MAX_CHUNKS_PER_DOC`, `VAULT_RAG_EMBED_BATCH_SIZE`, `VAULT_RAG_QUERY_CANDIDATE_LIMIT`
- Local private RAG index: `LOCAL_PRIVATE_RAG_TOP_K`, `LOCAL_PRIVATE_RAG_QUERY_CANDIDATE_LIMIT`
- Data-core cutover: `DATA_CORE_ENABLED`, `DATA_CORE_DUAL_READ_VERIFY`, `DATA_CORE_BASE_URL`, `DATA_CORE_API_KEY`, `DATA_CORE_CORE_ID`, `DATA_CORE_CLUSTER_ID`, `DATA_CORE_SHIP_DEPLOYMENT_ID`
- Data-core bootstrap import signer controls: `DATA_CORE_BOOTSTRAP_*`
- Knowledge ingest orchestration (provider-agnostic): `KNOWLEDGE_INGEST_PROVIDER`, `KNOWLEDGE_INGEST_DELETE_MISSING`, `KNOWLEDGE_INGEST_INCLUDE_TRASH`, `KNOWLEDGE_INGEST_POST_PROCESS`
- llm-graph-builder provider config: `LGB_API_URL`, `LGB_NEO4J_URI`, `LGB_NEO4J_USERNAME`, `LGB_NEO4J_PASSWORD`, `LGB_NEO4J_DATABASE`, `LGB_MODEL`, `LGB_EMBEDDING_PROVIDER`, `LGB_EMBEDDING_MODEL`

Optional magic-link email config used by auth in non-local environments:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

## Knowledge Ingest CLI

Provider-agnostic ingest is exposed through:

- `npm run knowledge:ingest`
- `npm run knowledge:ingest:dry-run`

Optional flags:

- `--provider=<id>` to override `KNOWLEDGE_INGEST_PROVIDER`
- `--force` to reingest all scanned public notes for that provider

Current default provider is `llm_graph_builder`. Public scope remains `orchwiz`, `ship`, and `agent-public`.

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
- Local launch requests are rejected when `CLOUD_DEPLOY_ONLY=true`
- Local flow validates kube context presence but does not auto-create/start clusters
- Failures return structured non-2xx responses with `error`, `code`, and optional `details.suggestedCommands`

Machine-auth for Ship Yard can use `Authorization: Bearer ${SHIPYARD_API_TOKEN}`.

- If bearer auth is used, `userId` is required (`body.userId`, `?userId=...`, or `x-orchwiz-user-id` header).
- If no bearer header is provided, the route falls back to session auth.
- Optional scope controls can restrict token-auth targeting (`SHIPYARD_API_ALLOWED_USER_IDS`, `SHIPYARD_API_TOKEN_USER_ID`, and impersonation flags).

`GET /api/ship-yard/status/:id` returns deployment + bridge crew state with the same auth behavior.

### Ship Yard Secret Vault Templates

`/api/ship-yard/secrets` provides per-user, per-profile setup templates for Ship Yard wizard secrets.

- `GET /api/ship-yard/secrets?deploymentProfile=<local_starship_build|cloud_shipyard>&includeValues=true|false`
  - Returns template summary + generated snippets (`.env` and `terraform.tfvars`).
  - `includeValues=true` includes plaintext template values in the response.
  - `includeValues=false` omits plaintext values and returns redacted snippets.
- `PUT /api/ship-yard/secrets`
  - Body: `{ "deploymentProfile": "...", "values": { ... } }`
  - Upserts the template for the authenticated owner and profile.
- `DELETE /api/ship-yard/secrets?deploymentProfile=<...>`
  - Deletes the owner-scoped template for the selected profile.

Storage behavior:

- Encrypted envelope mode is used when wallet-enclave is enabled.
- Plaintext fallback mode is used only when enclave encryption is not required by policy.
- If encryption is required but wallet-enclave is unavailable, the API fails closed (`503` with stable error code).

### Ship Yard Self-Healing (Beta)

Ship Yard self-healing APIs are currently in beta and may change before GA.

- `GET /api/ship-yard/self-heal/preferences`
- `PUT /api/ship-yard/self-heal/preferences`
- `GET /api/ship-yard/self-heal/run`
- `POST /api/ship-yard/self-heal/run`
- `GET /api/ship-yard/self-heal/runs`
- `POST /api/ship-yard/self-heal/cron`

Beta response contract:

- JSON payloads include `feature: { key: "shipyard-self-heal", stage: "beta" }`
- Responses include headers:
  - `X-Orchwiz-Feature-Key: shipyard-self-heal`
  - `X-Orchwiz-Feature-Stage: beta`

The beta tag is informational and does not change auth or execution policy.

### Landing XO Teaser (Public Preview)

Landing page includes a passkey-gated XO teaser chat window with slash commands and docs linkage.

- Public docs hub: `/docs`
- Config endpoint (client-authoritative gating): `GET /api/landing/config`
- XO chat endpoint: `POST /api/landing/chat`
- Registration completion endpoint: `POST /api/landing/register`
- Newsletter endpoint: `POST /api/landing/newsletter`

Operational controls:

- `LANDING_XO_ENABLED=true|false` (default `true`)
  - When `false`, landing XO APIs return feature-disabled responses and the landing XO UI is hidden.
- `LANDING_XO_STAGE=public-preview` (optional stage label for response metadata/headers)

Observability:

- Landing routes emit traces via the existing `emitTrace` pipeline.
- `source` values are `landing.xo.chat`, `landing.xo.register`, and `landing.xo.newsletter`.
- Trace payloads include full request/response payload structures (subject to existing trace encryption settings).

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

## Runtime Intelligence Policy (v2)

When `RUNTIME_INTELLIGENCE_POLICY_ENABLED=true`, runtime model tiering is enforced as:

- `metadata.runtime.executionKind=human_chat` -> hard-pinned `max` model tier.
- `metadata.runtime.executionKind=autonomous_task` -> classifier + per-user RL threshold decides `max` vs `simple`.
- Unknown or missing execution kind defaults to `human_chat`.

Classifier prompt management:

- Pulls prompt template from Langfuse prompt management (`@langfuse/client`) by name + label (`production` default).
- Optional version pin via `RUNTIME_INTELLIGENCE_LANGFUSE_PROMPT_VERSION`.
- Local fallback prompt is always used if fetch fails.

Economics + telemetry:

- Runtime records estimated tokens/cost/savings in USD and EUR.
- Performance summary endpoint (`/api/performance/summary`) includes economics, tier adoption, and RL aggregates.

Nightly RL consolidation:

- `POST /api/runtime/intelligence/nightly`
- Auth: `Authorization: Bearer ${RUNTIME_INTELLIGENCE_NIGHTLY_CRON_TOKEN}`

## Bridge TTS

Bridge Call and Bridge Chat can synthesize spoken replies through an optional server-side TTS endpoint (`POST /api/bridge/tts`).

- On success, clients play returned `audio/wav`.
- On failure or when Kugelaudio is not configured, UI falls back to browser `speechSynthesis`.
- TTS is on-demand only in this app path (no DB persistence or artifact caching).

## Key APIs

- Core: `/api/sessions`, `/api/commands`, `/api/subagents`, `/api/tasks`, `/api/verification`, `/api/actions`
- Hooks: `/api/hooks`, `/api/hooks/:id`, `/api/hooks/trigger`
- Bridge connections: `/api/bridge/connections`, `/api/bridge/connections/:id`, `/api/bridge/connections/:id/test`, `/api/bridge/connections/dispatch`
- Bridge TTS: `/api/bridge/tts`
- Bridge chat compatibility: `/api/threads`, `/api/threads/:threadId/messages`
- Ship-scoped cross-agent chat: `/api/ships/:id/agent-chat/rooms`, `/api/ships/:id/agent-chat/rooms/:roomId/messages`
- Deployments: `/api/deployments`, `/api/applications`
- Ship Yard: `/api/ship-yard/launch`, `/api/ship-yard/status/:id`, `/api/ship-yard/secrets`
- Ship Yard self-healing (beta): `/api/ship-yard/self-heal/preferences`, `/api/ship-yard/self-heal/run`, `/api/ship-yard/self-heal/runs`, `/api/ship-yard/self-heal/cron`
- Ship Quartermaster: `/api/ships/:id/quartermaster` (GET/POST), `/api/ships/:id/quartermaster/provision` (POST)
- Ship Knowledge Base:
  - `/api/ships/:id/knowledge` (`GET` query retrieval, `POST` upsert note, `PATCH` rename/move, `DELETE` delete note)
  - `/api/ships/:id/knowledge/tree` (`GET` scoped tree + latest sync summary)
  - `/api/ships/:id/knowledge/resync` (`POST` manual `ship|fleet|all` resync; uses data-core reconcile when enabled)
- Docs: `/api/docs/claude`, `/api/docs/guidance`
- Public docs page: `/docs`
- Landing XO teaser: `/api/landing/config`, `/api/landing/chat`, `/api/landing/register`, `/api/landing/newsletter`
- GitHub: `/api/github/prs`, `/api/github/webhook`
- Forwarding: `/api/forwarding/config`, `/api/forwarding/events`, `/api/forwarding/test`
  - `GET/POST /api/forwarding/config` returns masked `targetApiKey` metadata (no plaintext key in response).
  - `POST /api/forwarding/config` no longer echoes plaintext `sourceApiKey`; only fingerprint metadata is returned when generated.
  - `POST /api/forwarding/test` is owner-scoped and enforces `FORWARDING_TEST_TARGET_ALLOWLIST`.
  - `targetApiKey` response fields: `storageMode`, `hasValue`, `maskedValue`.
- Security: `/api/security/audits/run`, `/api/security/audits/latest`, `/api/security/audits/nightly`, `/api/security/bridge-crew/stress`, `/api/security/bridge-crew/scorecard`
- Realtime: `/api/events/stream`
- AgentSync: `/api/agentsync/runs`, `/api/agentsync/runs/:id`, `/api/agentsync/preferences`, `/api/agentsync/suggestions/:id/apply`, `/api/agentsync/suggestions/:id/reject`, `/api/agentsync/nightly`
- Skills catalog/import: `/api/skills/catalog`, `/api/skills/import`, `/api/skills/import-runs`
- Observability decrypt: `/api/observability/traces/:traceId/decrypt` (session owner, session `admin`, or bearer admin token)
- Vault: `/api/vaults`, `/api/vaults/tree`, `/api/vaults/file` (`GET/POST/PATCH/DELETE`), `/api/vaults/search`, `/api/vaults/graph`, `/api/vaults/packs` (`GET/POST`)
  - `/api/vaults/search` accepts `mode=hybrid|lexical` and `k=<topK>` and may return `score`, `scopeType`, and `citations` per result.

PostToolUse webhook examples:

```bash
# Create a webhook hook (session-authenticated)
curl -X POST http://localhost:3000/api/hooks \\
  -H "Content-Type: application/json" \\
  -H "Cookie: <session-cookie>" \\
  -d '{
    "name": "Deploy Status Notifier",
    "matcher": "deploy|ship-yard|release",
    "type": "webhook",
    "webhookUrl": "http://localhost:4000/hooks/deploy-status",
    "isActive": true
  }'

# Trigger hooks externally (bearer-token authenticated)
curl -X POST http://localhost:3000/api/hooks/trigger \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${HOOK_TRIGGER_BEARER_TOKEN}" \\
  -d '{
    "toolName": "deploy",
    "status": "failed",
    "sessionId": "<optional-session-id>",
    "userId": "<required when sessionId is omitted>",
    "toolUseId": "exec_123",
    "durationMs": 2410,
    "input": {"commandId": "cmd_abc"},
    "output": {"stdout": "..."},
    "error": "exit 1",
    "metadata": {"source": "external-runtime"}
  }'
```

### Local ngrok webhook setup

Run separate tunnels for app ingress (`:3000`) and local webhook receivers (`:4000`):

```bash
cd node
npm run dev:ngrok:app
npm run dev:ngrok:webhooks
```

Print discovered public URLs and copy-ready env/callback snippets:

```bash
cd node
npm run dev:ngrok:urls
```

Security defaults:

- `HOOK_WEBHOOK_ALLOW_NGROK=false` keeps ngrok domains blocked by default.
- Set `HOOK_WEBHOOK_ALLOW_NGROK=true` to opt in to `.ngrok-free.app`, `.ngrok.app`, and `.ngrok.io` webhook targets.
- Alternative: keep the flag disabled and explicitly allowlist your ngrok host in `HOOK_WEBHOOK_TARGET_ALLOWLIST`.

## Data-core bootstrap

To import non-private markdown corpus into data-core with signed envelopes:

```bash
cd node
npm run data-core:bootstrap-import
```

Configure signer identity and routing with `DATA_CORE_BOOTSTRAP_*` vars in `.env`.

Ship knowledge path conventions in `Ship-Vault`:

- `kb/ships/<shipDeploymentId>/...` for ship-local notes
- `kb/fleet/...` for fleet-wide notes

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
npm run dev:ngrok:app
npm run dev:ngrok:webhooks
npm run dev:ngrok:urls
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
