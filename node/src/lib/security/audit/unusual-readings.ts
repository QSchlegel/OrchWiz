import type { SecurityAuditReport } from "./types"

export type UnusualReadingLevel = "info" | "warn" | "critical"

export interface UnusualReading {
  code: string
  level: UnusualReadingLevel
  message: string
}

function pushUnique(readings: UnusualReading[], reading: UnusualReading) {
  if (readings.some((entry) => entry.code === reading.code)) {
    return
  }
  readings.push(reading)
}

export function computeUnusualReadings(report: SecurityAuditReport): UnusualReading[] {
  const readings: UnusualReading[] = []

  if (report.riskScore.level === "critical") {
    pushUnique(readings, {
      code: "RISK_CRITICAL",
      level: "critical",
      message: `Risk level is CRITICAL (score=${report.riskScore.score}).`,
    })
  } else if (report.riskScore.level === "high") {
    pushUnique(readings, {
      code: "RISK_HIGH",
      level: "warn",
      message: `Risk level is HIGH (score=${report.riskScore.score}).`,
    })
  }

  if (report.riskDelta !== null && report.riskDelta > 0) {
    pushUnique(readings, {
      code: "RISK_INCREASED",
      level: "warn",
      message: `Risk increased vs previous report (+${report.riskDelta}).`,
    })
  }

  if (report.severityCounts.critical > 0) {
    pushUnique(readings, {
      code: "CRITICAL_FINDINGS_PRESENT",
      level: "critical",
      message: `Critical findings present (count=${report.severityCounts.critical}).`,
    })
  }

  if (report.severityCounts.high > 0) {
    pushUnique(readings, {
      code: "HIGH_FINDINGS_PRESENT",
      level: "warn",
      message: `High-severity findings present (count=${report.severityCounts.high}).`,
    })
  }

  for (const check of report.checks) {
    if (check.status !== "fail") {
      continue
    }
    const code = `CHECK_FAILED_${check.id.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`
    pushUnique(readings, {
      code,
      level: "warn",
      message: `Audit check failed: ${check.name} (${check.id}).`,
    })
  }

  return readings
}

