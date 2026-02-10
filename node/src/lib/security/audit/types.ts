import type { BridgeCrewScorecard } from "@/lib/security/bridge-crew/types"

export type SecurityFindingSeverity = "critical" | "high" | "medium" | "low" | "info"

export interface SecurityAuditFinding {
  id: string
  title: string
  summary: string
  severity: SecurityFindingSeverity
  threatIds: string[]
  controlIds: string[]
  recommendation?: string
  evidence?: string[]
}

export interface SecurityAuditCheckResult {
  id: string
  name: string
  status: "pass" | "warn" | "fail"
  findings: SecurityAuditFinding[]
  metadata?: Record<string, unknown>
}

export interface SecuritySeverityCounts {
  critical: number
  high: number
  medium: number
  low: number
  info: number
}

export interface SecurityRiskScore {
  score: number
  level: "low" | "medium" | "high" | "critical"
}

export interface SecurityAuditReport {
  reportId: string
  userId: string
  createdAt: string
  mode: "safe_sim" | "live"
  checks: SecurityAuditCheckResult[]
  findings: SecurityAuditFinding[]
  severityCounts: SecuritySeverityCounts
  riskScore: SecurityRiskScore
  threatModelVersion: string
  bridgeCrewScorecard?: BridgeCrewScorecard | null
  bridgeCrewScoreDelta: number | null
  previousRiskScore: number | null
  riskDelta: number | null
  reportPathMd?: string
  reportPathJson?: string
}

export interface SecurityAuditRunOptions {
  userId: string
  shipDeploymentId?: string | null
  includeBridgeCrewStress?: boolean
  mode?: "safe_sim" | "live"
}

export interface SecurityAuditRunResult {
  report: SecurityAuditReport
  reportPathMd: string
  reportPathJson: string
}
