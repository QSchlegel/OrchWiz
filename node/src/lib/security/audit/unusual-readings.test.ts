import assert from "node:assert/strict"
import test from "node:test"
import { computeUnusualReadings } from "./unusual-readings"
import type { SecurityAuditReport } from "./types"

function reportFixture(partial?: Partial<SecurityAuditReport>): SecurityAuditReport {
  return {
    reportId: "audit-1",
    userId: "user-1",
    createdAt: "2026-02-13T00:00:00.000Z",
    mode: "safe_sim",
    checks: [],
    findings: [],
    severityCounts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    riskScore: { score: 5, level: "low" },
    threatModelVersion: "test",
    bridgeCrewScoreDelta: null,
    previousRiskScore: null,
    riskDelta: null,
    ...partial,
  }
}

test("computeUnusualReadings returns empty array when nothing is flagged", () => {
  const readings = computeUnusualReadings(reportFixture())
  assert.equal(readings.length, 0)
})

test("computeUnusualReadings flags elevated risk, risk increase, severity counts, and failed checks", () => {
  const readings = computeUnusualReadings(
    reportFixture({
      riskScore: { score: 91, level: "high" },
      riskDelta: 2,
      severityCounts: { critical: 1, high: 2, medium: 0, low: 0, info: 0 },
      checks: [
        {
          id: "sys-1",
          name: "System Integrity",
          status: "fail",
          findings: [],
        },
      ],
    }),
  )

  const codes = readings.map((reading) => reading.code).sort()
  assert.deepEqual(
    codes,
    ["CHECK_FAILED_SYS_1", "CRITICAL_FINDINGS_PRESENT", "HIGH_FINDINGS_PRESENT", "RISK_HIGH", "RISK_INCREASED"].sort(),
  )

  const critical = readings.find((entry) => entry.code === "CRITICAL_FINDINGS_PRESENT")
  assert.equal(critical?.level, "critical")
})

