import { resolve } from "node:path"
import { resolveRepositoryRoot } from "@/lib/security/paths"
import type { SecurityAuditCheckResult, SecurityAuditFinding } from "../types"
import { fileContains } from "./_utils"

function hasValue(value: string | undefined): boolean {
  return Boolean(value && value.trim().length > 0)
}

export async function runEnclavePostureAuditCheck(): Promise<SecurityAuditCheckResult> {
  const findings: SecurityAuditFinding[] = []
  const repoRoot = resolveRepositoryRoot()

  const walletRoutePath = resolve(repoRoot, "services/wallet-enclave/src/v1/routes.ts")
  const hasLengthSafeCompare = await fileContains(walletRoutePath, "timingSafeEqualStrings")
  if (!hasLengthSafeCompare) {
    findings.push({
      id: "ENC-TIMING-COMPARE",
      title: "Wallet enclave token check may be length-unsafe",
      summary: "Could not detect length-safe timing comparison helper in wallet enclave route auth.",
      severity: "high",
      threatIds: ["TM-04", "TM-08"],
      controlIds: ["CTRL-ENCRYPTED-SECRET-STORAGE"],
      recommendation: "Use a length-guarded timing-safe comparison before authorizing requests.",
      evidence: ["services/wallet-enclave/src/v1/routes.ts"],
    })
  }

  if (!hasValue(process.env.WALLET_ENCLAVE_SHARED_SECRET)) {
    findings.push({
      id: "ENC-SHARED-SECRET",
      title: "Wallet enclave shared secret is missing",
      summary: "WALLET_ENCLAVE_SHARED_SECRET should be configured in non-local environments.",
      severity: "medium",
      threatIds: ["TM-04", "TM-08"],
      controlIds: ["CTRL-ENCRYPTED-SECRET-STORAGE"],
      recommendation: "Set WALLET_ENCLAVE_SHARED_SECRET and rotate it regularly.",
    })
  }

  if (!hasValue(process.env.SHIPYARD_API_TOKEN)) {
    findings.push({
      id: "ENC-SHIPYARD-TOKEN",
      title: "Ship Yard API token is not configured",
      summary: "Token-auth automation paths are disabled or unauthenticated without SHIPYARD_API_TOKEN.",
      severity: "low",
      threatIds: ["TM-07"],
      controlIds: ["CTRL-TOKEN-SCOPING"],
      recommendation: "Set SHIPYARD_API_TOKEN and keep token-auth flow restricted by user allowlist.",
    })
  }

  return {
    id: "enclave-posture",
    name: "Enclave and Token Posture",
    status: findings.some((finding) => finding.severity === "high" || finding.severity === "critical")
      ? "fail"
      : findings.length > 0
        ? "warn"
        : "pass",
    findings,
    metadata: {
      walletEnclaveSecretConfigured: hasValue(process.env.WALLET_ENCLAVE_SHARED_SECRET),
      shipyardApiTokenConfigured: hasValue(process.env.SHIPYARD_API_TOKEN),
    },
  }
}
