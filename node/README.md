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
- GitHub auth/webhooks: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET`, `ENABLE_GITHUB_WEBHOOK_COMMENTS`, `GITHUB_TOKEN`
- Command execution policy: `ENABLE_LOCAL_COMMAND_EXECUTION`, `LOCAL_COMMAND_TIMEOUT_MS`, `COMMAND_EXECUTION_SHELL`, `ENABLE_LOCAL_INFRA_AUTO_INSTALL`, `LOCAL_INFRA_COMMAND_TIMEOUT_MS`
- Runtime provider: `OPENCLAW_*`, `ENABLE_OPENAI_RUNTIME_FALLBACK`, `OPENAI_API_KEY`, `OPENAI_RUNTIME_FALLBACK_MODEL`
- Deployment connector: `DEPLOYMENT_CONNECTOR_URL`, `DEPLOYMENT_CONNECTOR_API_KEY`, `DEPLOYMENT_AGENT_PATH`, `DEPLOYMENT_APPLICATION_PATH`
- Forwarding ingest/source defaults: `ENABLE_FORWARDING_INGEST`, `FORWARDING_RATE_LIMIT`, `FORWARDING_RATE_WINDOW_MS`, `DEFAULT_FORWARDING_API_KEY`, `DEFAULT_SOURCE_NODE_ID`, `DEFAULT_SOURCE_NODE_NAME`, `FORWARD_TARGET_URL`, `FORWARD_API_KEY`, `FORWARDING_FEATURE_ENABLED`
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

Profile behavior:

- `local_starship_build` derives node type `local`
- `local_starship_build` defaults to `config.infrastructure.kind=kind` and `kubeContext=kind-orchwiz`
- `cloud_shipyard` derives node type `cloud` (advanced UI override can select `hybrid`)
- `cloud_shipyard` defaults to `config.infrastructure.kind=existing_k8s`

## Key APIs

- Core: `/api/sessions`, `/api/commands`, `/api/subagents`, `/api/tasks`, `/api/verification`, `/api/actions`
- Deployments: `/api/deployments`, `/api/applications`
- Docs: `/api/docs/claude`, `/api/docs/guidance`
- GitHub: `/api/github/prs`, `/api/github/webhook`
- Forwarding: `/api/forwarding/config`, `/api/forwarding/events`, `/api/forwarding/test`
- Realtime: `/api/events/stream`

Forwarded aggregate list endpoints support:

- `includeForwarded=true`
- `sourceNodeId=<node-id>`

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
