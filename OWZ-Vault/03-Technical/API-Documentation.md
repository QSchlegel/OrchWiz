# API Documentation

## Overview

OrchWiz exposes REST API routes under `node/src/app/api/`. Most routes are session-authenticated and return JSON.

## Authentication and Security

- Session cookie auth (Better Auth) is required for most routes.
- Resource APIs are owner-scoped for non-admin users (`commands`, `subagents`, `permissions`, `permission policies`, `forwarding sources`).
- `POST /api/forwarding/events` is machine-authenticated via signed headers (no session cookie).
- `POST /api/ship-yard/launch` and `GET /api/ship-yard/status/[id]` optionally support bearer token auth via `SHIPYARD_API_TOKEN`.
- `GET|PUT|DELETE /api/ship-yard/secrets` is session-authenticated and owner-scoped (no machine-token mode in v1).
- `POST /api/github/webhook` verifies signature when `GITHUB_WEBHOOK_SECRET` is configured.

## Common Conventions

### Standard errors

Error responses use:

```json
{ "error": "Message" }
```

### Aggregate forwarding query params

The following list endpoints support forwarded-data aggregation:

- `GET /api/sessions`
- `GET /api/commands`
- `GET /api/actions`
- `GET /api/tasks`
- `GET /api/verification`
- `GET /api/ships`
- `GET /api/deployments`
- `GET /api/applications`

Optional query params:

- `includeForwarded=true` to merge local + forwarded records.
- `sourceNodeId=<node-id>` to filter forwarded records by source node (effective when `includeForwarded=true`).

Forwarded records include metadata fields (for example `isForwarded`, `sourceNodeId`, `sourceNodeName`, `forwardingEventId`) without breaking existing local response shapes.

## Endpoint Reference

### Sessions

- `GET /api/sessions` list sessions (filters: `status`, `mode`, `source`, optional forwarding params above).
- `POST /api/sessions` create a session.
- `GET /api/sessions/[id]` fetch a session.
- `POST /api/sessions/[id]/prompt` append prompt + run runtime adapter (OpenClaw-first, fallback provider/local fallback).
  - Bridge-agent responses include `metadata.signature` when wallet-enclave signing succeeds.
  - When `WALLET_ENCLAVE_REQUIRE_BRIDGE_SIGNATURES=true`, bridge-agent responses fail closed if no valid signature can be produced.
- `POST /api/sessions/[id]/mode` update mode.

### Commands

- `GET /api/commands` list commands (filters: `teamId`, `isShared`, optional forwarding params above).
- `POST /api/commands` create a command.
- `GET /api/commands/[id]` fetch a command.
- `POST /api/commands/[id]/execute` execute command via policy-gated adapter.
  - Response preserves existing execution fields and adds optional fields: `policy`, `blocked`, `metadata`.
- Access behavior:
  - non-admin users can mutate only owned commands
  - shared commands are read-only for non-owners

### Subagents

- `GET /api/subagents` list subagents.
- `POST /api/subagents` create a subagent.
- `GET /api/subagents/[id]` fetch one.
- `PUT /api/subagents/[id]` update one.
- `DELETE /api/subagents/[id]` delete one.
- Access behavior:
  - non-admin users can mutate only owned subagents
  - shared subagents are read-only for non-owners

### Ships and Applications

- `GET /api/ships` list ship deployments (supports forwarding params).
- `POST /api/ships` create ship deployment and run deployment adapter transitions (`pending -> deploying -> active|failed`).
  - New profile fields: `deploymentProfile` (`local_starship_build|cloud_shipyard`), `provisioningMode` (`terraform_ansible|terraform_only|ansible_only`).
  - Node type derivation: profile drives `nodeType` (`local_starship_build -> local`, `cloud_shipyard -> cloud`, optional advanced override to `hybrid` for shipyard).
  - Infrastructure settings persist under `config.infrastructure` (`kind`, `kubeContext`, `namespace`, `terraformWorkspace`, `terraformEnvDir`, `ansibleInventory`, `ansiblePlaybook`).
  - `config.infrastructure.kind` values: `kind`, `minikube`, `existing_k8s`.
  - Defaults/inference:
    - local profile defaults to `kind` (`kubeContext=kind-orchwiz`)
    - cloud profile defaults to `existing_k8s`
    - missing legacy kind infers `minikube` when context contains `minikube`
- `GET /api/ships/[id]` fetch ship deployment.
- `PUT /api/ships/[id]` update ship deployment.
- `DELETE /api/ships/[id]` delete ship deployment.
- `POST /api/ship-yard/launch` launch Ship Yard deployment with bridge crew bootstrap.
  - Auth modes:
    - Session auth (default browser path).
    - Bearer token auth (`Authorization: Bearer <SHIPYARD_API_TOKEN>`).
  - For bearer token auth, `userId` is required from one of:
    - `body.userId`
    - query param `userId`
    - header `x-orchwiz-user-id`
  - If an `Authorization` header is present and invalid, request is rejected (`401`) with no session fallback.
  - Response includes top-level `baseRequirementsEstimate` for advisory compute/memory sizing.
  - Persisted ship metadata includes `metadata.baseRequirementsEstimate` (schema version `shipyard_base_v1`).
- `GET /api/ship-yard/status/[id]` fetch Ship Yard deployment status + bridge crew state.
  - Uses the same auth rules as `POST /api/ship-yard/launch`.
  - Response includes top-level `baseRequirementsEstimate` (persisted value when valid; otherwise server-computed fallback).
- `GET /api/ship-yard/status/[id]/inspection` fetch curated deployment inspection + logging readout.
  - Uses the same auth rules as `POST /api/ship-yard/launch`.
  - Query:
    - `deliveriesTake` optional (clamped `1..50`, default `10`)
    - `includeRuntime` optional (`true|false`, default `false`)
  - Response sections:
    - `deployment`: safe deployment snapshot fields (no raw metadata)
    - `failure`: normalized `deploymentError`, `deploymentErrorCode`, and `deploymentErrorDetails`
    - `logs`: curated/truncated log tails from known metadata keys only
    - `bridgeReadout`: provider summary and recent delivery timeline with message previews
    - `bridgeCrew`: role roster summary
    - `runtime` only when `includeRuntime=true`
  - Security posture:
    - Does not return raw `deployment.metadata`
    - Does not expose bridge connection credentials/config payloads
- `GET /api/ship-yard/secrets?deploymentProfile=<profile>&includeValues=true|false` fetch Ship Yard secret template for the authenticated user + profile.
  - Query:
    - `deploymentProfile` required (`local_starship_build|cloud_shipyard`)
    - `includeValues` optional (`true|false`, default `false`)
  - Response:
    - `deploymentProfile`, `exists`
    - `template`: `{ id, updatedAt, summary, values? }`
      - `values` is included only when `includeValues=true`
      - `summary.storageMode` is one of `none|encrypted|plaintext-fallback|legacy-plaintext|unknown`
    - `snippets`: `{ envSnippet, terraformTfvarsSnippet }`
      - snippets are redacted when `includeValues=false`
- `PUT /api/ship-yard/secrets` upsert Ship Yard secret template for authenticated user + profile.
  - Body:
    - `deploymentProfile` required (`local_starship_build|cloud_shipyard`)
    - `values` object supports:
      - common: `better_auth_secret`, `github_client_id`, `github_client_secret`, `openai_api_key`, `openclaw_api_key`
      - local-only: `postgres_password`
      - cloud-only: `database_url`
  - Response:
    - `deploymentProfile`, `exists=true`
    - `template`: `{ id, updatedAt, summary, values }`
    - `snippets`: `{ envSnippet, terraformTfvarsSnippet }`
- `DELETE /api/ship-yard/secrets?deploymentProfile=<profile>` delete template for authenticated user + profile.
  - Response: `{ deploymentProfile, deleted }`
