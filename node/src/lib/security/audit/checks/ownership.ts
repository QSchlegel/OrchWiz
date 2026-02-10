import { resolve } from "node:path"
import { prisma } from "@/lib/prisma"
import { resolveRepositoryRoot } from "@/lib/security/paths"
import type { SecurityAuditCheckResult, SecurityAuditFinding } from "../types"
import { fileContains } from "./_utils"

const OWNER_CRITICAL_ROUTES = [
  "node/src/app/api/commands/[id]/route.ts",
  "node/src/app/api/commands/[id]/execute/route.ts",
  "node/src/app/api/subagents/[id]/route.ts",
  "node/src/app/api/subagents/[id]/context-files/route.ts",
  "node/src/app/api/permissions/[id]/route.ts",
  "node/src/app/api/permission-policies/[id]/route.ts",
]

export async function runOwnershipAuditCheck(): Promise<SecurityAuditCheckResult> {
  const findings: SecurityAuditFinding[] = []

  const [unownedCommands, unownedSubagents, unownedPermissions, unownedPolicies, unownedNodeSources] = await Promise.all([
    prisma.command.count({ where: { ownerUserId: null } }),
    prisma.subagent.count({ where: { ownerUserId: null } }),
    prisma.permission.count({ where: { ownerUserId: null } }),
    prisma.permissionPolicy.count({ where: { ownerUserId: null, isSystem: false } }),
    prisma.nodeSource.count({ where: { ownerUserId: null } }),
  ])

  const totalUnowned =
    unownedCommands + unownedSubagents + unownedPermissions + unownedPolicies + unownedNodeSources

  if (totalUnowned > 0) {
    findings.push({
      id: "OWN-UNOWNED-LEGACY",
      title: "Legacy resources are still missing ownership",
      summary:
        "Owner-scoped enforcement is active, but some persisted records still have null ownerUserId and remain admin-only.",
      severity: totalUnowned > 25 ? "high" : "medium",
      threatIds: ["TM-02", "TM-06"],
      controlIds: ["CTRL-OWNER-BOUND"],
      recommendation: "Backfill ownerUserId for known resources or archive stale records.",
      evidence: [
        `Unowned Command: ${unownedCommands}`,
        `Unowned Subagent: ${unownedSubagents}`,
        `Unowned Permission: ${unownedPermissions}`,
        `Unowned PermissionPolicy (custom): ${unownedPolicies}`,
        `Unowned NodeSource: ${unownedNodeSources}`,
      ],
    })
  }

  if (process.env.STRICT_RESOURCE_OWNERSHIP !== "true") {
    findings.push({
      id: "OWN-STRICT-FLAG",
      title: "Strict ownership flag is not enabled",
      summary: "STRICT_RESOURCE_OWNERSHIP is not set to true.",
      severity: "medium",
      threatIds: ["TM-06"],
      controlIds: ["CTRL-OWNER-ENFORCEMENT"],
      recommendation: "Enable STRICT_RESOURCE_OWNERSHIP=true in staging and production.",
    })
  }

  const repoRoot = resolveRepositoryRoot()
  const missingRouteGuards: string[] = []
  for (const route of OWNER_CRITICAL_ROUTES) {
    const absolute = resolve(repoRoot, route)
    const hasAccessControl = await fileContains(absolute, "requireAccessActor")
    if (!hasAccessControl) {
      missingRouteGuards.push(route)
    }
  }

  if (missingRouteGuards.length > 0) {
    findings.push({
      id: "OWN-ROUTE-GUARD-GAPS",
      title: "One or more critical routes do not import centralized access control",
      summary: "Expected owner guard helper was not detected in one or more critical API routes.",
      severity: "high",
      threatIds: ["TM-02", "TM-06"],
      controlIds: ["CTRL-CENTRAL-AUTHZ"],
      recommendation: "Apply requireAccessActor and owner assertion checks consistently.",
      evidence: missingRouteGuards,
    })
  }

  return {
    id: "ownership",
    name: "Ownership and Authorization Boundaries",
    status: findings.some((finding) => finding.severity === "high" || finding.severity === "critical")
      ? "fail"
      : findings.length > 0
        ? "warn"
        : "pass",
    findings,
    metadata: {
      strictOwnershipEnabled: process.env.STRICT_RESOURCE_OWNERSHIP === "true",
      totalUnowned,
    },
  }
}
