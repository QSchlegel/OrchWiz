import { resolve } from "node:path"
import { prisma } from "@/lib/prisma"
import { resolveRepositoryRoot } from "@/lib/security/paths"
import type { SecurityAuditCheckResult, SecurityAuditFinding } from "../types"
import { fileContains } from "./_utils"

function isLocalHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1"
}

export async function runForwardingPostureAuditCheck(): Promise<SecurityAuditCheckResult> {
  const findings: SecurityAuditFinding[] = []

  const forwardingConfigs = await prisma.forwardingConfig.findMany({
    select: {
      id: true,
      targetUrl: true,
      enabled: true,
      userId: true,
    },
  })

  const insecureTargets: string[] = []
  for (const config of forwardingConfigs) {
    if (!config.enabled) {
      continue
    }

    try {
      const target = new URL(config.targetUrl)
      if (target.protocol === "http:" && !isLocalHost(target.hostname)) {
        insecureTargets.push(`${config.id} -> ${target.origin}`)
      }
    } catch {
      insecureTargets.push(`${config.id} -> invalid URL`)
    }
  }

  if (insecureTargets.length > 0) {
    findings.push({
      id: "FWD-INSECURE-TARGETS",
      title: "Forwarding targets include insecure or invalid URLs",
      summary: "Enabled forwarding targets should use HTTPS unless explicitly local-only.",
      severity: "high",
      threatIds: ["TM-03", "TM-08"],
      controlIds: ["CTRL-FWD-TARGET-ALLOWLIST"],
      recommendation: "Move enabled forwarding targets to HTTPS and validate target origins.",
      evidence: insecureTargets.slice(0, 20),
    })
  }

  const allowlistConfigured = Boolean(process.env.FORWARDING_TEST_TARGET_ALLOWLIST?.trim())
  if (!allowlistConfigured) {
    findings.push({
      id: "FWD-ALLOWLIST-NOT-SET",
      title: "Forwarding test target allowlist is not explicitly configured",
      summary: "FORWARDING_TEST_TARGET_ALLOWLIST is empty; default localhost-only rules are used.",
      severity: "low",
      threatIds: ["TM-03"],
      controlIds: ["CTRL-FWD-TARGET-ALLOWLIST"],
      recommendation: "Set FORWARDING_TEST_TARGET_ALLOWLIST with explicit approved targets per environment.",
    })
  }

  const repoRoot = resolveRepositoryRoot()
  const forwardingTestRoute = resolve(repoRoot, "node/src/app/api/forwarding/test/route.ts")
  const testRouteUsesAllowlist = await fileContains(forwardingTestRoute, "isForwardingTestTargetAllowed")
  if (!testRouteUsesAllowlist) {
    findings.push({
      id: "FWD-TEST-ALLOWLIST-MISSING",
      title: "Forwarding test endpoint does not appear to enforce allowlist",
      summary: "Could not detect allowlist enforcement in forwarding test route.",
      severity: "high",
      threatIds: ["TM-03"],
      controlIds: ["CTRL-FWD-TARGET-ALLOWLIST"],
      recommendation: "Apply strict allowlist validation before any forwarding test request is dispatched.",
      evidence: ["node/src/app/api/forwarding/test/route.ts"],
    })
  }

  return {
    id: "forwarding-posture",
    name: "Forwarding Posture and Target Hygiene",
    status: findings.some((finding) => finding.severity === "critical" || finding.severity === "high")
      ? "fail"
      : findings.length > 0
        ? "warn"
        : "pass",
    findings,
    metadata: {
      forwardingConfigCount: forwardingConfigs.length,
      enabledForwardingConfigCount: forwardingConfigs.filter((config) => config.enabled).length,
      allowlistConfigured,
    },
  }
}
