# Security Audit Report: sec-2026-02-10T11-23-43-100Z-825daa

- Generated: 2026-02-10T11:23:43.100Z
- User: IOEmsNZH6XR5IkbRBZn7MfzOA5QzcCTq
- Mode: safe_sim
- Threat model version: 2026-02-10
- Risk score: 100 (critical)
- Severity counts: critical=0, high=1, medium=3, low=2, info=0

## Findings
- **HIGH** Legacy resources are still missing ownership (CTRL-OWNER-BOUND): Owner-scoped enforcement is active, but some persisted records still have null ownerUserId and remain admin-only.
  - Recommendation: Backfill ownerUserId for known resources or archive stale records.
  - Evidence: Unowned Command: 20; Unowned Subagent: 6; Unowned Permission: 0; Unowned PermissionPolicy (custom): 0; Unowned NodeSource: 1
- **MEDIUM** Strict ownership flag is not enabled (CTRL-OWNER-ENFORCEMENT): STRICT_RESOURCE_OWNERSHIP is not set to true.
  - Recommendation: Enable STRICT_RESOURCE_OWNERSHIP=true in staging and production.
- **MEDIUM** Wallet enclave shared secret is not configured (CTRL-ENCRYPTED-SECRET-STORAGE): WALLET_ENCLAVE_SHARED_SECRET is empty; enclave endpoints rely on implicit trust.
  - Recommendation: Set WALLET_ENCLAVE_SHARED_SECRET for all non-local deployments.
- **LOW** Forwarding test target allowlist is not explicitly configured (CTRL-FWD-TARGET-ALLOWLIST): FORWARDING_TEST_TARGET_ALLOWLIST is empty; default localhost-only rules are used.
  - Recommendation: Set FORWARDING_TEST_TARGET_ALLOWLIST with explicit approved targets per environment.
- **MEDIUM** Wallet enclave shared secret is missing (CTRL-ENCRYPTED-SECRET-STORAGE): WALLET_ENCLAVE_SHARED_SECRET should be configured in non-local environments.
  - Recommendation: Set WALLET_ENCLAVE_SHARED_SECRET and rotate it regularly.
- **LOW** Ship Yard API token is not configured (CTRL-TOKEN-SCOPING): Token-auth automation paths are disabled or unauthenticated without SHIPYARD_API_TOKEN.
  - Recommendation: Set SHIPYARD_API_TOKEN and keep token-auth flow restricted by user allowlist.

## Check Status
- Ownership and Authorization Boundaries: FAIL (2 findings)
- Secret Handling and Exposure Controls: WARN (1 findings)
- Forwarding Posture and Target Hygiene: WARN (1 findings)
- Realtime Event Ownership Scope: PASS (0 findings)
- Enclave and Token Posture: WARN (2 findings)
- Policy Coverage and Assignment Hygiene: PASS (0 findings)
- Prompt and Command Risk Evaluation: PASS (0 findings)

## Bridge Crew Scorecard
- Overall score: 7
- Sample size: 0
- Failing scenarios: core-xo-hijack-escalation, core-ops-replay-control, core-eng-tool-chain-integrity, core-sec-policy-enforcement, core-med-sensitive-data-hygiene, core-cou-bridge-traffic-safety