- Ship Yard self-healing APIs are **beta** and may change before GA:
  - `GET /api/ship-yard/self-heal/preferences`
  - `PUT /api/ship-yard/self-heal/preferences`
  - `GET /api/ship-yard/self-heal/run`
  - `POST /api/ship-yard/self-heal/run`
  - `GET /api/ship-yard/self-heal/runs`
  - `POST /api/ship-yard/self-heal/cron`
- Self-healing beta response contract:
  - JSON payloads include `feature: { key: "shipyard-self-heal", stage: "beta" }`.
  - HTTP headers include:
    - `X-Orchwiz-Feature-Key: shipyard-self-heal`
    - `X-Orchwiz-Feature-Stage: beta`
  - Beta tagging is informational and does not change auth or execution behavior.
- Secret-vault error behavior:
  - Validation/profile mismatch errors return `400`.
  - If private-memory encryption is required but wallet-enclave is unavailable, API returns `503` with a stable `code`.
  - Unauthorized requests return `401` through normal session auth enforcement.
- Encryption/fallback behavior:
  - Encrypted envelope mode is used when wallet-enclave is enabled.
  - Plaintext fallback is only allowed when private-memory encryption is not required by policy.
  - Existing legacy plaintext rows remain readable for backward compatibility and are reported as `legacy-plaintext`.
- Legacy compatibility aliases:
  - `GET /api/deployments` defaults to ship deployments when `deploymentType` is omitted.
  - `deploymentType=agent` still returns agent deployments.
  - `POST|GET|PUT|DELETE /api/deployments` remain supported while migrating clients.
- `GET /api/applications` list application deployments (supports forwarding params).
- `POST /api/applications` create app deployment and run deployment adapter transitions.
  - Canonical targeting is `shipDeploymentId` (required in ship-first mode).
  - Legacy writes without `shipDeploymentId` are auto-resolved by `userId + nodeId`, creating inferred ships when needed.
  - Responses include `shipDeploymentId` and a `ship` summary (`id`, `name`, `status`, `nodeId`, `nodeType`, `deploymentProfile`).
- `GET /api/applications/[id]` fetch app deployment.
- `PUT /api/applications/[id]` update app deployment.
- `DELETE /api/applications/[id]` delete app deployment.

### Tasks

- `GET /api/tasks` list tasks (filters: `sessionId`, `status`, optional forwarding params).
- `POST /api/tasks` create task.
  - Required: `sessionId`, `name`.
  - Optional: `status`, `duration`, `tokenCount`, `strategy`, `permissionMode`, `metadata`, `completedAt`.

### Verification

- `GET /api/verification` list verification runs (filters: `sessionId`, `type`, `status`, optional forwarding params).
- `POST /api/verification` create verification run.
  - Required: `sessionId`, `type`.
  - Optional: `status`, `result`, `iterations`, `feedback`, `completedAt`.

### AgentSync

- `GET /api/agentsync/runs` list AgentSync runs for current user.
  - Optional query params: `subagentId`, `take`.
- `POST /api/agentsync/runs` trigger manual AgentSync run.
  - Body: `{ scope: "selected_agent" | "bridge_crew", subagentId?: string }`
  - `subagentId` is required for `scope="selected_agent"`.
- `GET /api/agentsync/runs/[id]` fetch run details including suggestions.
- `GET /api/agentsync/preferences` fetch nightly timezone preferences.
- `PUT /api/agentsync/preferences` update nightly timezone preferences.
  - Body: `{ timezone, nightlyEnabled, nightlyHour }`
- `POST /api/agentsync/suggestions/[id]/apply` manually apply a proposed high-risk suggestion.
- `POST /api/agentsync/suggestions/[id]/reject` reject a proposed high-risk suggestion.
- `POST /api/agentsync/nightly` cron-only nightly trigger.
  - Requires bearer token matching `AGENTSYNC_CRON_TOKEN`.
  - Intended trigger cadence is hourly; endpoint resolves due users by stored timezone at local 02:00.

### Hooks

- `GET /api/hooks` list hooks for the authenticated owner.
- `POST /api/hooks` create hook.
  - Supported types: `command`, `script`, `webhook`.
  - For `type=webhook`, `webhookUrl` is preferred and `command` is accepted as backward-compatible alias.
  - Webhook targets are validated against `HOOK_WEBHOOK_TARGET_ALLOWLIST`.
