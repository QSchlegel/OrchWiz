# Monthly Evidence Checklist

- Owner: Platform Security (OrchWiz Maintainers)
- Last Updated: 2026-02-11
- Status: Draft baseline

Use this checklist during monthly control review for the ISO 27001 + SOC 2
cert-ready baseline.

## Checklist

- [ ] Control map reviewed and updated for scope/control changes.
- [ ] Open findings reviewed and assigned with target dates.
- [ ] High/critical dependency findings reviewed and dispositioned.
- [ ] Access and ownership controls reviewed for drift.
- [ ] Backup/restore evidence collected for in-scope systems.
- [ ] Incident log reviewed (or no-incident attestation recorded).
- [ ] Risk acceptances reviewed for expiry and re-approval.

## Required Artifacts

| Artifact | Control IDs | Exact File/System Source | Frequency | Owner |
| --- | --- | --- | --- | --- |
| Security audit report bundle | `CTRL-NIGHTLY-AUDITS`, `CTRL-POSTURE-REPORTING` | `OWZ-Vault/00-Inbox/Security-Audits/*.md`; `OWZ-Vault/00-Inbox/Security-Audits/*.json` | Monthly | Security Operations |
| Bridge crew scorecards | `CTRL-NIGHTLY-AUDITS` | `OWZ-Vault/00-Inbox/Security-Audits/Bridge-Crew/*.json` | Monthly | Security Operations |
| Ownership/audit check implementation references | `CTRL-OWNER-BOUND` | `node/src/lib/security/access-control.ts`; `node/src/lib/security/audit/checks/ownership.ts` | Monthly | Platform Team |
| Forwarding replay/signature control references | `CTRL-NONCE-TIMESTAMP` | `node/src/lib/forwarding/security.ts`; `node/src/app/api/forwarding/events/route.ts` | Monthly | Runtime Team |
| Enclave auth posture references | `CTRL-ENCRYPTED-SECRET-STORAGE` | `services/wallet-enclave/src/v1/routes.ts`; `node/src/lib/security/audit/checks/enclave-posture.ts` | Monthly | Security Engineering |
| Dependency audit output (`node`) | `CTRL-POSTURE-REPORTING` | System command output: `cd node && npm audit --omit=dev --json` | Monthly | Platform Team |
| Dependency audit output (`wallet-enclave`) | `CTRL-POSTURE-REPORTING` | System command output: `cd services/wallet-enclave && npm audit --omit=dev --json` | Monthly | Security Engineering |
| Deployment security runbook reference | `CTRL-NIGHTLY-AUDITS` | `OWZ-Vault/03-Technical/Security-Audit-Runbook.md` | Quarterly review | Security Operations |

## Review Sign-off

- Review window: `YYYY-MM`
- Evidence owner:
- Reviewer:
- Review date (UTC):
- Notes and follow-up actions:

