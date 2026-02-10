---
created: 2026-02-10
type: threat-model
tags:
  - ai-security
  - governance
  - zero-trust
  - orchwiz
---

# Threat Model: Agentic AI Bridge Core

## Scope
Bridge runtime, forwarding ingest/test paths, command/subagent/policy APIs, realtime event stream, and wallet-enclave + Ship Yard token surfaces.

## Threats and Controls

1. `TM-01` Hijacking / Prompt Injection
- Surface: bridge directives and runtime prompts
- Controls: prompt-risk audit check, policy enforcement, bridge stress scenarios

2. `TM-02` Shadow AI / Ownership Drift
- Surface: commands, subagents, permissions, custom policies
- Controls: owner-scoped resources, centralized authz helper, strict route checks

3. `TM-03` Data Exfiltration
- Surface: SSE stream, forwarding test endpoint, bridge dispatch
- Controls: user-scoped SSE delivery, forwarding test allowlist, owner-bound source checks

4. `TM-04` Secret Exposure
- Surface: source API keys, enclave token checks, forwarding secret storage
- Controls: no source key echo, encrypted target API key storage, length-safe enclave auth compare

5. `TM-05` Replay / Evasion
- Surface: forwarding ingest source identity and nonce window
- Controls: replay nonce + timestamp checks, owner-scoped source identity matching

6. `TM-06` Governance vs Security Drift
- Surface: permissions and policy mutation APIs
- Controls: owner/admin authz enforcement, system-policy immutability, policy assignment checks

7. `TM-07` NHI / Token Abuse
- Surface: Ship Yard token-auth user targeting
- Controls: token-auth user allowlist/restrictions, actor metadata in ship launch records

8. `TM-08` Misconfiguration / AISPM
- Surface: enclave/forwarding/security runtime configuration
- Controls: nightly + on-demand security audits, risk scoring, markdown/json report outputs

## Operational Outputs
- Security audit reports: `OWZ-Vault/00-Inbox/Security-Audits/`
- Bridge crew scorecards: `OWZ-Vault/00-Inbox/Security-Audits/Bridge-Crew/`
- APIs:
  - `POST /api/security/audits/run`
  - `GET /api/security/audits/latest`
  - `POST /api/security/audits/nightly`
  - `POST /api/security/bridge-crew/stress`
  - `GET /api/security/bridge-crew/scorecard`
