# API Documentation

## Overview

OrchWiz exposes REST API routes under `node/src/app/api/`. Most routes are session-authenticated and return JSON.

## Authentication and Security

- Session cookie auth (Better Auth) is required for most routes.
- `POST /api/forwarding/events` is machine-authenticated via signed headers (no session cookie).
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

### Subagents

- `GET /api/subagents` list subagents.
- `POST /api/subagents` create a subagent.
- `GET /api/subagents/[id]` fetch one.
- `PUT /api/subagents/[id]` update one.
- `DELETE /api/subagents/[id]` delete one.

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

### Hooks

- `GET /api/hooks` list hooks.
- `POST /api/hooks` create hook.
- `GET /api/hooks/[id]` fetch hook.
- `PUT /api/hooks/[id]` update hook.
- `DELETE /api/hooks/[id]` delete hook.

### Permissions

- `GET /api/permissions` list permissions.
- `POST /api/permissions` create permission.
- `GET /api/permissions/[id]` fetch permission.
- `PUT /api/permissions/[id]` update permission.
- `DELETE /api/permissions/[id]` delete permission.

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
- `POST /api/forwarding/config` create forwarding config and optionally provision/update source node identity.
- `POST /api/forwarding/test` run signed connectivity test from source to target.

### Realtime (SSE)

- `GET /api/events/stream` stream server-sent events.
  - Optional `types=typeA,typeB` query param filters event types.
  - Emits event frames for session prompts, command execution, deployment/application updates, task/verification updates, forwarding ingestion, docs updates, webhook ingestion, and bridge updates.

### Bridge and Topology

- `GET /api/bridge/state` operational bridge state for dashboard.
  - Optional `includeForwarded=true` to merge forwarded bridge/system events.
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
  - `agent-private` notes are decrypted on read.
  - Plaintext `agent-private` notes are lazily migrated to encrypted envelopes on direct read.
- `POST /api/vaults/file` upsert a note.
  - Request: `{ vault, path, content }`
  - Response: `{ vaultId, path, size, mtime, encrypted, originVaultId }`
- `GET /api/vaults/search?vault=<id>&q=<query>` search notes.
  - `agent-private` encrypted notes are decrypted for indexing/search.

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
