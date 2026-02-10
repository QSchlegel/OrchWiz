import { BRIDGE_CORE_THREAT_MODEL_VERSION } from "@/lib/security/threat-model"
import {
  getLatestBridgeCrewScorecard,
  persistBridgeCrewScorecard,
  runBridgeCrewStressEvaluation,
} from "@/lib/security/bridge-crew/run"
import { runSecurityAuditChecks } from "./checks"
import { readLatestSecurityAuditReport, writeSecurityAuditReport, buildSecurityAuditReportId } from "./reporting"
import { computeSecurityRiskScore, countFindingsBySeverity } from "./scoring"
import type { SecurityAuditRunOptions, SecurityAuditRunResult } from "./types"

export async function runSecurityAudit(options: SecurityAuditRunOptions): Promise<SecurityAuditRunResult> {
  const now = new Date()
  const mode = options.mode || "safe_sim"
  const includeBridgeCrewStress = options.includeBridgeCrewStress === true

  const previous = await readLatestSecurityAuditReport({
    userId: options.userId,
  })

  const checks = await runSecurityAuditChecks({
    userId: options.userId,
  })
  const findings = checks.flatMap((check) => check.findings)
  const severityCounts = countFindingsBySeverity(findings)
  const riskScore = computeSecurityRiskScore(findings)

  let bridgeCrewScorecard = await getLatestBridgeCrewScorecard({ userId: options.userId })
  if (includeBridgeCrewStress) {
    bridgeCrewScorecard = await runBridgeCrewStressEvaluation({
      userId: options.userId,
      shipDeploymentId: options.shipDeploymentId || null,
      scenarioPack: "core",
      mode,
    })
    await persistBridgeCrewScorecard(bridgeCrewScorecard)
  }

  const previousBridgeCrewScore = previous?.bridgeCrewScorecard?.overallScore ?? null

  const report = {
    reportId: buildSecurityAuditReportId(now),
    userId: options.userId,
    createdAt: now.toISOString(),
    mode,
    checks,
    findings,
    severityCounts,
    riskScore,
    threatModelVersion: BRIDGE_CORE_THREAT_MODEL_VERSION,
    bridgeCrewScorecard: bridgeCrewScorecard || null,
    bridgeCrewScoreDelta:
      previousBridgeCrewScore !== null && bridgeCrewScorecard
        ? bridgeCrewScorecard.overallScore - previousBridgeCrewScore
        : null,
    previousRiskScore: previous?.riskScore?.score ?? null,
    riskDelta: previous?.riskScore?.score !== undefined ? riskScore.score - previous.riskScore.score : null,
  }

  const { reportPathMd, reportPathJson } = await writeSecurityAuditReport({ report })

  return {
    report: {
      ...report,
      reportPathMd,
      reportPathJson,
    },
    reportPathMd,
    reportPathJson,
  }
}
