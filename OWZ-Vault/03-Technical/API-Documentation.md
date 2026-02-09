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

### Deployments and Applications

- `GET /api/deployments` list agent deployments (supports forwarding params).
- `POST /api/deployments` create deployment and run deployment adapter transitions (`pending -> deploying -> active|failed`).
  - New profile fields: `deploymentProfile` (`local_starship_build|cloud_shipyard`), `provisioningMode` (`terraform_ansible|terraform_only|ansible_only`).
  - Node type derivation: profile drives `nodeType` (`local_starship_build -> local`, `cloud_shipyard -> cloud`, optional advanced override to `hybrid` for shipyard).
  - Infrastructure settings persist under `config.infrastructure` (`kubeContext`, `namespace`, `terraformWorkspace`, `terraformEnvDir`, `ansibleInventory`, `ansiblePlaybook`).
- `GET /api/deployments/[id]` fetch deployment.
- `PUT /api/deployments/[id]` update deployment.
- `DELETE /api/deployments/[id]` delete deployment.
- `GET /api/applications` list app deployments (supports forwarding params).
- `POST /api/applications` create app deployment and run deployment adapter transitions.
  - Accepts and returns the same profile/provisioning/config infrastructure fields as deployment create.
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
