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
  - Bridge crew bootstrap + quartermaster quick-launch workflows.
- Ships runtime and deployment status surfaces.
- Application deployment CRUD + topology/flow visualization.

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
- Bridge Call UI with station rounds, subtitle lane, and voice input/output helpers.
- Mobile-first Bridge Chat utility (`/bridge-chat`) with station threads.
- Ship-scoped cross-agent chat APIs for bridge-crew DM/group messaging with optional async auto-replies.
- External bridge connection management (`telegram`, `discord`, `whatsapp`) including test + dispatch.
- USS-K8S topology board with interactive node graph and focus panes.
- Vault workspace with topology + explorer + graph tabs.

### Arsenal

- Slash command management (`/commands`) with execution route.
- Permissions CRUD (`/permissions`).
- Permission policy CRUD and subagent mappings (`/permission-policies`).
- Hooks management (`/hooks`).

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
- `ship-yard`, `ships`, `ships/:id/agent-chat`, `applications`, `deployments`
- `bridge`, `bridge-call`, `bridge-crew`, `threads`
- `forwarding`, `events/stream`
- `vaults`, `docs`, `github`, `projects`
- `security`, `agentsync`, `observability`
