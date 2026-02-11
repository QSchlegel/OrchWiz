# Compliance Control Map

- Owner: Platform Security (OrchWiz Maintainers)
- Last Updated: 2026-02-11
- Status: Draft baseline

The table below maps currently implemented OrchWiz controls to ISO 27001 and
SOC 2 criteria and tracks primary evidence sources.

| Control ID | Description | ISO 27001 Ref | SOC 2 Ref | Owner | Evidence |
| --- | --- | --- | --- | --- | --- |
| `CTRL-OWNER-BOUND` | Owner-scoped access guardrails for mutable resources and centralized authorization helpers. | A.5.15, A.5.16 | CC6.1, CC6.2 | Platform Team | `node/src/lib/security/access-control.ts`; `node/src/lib/security/audit/checks/ownership.ts` |
| `CTRL-NONCE-TIMESTAMP` | Forwarding signatures with timestamp freshness and nonce replay protection. | A.8.20, A.8.21 | CC6.6, CC7.1 | Runtime Team | `node/src/lib/forwarding/security.ts`; `node/src/app/api/forwarding/events/route.ts` |
| `CTRL-ENCRYPTED-SECRET-STORAGE` | Wallet enclave token/auth posture and secret-protected enclave endpoints. | A.8.24, A.8.12 | CC6.1, C1.1 | Security Engineering | `services/wallet-enclave/src/v1/routes.ts`; `node/src/lib/security/audit/checks/enclave-posture.ts` |
| `CTRL-NIGHTLY-AUDITS` | Scheduled and on-demand security audits with risk scoring and report persistence. | A.5.24, A.8.16 | CC7.2, A1.2 | Security Operations | `OWZ-Vault/03-Technical/Security-Audit-Runbook.md`; `node/src/app/api/security/audits/nightly/route.ts` |
| `CTRL-POSTURE-REPORTING` | Security audit findings persisted as markdown/json artifacts for review and follow-up. | A.5.24, A.5.27 | CC7.3, CC7.4 | Security Operations | `node/src/lib/security/audit/reporting.ts`; `OWZ-Vault/00-Inbox/Security-Audits/` |