- `GET /api/hooks/[id]` fetch hook.
- `PUT /api/hooks/[id]` update hook.
- `DELETE /api/hooks/[id]` delete hook.
- `POST /api/hooks/trigger` externally trigger PostToolUse hooks.
  - Auth modes:
    - session-authenticated request
    - bearer token (`Authorization: Bearer <HOOK_TRIGGER_BEARER_TOKEN>`)
  - Body:
    - `toolName` (required)
    - `status` (`completed|failed|blocked`, required)
    - `sessionId` (optional)
    - `userId` (optional; required in machine mode when `sessionId` is omitted)
    - `toolUseId`, `durationMs`, `input`, `output`, `error`, `metadata` (optional)
  - Response:
    - `received`, `matchedHooks`, `delivered`, `failed`, `executions[]`

Hook creation example:

```json
{
  "name": "Deploy Status Notifier",
  "matcher": "deploy|ship-yard|release",
  "type": "webhook",
  "webhookUrl": "http://localhost:4000/hooks/deploy-status",
  "isActive": true
}
```

Hook trigger example:

```json
{
  "toolName": "deploy",
  "status": "failed",
  "sessionId": "session_123",
  "toolUseId": "exec_456",
  "durationMs": 2410,
  "input": { "commandId": "cmd_abc" },
  "output": { "stdout": "..." },
  "error": "exit 1",
  "metadata": { "source": "external-runtime" }
}
```

Webhook payload example sent to targets:

```json
{
  "event": "post_tool_use.v1",
  "occurredAt": "2026-02-10T18:00:00.000Z",
  "hook": {
    "id": "hook_123",
    "name": "Deploy Status Notifier",
    "matcher": "deploy|ship-yard|release",
    "type": "webhook"
  },
  "toolUse": {
    "toolName": "deploy",
    "status": "failed",
    "sessionId": "session_123",
    "toolUseId": "exec_456",
    "durationMs": 2410,
    "input": { "commandId": "cmd_abc" },
    "output": { "stdout": "..." },
    "error": "exit 1",
    "metadata": { "source": "external-runtime" }
  }
}
```

### Permissions

- `GET /api/permissions` list permissions.
- `POST /api/permissions` create permission.
- `GET /api/permissions/[id]` fetch permission.
- `PUT /api/permissions/[id]` update permission.
- `DELETE /api/permissions/[id]` delete permission.
- Access behavior:
  - non-admin users can mutate only owned permissions
  - shared permissions are read-only for non-owners

### Permission Policies

- `GET /api/permission-policies` list policies.
- `POST /api/permission-policies` create custom policy.
- `GET /api/permission-policies/[id]` fetch policy.
- `PUT /api/permission-policies/[id]` update custom policy.
- `DELETE /api/permission-policies/[id]` delete custom policy.
- Access behavior:
  - system policies are visible to all authenticated users and immutable
  - custom policies are owner-scoped for non-admin users

### Actions

- `GET /api/actions` list agent actions (filters: `sessionId`, `type`, `status`, optional forwarding params).

### Documentation

- `GET /api/docs/claude` fetch latest CLAUDE document (optionally by `teamId`).
- `POST /api/docs/claude` create new CLAUDE document version and extract guidance entries.
- `PUT /api/docs/claude` create next version + guidance revisions.
- `GET /api/docs/guidance` list guidance entries/revisions.

### GitHub

- `GET /api/github/prs` list tracked PRs.
- `POST /api/github/webhook` ingest GitHub webhook event, persist payload, optionally post PR comment when `ENABLE_GITHUB_WEBHOOK_COMMENTS=true` and `GITHUB_TOKEN` is available.

### Forwarding

- `POST /api/forwarding/events` ingest signed node-to-node events.
  - Required headers:
    - `x-orchwiz-source-node`
    - `x-orchwiz-api-key`
    - `x-orchwiz-timestamp`
    - `x-orchwiz-nonce`
    - `x-orchwiz-signature`
  - Signature input: `${timestamp}.${nonce}.${rawBody}` using HMAC-SHA256 with the source API key.
  - Includes timestamp freshness check, per-source nonce replay guard, rate limiting, dedupe, and persistence into `ForwardingEvent`.
- `GET /api/forwarding/config` list forwarding configs for current user.
  - `targetApiKey` is returned as masked summary metadata (no plaintext secret in response).
  - Response shape:
    - `targetApiKey.storageMode`: `none|encrypted|plaintext-fallback|legacy-plaintext|unknown`
    - `targetApiKey.hasValue`: boolean
    - `targetApiKey.maskedValue`: masked suffix (for plaintext modes) or `********` for encrypted
- `POST /api/forwarding/config` create forwarding config and optionally provision/update source node identity.
  - Request still accepts plaintext `targetApiKey`.
  - Stored secret format now uses an encoded envelope (encrypted with wallet-enclave when available/required, plaintext-fallback otherwise).
  - Existing legacy plaintext rows remain readable internally for backward compatibility.
  - Response no longer returns plaintext source API key. It returns one-time credential fingerprint metadata when a source key is issued.
- `POST /api/forwarding/test` run signed connectivity test from source to target.
  - Requires owned `sourceNodeId` and matching `sourceApiKey`.
  - `targetUrl` must match `FORWARDING_TEST_TARGET_ALLOWLIST` (or localhost defaults).

### Realtime (SSE)

- `GET /api/events/stream` stream server-sent events.
  - Optional `types=typeA,typeB` query param filters event types.
  - Event delivery is user-scoped; non-admin consumers receive only events tagged to their `userId`.
  - Emits event frames for session prompts, command execution, deployment/application updates, task/verification updates, forwarding ingestion, docs updates, webhook ingestion, and bridge updates.
  - Bridge Agent Chat emits `bridge.agent-chat.updated` for room/message/reply lifecycle updates.

### Security

- `POST /api/security/audits/run` run on-demand security audit for current user.
  - Body:
    - `shipDeploymentId?: string`
    - `includeBridgeCrewStress?: boolean`
    - `mode?: \"safe_sim\" | \"live\"`
  - Persists markdown + json reports under `OWZ-Vault/00-Inbox/Security-Audits/`.
  - Persists summary to `VerificationRun` (`type=test_suite`) and publishes `verification.updated`.
- `GET /api/security/audits/latest` fetch latest security audit metadata for current user.
- `POST /api/security/audits/nightly` cron-triggered audit fanout.
  - Requires `Authorization: Bearer <SECURITY_AUDIT_CRON_TOKEN>`.
- `POST /api/security/bridge-crew/stress` run bridge-crew pen/stress scorecard evaluation.
- `GET /api/security/bridge-crew/scorecard` fetch latest bridge-crew scorecard for current user.

### Bridge and Topology

- `GET /api/bridge/state` operational bridge state for dashboard.
  - Optional `includeForwarded=true` to merge forwarded bridge/system events.
  - Includes `runtimeUi.openclaw` payload for iframe embedding:
    - `label`
    - `href` (default selected station proxy URL or `null`)
    - `source` (selected station source)
    - `instances` (always six station entries: `xo|ops|eng|sec|med|cou`)
      - `stationKey`, `callsign`, `label`
      - `href` (proxy URL `/api/bridge/runtime-ui/openclaw/:stationKey?shipDeploymentId=...` when configured)
      - `source` (`openclaw_ui_urls | openclaw_ui_url_template | openclaw_ui_url | openclaw_gateway_urls | openclaw_gateway_url_template | openclaw_gateway_url | cluster_service_fallback | unconfigured`)
- `GET /api/bridge/runtime-ui/openclaw/:stationKey/*` authenticated OpenClaw UI patch-through proxy for iframe embedding.
  - Optional query: `shipDeploymentId`.
  - Resolves station runtime URL via env/runtime registry and proxies HTML/assets for same-origin iframe rendering.
