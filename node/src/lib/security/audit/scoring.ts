import type {
  SecurityAuditFinding,
  SecurityFindingSeverity,
  SecurityRiskScore,
  SecuritySeverityCounts,
} from "./types"

const SEVERITY_WEIGHTS: Record<SecurityFindingSeverity, number> = {
  critical: 35,
  high: 20,
  medium: 10,
  low: 4,
  info: 1,
}

export function countFindingsBySeverity(findings: SecurityAuditFinding[]): SecuritySeverityCounts {
  const counts: SecuritySeverityCounts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  }

  for (const finding of findings) {
    counts[finding.severity] += 1
  }

  return counts
}

export function computeSecurityRiskScore(findings: SecurityAuditFinding[]): SecurityRiskScore {
  const weightedSum = findings.reduce((sum, finding) => sum + SEVERITY_WEIGHTS[finding.severity], 0)
  const score = Math.max(0, Math.min(100, Math.round(weightedSum * 1.8)))

  if (score >= 75) {
    return { score, level: "critical" }
  }
  if (score >= 55) {
    return { score, level: "high" }
  }
  if (score >= 30) {
    return { score, level: "medium" }
  }

  return { score, level: "low" }
}
