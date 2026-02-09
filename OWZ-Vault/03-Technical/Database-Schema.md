# Database Schema

## Overview

Orchwiz uses PostgreSQL with Prisma ORM. The schema is defined in `node/prisma/schema.prisma`.

## Core Models

### User
- User accounts with GitHub OAuth integration
- Links to sessions, command executions, and guidance revisions

### Session
- Agent Ops sessions with status tracking (planning, executing, completed, paused, failed)
- Modes: plan or auto_accept
- Sources: local, web, ios, terminal_handoff
- Supports session forking (parent/child relationships)

### SessionInteraction
- Tracks all interactions within a session
- Types: user_input, ai_response, tool_use, error
- Timestamped for timeline visualization
- Bridge-agent `ai_response` metadata may include `signature` (Cardano CIP-8 bundle + payload hash)

### Command
- Slash commands that can be executed
- Can be shared across teams
- Contains script content and execution path

### CommandExecution
- Logs of command executions
- Tracks status, output, errors, and duration
- Linked to sessions and users

### Subagent
- Specialized AI subagents
- Can be shared across teams
- Contains agent definition content

### ClaudeDocument
- Project documentation (CLAUDE.md files)
- Versioned with guidance entries
- Team-specific documents

### GuidanceEntry
- Individual guidance rules within documents
- Status: active or deprecated
- Linked to revisions

### GuidanceRevision
- Tracks changes to guidance entries
- Includes diffs, commit hashes, PR links
- Bot responses to changes

### Permission
- Command execution permissions
- Types: bash_command, tool_command
- Status: allow, ask, deny
- Scope: global, workspace, user

### AgentAction
- Tracks agent actions (Slack, BigQuery, Sentry, etc.)
- Linked to sessions
- Includes action details and results

### Hook
- PostToolUse hooks for automation
- Types: command, script
- Matches tool usage patterns

### HookExecution
- Execution logs for hooks
- Linked to sessions and tool uses

### Task
- Long-running background tasks
- Status: running, completed, failed, thinking
- Strategies: background_agent, stop_hook, plugin

### VerificationRun
- Verification workflow runs
- Types: browser, bash, test_suite, app_test
- Tracks iterations and feedback

### AgentDeployment / ApplicationDeployment
- Ship + application deployment records
- `AgentDeployment.deploymentType` differentiates `agent` and `ship`.
- `ApplicationDeployment.shipDeploymentId` links each application deployment to a ship deployment.
- Typed deployment profile fields:
  - `deploymentProfile`: `local_starship_build` or `cloud_shipyard`
  - `provisioningMode`: `terraform_ansible`, `terraform_only`, or `ansible_only`
- Existing flexible JSON fields remain:
  - `config` (includes `config.infrastructure.kind` = `kind|minikube|existing_k8s` plus Terraform/Ansible settings)
  - `metadata`

### BridgeCrew

- Bridge station role records tied to ship deployments.
- Wallet binding fields for per-agent identity:
  - `walletEnabled`
  - `walletAddress`
  - `walletKeyRef`
  - `walletEnclaveUrl`

## Relationships

- User → Sessions (one-to-many)
- Session → Interactions (one-to-many)
- Session → CommandExecutions (one-to-many)
- Session → Tasks (one-to-many)
- Session → VerificationRuns (one-to-many)
- Command → CommandExecutions (one-to-many)
- ClaudeDocument → GuidanceEntries (one-to-many)
- GuidanceEntry → GuidanceRevisions (one-to-many)

## Schema Location

The full schema is located at: `node/prisma/schema.prisma`

## Related Notes

- [[API-Documentation]] - API endpoints that use these models
- [[Deployment-Guide]] - Database setup instructions
