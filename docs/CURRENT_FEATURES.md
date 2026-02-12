# OrchWiz Current Features

This feature map reflects what is implemented in this repository as of February 10, 2026.

## Product areas

### Mission Control

- Sessions view with orchestration session lifecycle and detail pages.
- Task management for long-running jobs (`/tasks`) with forwarded event support.
- Action audit stream (`/actions`) with forwarded event filters.

### Fleet

- Ship Yard launch wizard with:
  - `local_starship_build` and `cloud_shipyard` deployment profiles.
  - `terraform_ansible`, `terraform_only`, and `ansible_only` provisioning modes.
  - Profile-scoped secret templates with generated `.env`/`terraform.tfvars` snippets.
  - Dedicated Build `Apps` step for n8n bootstrap setup with profile-aware auto-fill defaults (local derivation + cloud `database_url` reuse for `n8n_database_url`).
  - Bridge crew bootstrap + quartermaster quick-launch workflows.
- Ship release versioning on ship deployments (`shipVersion`, `shipVersionUpdatedAt`) with baseline/backfill support.
- In-place Ship Yard upgrade flow via `POST /api/ship-yard/ships/:id/upgrade`:
  - latest-only target policy (current catalog `v1` -> `v2`)
  - session + Ship Yard user API key auth
  - optimistic transitional lock + realtime ship updates
  - failure rollback semantics (prior version preserved on failure)
  - cloud upgrade path without additional wallet debit in v1
- Ships runtime and deployment status surfaces.
- Application deployment CRUD + topology/flow visualization.
- Applications page deploy modal now uses an app-card grid with inline config cards per app type.
- Applications detail includes embedded Patch UI iframe support with n8n-aware URL resolution and external-open fallback.

### Personal

- Personal agents (subagents) management:
  - create/update/delete agents
  - context file assignment
  - per-agent permission policy bindings
- Permission profile management (`/skills`) mapped to personal agents.
- Skills catalog/import on `/skills`:
  - curated and GitHub URL skill imports
  - graph-based skill tree visualization
  - user-scoped import history
- AgentSync runs, preferences, nightly route, and suggestion apply/reject flow.

### Bridge Ops

- Bridge state and active command surface (`/bridge`).
- Bridge Call UI with station rounds, subtitle lane, and server-backed Kugelaudio TTS (with browser speech fallback).
- Mobile-first Bridge Chat utility (`/bridge-chat`) with station threads and optional server-backed reply speech.
- Ship-scoped cross-agent chat APIs for bridge-crew DM/group messaging with optional async auto-replies.
- External bridge connection management (`telegram`, `discord`, `whatsapp`) including test + dispatch.
- USS-K8S topology board with interactive node graph and focus panes.
- Vault workspace with topology + explorer + graph tabs.

### Arsenal

- Slash command management (`/commands`) with execution route.
- Permissions CRUD (`/permissions`).
- Permission policy CRUD and subagent mappings (`/permission-policies`).
- Hooks management (`/hooks`) with PostToolUse webhook execution support.

### Intel

- Verification runs (`/verification`) with create/filter flows.
- Security dashboard with:
  - on-demand and nightly security audits
  - risk scoring
  - bridge-crew stress scorecards
- GitHub PRs view + webhook ingestion routes.
- CLAUDE.md editor with parsed guidance entries.

### Community

- Projects list and project detail/star flows.

## Core platform capabilities

- Runtime provider chains with profile-aware ordering:
  - default: `openclaw -> openai-fallback -> local-fallback`
  - quartermaster: `codex-cli -> openclaw -> openai-fallback -> local-fallback`
- Local command execution safety gates and permission matching controls.
- Forwarding ingest/config/test APIs with auth/signature/replay/rate-limit protections.
- Server-Sent Events stream at `/api/events/stream` for realtime UI updates.
- Vault subsystem with:
  - multi-vault tree + file CRUD
  - hybrid/lexical search
  - graph endpoint for note/link topology
- Optional data-core backend for non-private memory domains with signed write envelopes and sync endpoints.
- Local private-memory vector index (`LocalPrivateRag*`) for encrypted private note retrieval without replication.
- Ship knowledge APIs (`/api/ships/:id/knowledge*`) with resync route.
- Encrypted observability traces with scoped decrypt endpoint.
- Passkey + magic-link auth (GitHub provider when OAuth env vars are configured).

## Security-focused components

- Security audit check engine under `node/src/lib/security/audit/checks`.
- Bridge crew stress/scoring engine under `node/src/lib/security/bridge-crew`.
- Wallet enclave client integration for secret-handling paths in forwarding, bridge connections, ship-yard secrets, and private vault flows.
- Standalone wallet-enclave service in `services/wallet-enclave`:
  - Cardano address derivation
  - CIP-8 signing
  - context-derived encrypt/decrypt endpoints
  - idempotency + audit logging + policy gate support

## API surface snapshot

Implemented route groups under `node/src/app/api` include:

- `actions`, `commands`, `tasks`, `sessions`, `verification`
- `subagents`, `permissions`, `permission-policies`, `skills`
- `hooks` (CRUD + trigger endpoint)
- `ship-yard`, `ships`, `ships/:id/agent-chat`, `applications`, `deployments`
- `bridge`, `bridge-call`, `bridge-crew`, `threads`
- `forwarding`, `events/stream`
- `vaults`, `docs`, `github`, `projects`
- `security`, `agentsync`, `observability`
