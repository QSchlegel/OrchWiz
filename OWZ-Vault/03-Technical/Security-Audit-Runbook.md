# Security Audit Runbook

## Purpose
Operate OrchWiz security audits and bridge-crew stress evaluations in report-first mode with traceable risk scoring.

## Endpoints
- `POST /api/security/audits/run`
- `GET /api/security/audits/latest`
- `POST /api/security/audits/nightly` (cron token required)
- `POST /api/security/bridge-crew/stress`
- `GET /api/security/bridge-crew/scorecard`

## Required Environment
- `SECURITY_AUDIT_CRON_TOKEN`
- `STRICT_RESOURCE_OWNERSHIP=true` (recommended)
- `WALLET_ENCLAVE_SHARED_SECRET` (recommended non-local)
- `FORWARDING_TEST_TARGET_ALLOWLIST` (recommended explicit list)
- Optional: `ENABLE_BRIDGE_CREW_LIVE_STRESS=true` to allow live stress mode

## Manual Run

```bash
curl -X POST http://localhost:3000/api/security/audits/run \
  -H "Content-Type: application/json" \
  -b "<session-cookie>" \
  -d '{"includeBridgeCrewStress": true, "mode": "safe_sim"}'
```

Expected output includes:
- `reportId`
- `riskScore`
- `severityCounts`
- `reportPathMd`
- `reportPathJson`
- `verificationRunId`

## Nightly Run

```bash
curl -X POST http://localhost:3000/api/security/audits/nightly \
  -H "Authorization: Bearer ${SECURITY_AUDIT_CRON_TOKEN}"
```

Expected output includes `checkedUsers`, `succeeded`, `failed`, and per-user report summaries.

## Bridge Crew Stress Run

```bash
curl -X POST http://localhost:3000/api/security/bridge-crew/stress \
  -H "Content-Type: application/json" \
  -b "<session-cookie>" \
  -d '{"scenarioPack":"core","mode":"safe_sim"}'
```

## Report Locations
- Audit markdown/json: `OWZ-Vault/00-Inbox/Security-Audits/`
- Bridge scorecards: `OWZ-Vault/00-Inbox/Security-Audits/Bridge-Crew/`

## Escalation Guidance
- `riskScore.level=critical`: triage immediately, block risky deploy changes.
- `riskScore.level=high`: prioritize fixes in current sprint.
- `riskDelta > 0`: inspect newly introduced findings first.
- Any `ownership` or `realtime-scope` check failure: treat as tenant-boundary incident.
