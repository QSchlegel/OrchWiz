import test from "node:test"
import assert from "node:assert/strict"
import { computeSecurityRiskScore, countFindingsBySeverity } from "./scoring"

test("countFindingsBySeverity aggregates all severities", () => {
  const counts = countFindingsBySeverity([
    { id: "a", title: "a", summary: "a", severity: "critical", threatIds: [], controlIds: [] },
    { id: "b", title: "b", summary: "b", severity: "high", threatIds: [], controlIds: [] },
    { id: "c", title: "c", summary: "c", severity: "high", threatIds: [], controlIds: [] },
    { id: "d", title: "d", summary: "d", severity: "low", threatIds: [], controlIds: [] },
  ])

  assert.deepEqual(counts, {
    critical: 1,
    high: 2,
    medium: 0,
    low: 1,
    info: 0,
  })
})

test("computeSecurityRiskScore maps weighted findings to bounded score", () => {
  const score = computeSecurityRiskScore([
    { id: "a", title: "a", summary: "a", severity: "critical", threatIds: [], controlIds: [] },
    { id: "b", title: "b", summary: "b", severity: "high", threatIds: [], controlIds: [] },
  ])

  assert.equal(typeof score.score, "number")
  assert.ok(score.score >= 0 && score.score <= 100)
  assert.ok(["low", "medium", "high", "critical"].includes(score.level))
})