- Ship-scoped Bridge Agent Chat:
  - `GET /api/ships/:id/agent-chat/rooms` list rooms for a ship (optional: `memberBridgeCrewId`, `take`).
  - `POST /api/ships/:id/agent-chat/rooms` create/upsert room.
    - Body:
      - `roomType`: `dm|group`
      - `title?`: group room title
      - `memberBridgeCrewIds`: bridge crew member ids
      - `createdByBridgeCrewId?`
    - `dm` behavior: exactly 2 members, idempotent via deterministic `dmKey`.
    - `group` behavior: at least 3 members.
    - Creates per-member runtime session bindings for the room.
  - `GET /api/ships/:id/agent-chat/rooms/:roomId/messages` list room messages (optional: `cursor`, `take`).
  - `POST /api/ships/:id/agent-chat/rooms/:roomId/messages` create room message.
    - Body:
      - `senderBridgeCrewId`
      - `content`
      - `autoReply?` (boolean)
      - `autoReplyRecipientBridgeCrewIds?` (required when `autoReply=true`)
    - Auto-reply behavior:
      - Recipients must be explicit active room members and cannot include sender.
      - Reply jobs are queued asynchronously and drained out-of-band.
  - Realtime:
    - `bridge.agent-chat.updated` is emitted for room creation/reuse, message creation, reply enqueue/completion/failure.
- Bridge Connections (outbound-only, per ship deployment):
  - `GET /api/bridge/connections?deploymentId=<id>&deliveriesTake=<n>` list connector records, provider summary, and recent delivery timeline.
    - Requires owned `deploymentId` (`deployment.userId === session.user.id`).
  - `POST /api/bridge/connections` create connector.
    - Required body: `deploymentId`, `provider` (`telegram|discord|whatsapp`), `name`, `destination`, `credentials`.
    - Optional body: `enabled`, `autoRelay`, `config`.
  - `PATCH /api/bridge/connections/[id]` update connector metadata/toggles and optional credential rotation.
  - `DELETE /api/bridge/connections/[id]` delete connector (delivery history cascades via FK).
  - `POST /api/bridge/connections/[id]/test` enqueue and attempt immediate test delivery for that connector.
  - `POST /api/bridge/connections/dispatch` manual patch-through dispatch.
    - Required body: `deploymentId`, `message`.
    - Optional body:
      - `connectionIds` (defaults to all enabled connectors in deployment).
      - `runtime` (defaults to `openclaw`; rejects unknown explicit values with `400` and supported runtime ids).
      - `bridgeContext`:
        - `stationKey`: `xo|ops|eng|sec|med|cou`
        - `callsign`
        - `bridgeCrewId`
    - Default runtime semantics:
      - Missing/empty runtime is resolved to `openclaw`.
      - Persisted delivery payload stores `runtime.id` and optional `bridgeContext` for downstream runtime adapters.
  - COU auto relay:
    - Runtime dispatch is triggered when prompt metadata is bridge-channel COU (`metadata.bridge.channel === "bridge-agent"` and `metadata.bridge.stationKey === "cou"`).
    - `metadata.bridge.shipDeploymentId` is the preferred deployment target hint.
  - Realtime:
    - `bridge.comms.updated` is emitted on enqueue, success, and terminal failure.
  - OpenClaw dispatch contract (adapter call from OrchWiz to OpenClaw):
    - Method/path: `POST ${OPENCLAW_GATEWAY_URL}${OPENCLAW_DISPATCH_PATH}` (default path `/v1/message`).
    - Auth: `Authorization: Bearer ${OPENCLAW_API_KEY}` when API key is configured.
    - Body:
      - `requestType: "bridge_connection_dispatch.v1"`
      - `deliveryId`, `provider`, `destination`, `message`, `config`, `credentials`, `metadata`
    - Success semantics: HTTP 2xx and response payload where `ok !== false`; all other responses are treated as failed delivery and retried by queue policy.
- `GET /api/uss-k8s/topology` USS/K8s topology data for dashboard.
- `GET /api/bridge-crew?deploymentId=<ship-id>` list bridge crew records.
- `PUT /api/bridge-crew/[id]` update bridge crew prompt/status + wallet binding fields:
  - `walletEnabled`
  - `walletAddress`
  - `walletKeyRef`
  - `walletEnclaveUrl`

