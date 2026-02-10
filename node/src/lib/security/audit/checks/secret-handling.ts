import { resolve } from "node:path"
import { resolveRepositoryRoot } from "@/lib/security/paths"
import type { SecurityAuditCheckResult, SecurityAuditFinding } from "../types"
import { fileContains } from "./_utils"

function nonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export async function runSecretHandlingAuditCheck(): Promise<SecurityAuditCheckResult> {
  const findings: SecurityAuditFinding[] = []
  const repoRoot = resolveRepositoryRoot()
  const forwardingConfigRoute = resolve(repoRoot, "node/src/app/api/forwarding/config/route.ts")

  const stillEchoesSourceApiKey = await fileContains(forwardingConfigRoute, "sourceApiKey,")
  if (stillEchoesSourceApiKey) {
    findings.push({
      id: "SEC-SOURCE-KEY-ECHO",
      title: "Forwarding config route may still echo source API key",
      summary: "Detected potential plaintext sourceApiKey response path in forwarding config endpoint.",
      severity: "high",
      threatIds: ["TM-04"],
      controlIds: ["CTRL-NO-SECRET-ECHO"],
      recommendation: "Return only one-time fingerprint metadata, never plaintext source keys.",
      evidence: ["node/src/app/api/forwarding/config/route.ts"],
    })
  }

  const requireEncryptedSecrets = process.env.WALLET_ENCLAVE_REQUIRE_PRIVATE_MEMORY_ENCRYPTION === "true"
  const walletEnclaveEnabled = process.env.WALLET_ENCLAVE_ENABLED === "true"
  if (requireEncryptedSecrets && !walletEnclaveEnabled) {
    findings.push({
      id: "SEC-ENCRYPTION-REQUIRED-BUT-DISABLED",
      title: "Encrypted secret storage required but wallet enclave disabled",
      summary: "WALLET_ENCLAVE_REQUIRE_PRIVATE_MEMORY_ENCRYPTION=true while WALLET_ENCLAVE_ENABLED is not true.",
      severity: "critical",
      threatIds: ["TM-04", "TM-08"],
      controlIds: ["CTRL-ENCRYPTED-SECRET-STORAGE"],
      recommendation: "Enable wallet enclave or disable strict requirement only in controlled non-production environments.",
    })
  }

  const enclaveToken = nonEmpty(process.env.WALLET_ENCLAVE_SHARED_SECRET)
  if (!enclaveToken) {
    findings.push({
      id: "SEC-ENCLAVE-SHARED-SECRET-MISSING",
      title: "Wallet enclave shared secret is not configured",
      summary: "WALLET_ENCLAVE_SHARED_SECRET is empty; enclave endpoints rely on implicit trust.",
      severity: "medium",
      threatIds: ["TM-04", "TM-08"],
      controlIds: ["CTRL-ENCRYPTED-SECRET-STORAGE"],
      recommendation: "Set WALLET_ENCLAVE_SHARED_SECRET for all non-local deployments.",
    })
  }

  return {
    id: "secret-handling",
    name: "Secret Handling and Exposure Controls",
    status: findings.some((finding) => finding.severity === "critical" || finding.severity === "high")
      ? "fail"
      : findings.length > 0
        ? "warn"
        : "pass",
    findings,
    metadata: {
      walletEnclaveEnabled,
      requireEncryptedSecrets,
      enclaveSecretConfigured: Boolean(enclaveToken),
    },
  }
}
