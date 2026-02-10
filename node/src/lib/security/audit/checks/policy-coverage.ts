import { prisma } from "@/lib/prisma"
import type { SecurityAuditCheckResult, SecurityAuditFinding } from "../types"

export async function runPolicyCoverageAuditCheck(userId: string): Promise<SecurityAuditCheckResult> {
  const findings: SecurityAuditFinding[] = []

  const [systemPolicyCount, subagents] = await Promise.all([
    prisma.permissionPolicy.count({
      where: {
        isSystem: true,
      },
    }),
    prisma.subagent.findMany({
      where: {
        ownerUserId: userId,
        isShared: false,
      },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            permissionPolicies: true,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 200,
    }),
  ])

  if (systemPolicyCount === 0) {
    findings.push({
      id: "POL-SYSTEM-POLICIES-MISSING",
      title: "System permission policies are missing",
      summary: "No immutable system permission policies were detected.",
      severity: "high",
      threatIds: ["TM-06"],
      controlIds: ["CTRL-POLICY-ENFORCEMENT"],
      recommendation: "Bootstrap system policy presets and verify assignment defaults.",
    })
  }

  const subagentsWithoutPolicies = subagents.filter((subagent) => subagent._count.permissionPolicies === 0)
  if (subagentsWithoutPolicies.length > 0) {
    findings.push({
      id: "POL-SUBAGENT-ASSIGNMENT-GAPS",
      title: "Some personal subagents have no policy assignments",
      summary: "Subagents without assigned policies can drift into weak execution controls.",
      severity: subagentsWithoutPolicies.length > 10 ? "high" : "medium",
      threatIds: ["TM-01", "TM-06"],
      controlIds: ["CTRL-POLICY-ENFORCEMENT"],
      recommendation: "Assign baseline policy profiles to every personal subagent.",
      evidence: subagentsWithoutPolicies.slice(0, 20).map((subagent) => `${subagent.id} (${subagent.name})`),
    })
  }

  return {
    id: "policy-coverage",
    name: "Policy Coverage and Assignment Hygiene",
    status: findings.some((finding) => finding.severity === "critical" || finding.severity === "high")
      ? "fail"
      : findings.length > 0
        ? "warn"
        : "pass",
    findings,
    metadata: {
      systemPolicyCount,
      checkedSubagents: subagents.length,
      subagentsWithoutPolicies: subagentsWithoutPolicies.length,
    },
  }
}