### Vault

- `GET /api/vaults` list vault summaries.
- `GET /api/vaults/tree?vault=<id>` fetch tree for vault.
- `GET /api/vaults/file?vault=<id>&path=<path.md>` fetch note preview/links.
  - Optional query: `mode=preview|full` (default `preview`).
  - `mode=full` is intended for editor loads and returns `413` when the note exceeds edit byte limits.
  - `agent-private` notes are decrypted on read.
  - Plaintext `agent-private` notes are lazily migrated to encrypted envelopes on direct read.
- `POST /api/vaults/file` upsert a note.
  - Request: `{ vault, path, content }`
  - Response: `{ vaultId, path, size, mtime, encrypted, originVaultId }`
- `PATCH /api/vaults/file` rename/move note within the same physical vault.
  - Request: `{ vault, fromPath, toPath }`
  - Response: `{ vaultId, fromPath, toPath, size, mtime, encrypted, originVaultId }`
  - Cross-vault moves (namespace changes in joined scope) are rejected.
- `DELETE /api/vaults/file?vault=<id>&path=<path.md>&mode=soft|hard` delete note.
  - Default `mode=soft` moves note under `_trash/<ISO-timestamp>/...`.
  - `mode=hard` permanently removes note.
  - Response: `{ vaultId, path, mode, deletedPath, originVaultId }`
- `GET /api/vaults/search?vault=<id>&q=<query>&mode=hybrid|lexical&k=<topK>` search notes.
  - `mode` defaults to `hybrid`.
  - `k` clamps to `1..100`.
  - Response remains backward-compatible and may include per-result `score`, `scopeType`, `shipDeploymentId`, and `citations[]`.
  - If embeddings are unavailable or RAG query fails, lexical fallback is used.
- `GET /api/vaults/graph?vault=<id>&focusPath=<optional>&depth=<1..4>&includeUnresolved=<bool>&includeTrash=<bool>&q=<optional>`
  - Returns graph nodes/edges for Vault graph view.
  - Unresolved wiki/markdown links can be emitted as ghost nodes.

### Ship Knowledge Base (Quartermaster-Scoped)

- All endpoints require an authenticated owner of `shipDeploymentId`.
- Shared KB path conventions in `Ship-Vault`:
  - `kb/ships/<shipDeploymentId>/...` (ship-local)
  - `kb/fleet/...` (fleet-wide)

- `GET /api/ships/:id/knowledge?q=<query>&scope=ship|fleet|all&mode=hybrid|lexical&k=<topK>`
  - Runs scoped RAG retrieval for ship context.
  - Returns ranked citations with source ids (`S1..Sn`), scope type, and score fields.
- `POST /api/ships/:id/knowledge`
  - Create/update a KB note under allowed ship/fleet prefixes.
  - Body: `{ path, content }` or `{ scope: \"ship\"|\"fleet\", relativePath, content }`.
- `PATCH /api/ships/:id/knowledge`
  - Rename/move KB note within allowed prefixes.
  - Body: `{ fromPath, toPath }`.
- `DELETE /api/ships/:id/knowledge?path=<kb-path>&mode=soft|hard`
  - Delete KB note (default `hard`).
- `GET /api/ships/:id/knowledge/tree?scope=ship|fleet|all`
  - Returns scoped KB tree and latest sync summary.
- `POST /api/ships/:id/knowledge/resync`
  - Manual RAG resync for `ship|fleet|all`.
  - Body: `{ scope, mode }`.
  - Response includes run id + sync counters.

### Projects

- `GET /api/projects` list projects.
- `POST /api/projects` create project.
- `GET /api/projects/[slug]` fetch project.
- `PUT /api/projects/[slug]` update project.
- `DELETE /api/projects/[slug]` delete project.
- `POST /api/projects/[slug]/star` increment star count.

## Related Notes

- [[Database-Schema]] - Database models used by APIs
- [[Deployment-Guide]] - API deployment information
