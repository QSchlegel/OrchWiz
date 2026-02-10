import test from "node:test"
import assert from "node:assert/strict"
import { evaluateBridgeCrewScenarios } from "./evaluator"
import { scenariosForPack } from "./scenarios"

test("evaluateBridgeCrewScenarios returns deterministic score output", () => {
  const scenarios = scenariosForPack("core")
  const metricsByStation = {
    xo: { stationKey: "xo", total: 12, success: 11, failed: 1, offline: 0, retryRate: 0.08, successRate: 0.92, p95LatencyMs: 1200 },
    ops: { stationKey: "ops", total: 11, success: 8, failed: 2, offline: 1, retryRate: 0.18, successRate: 0.73, p95LatencyMs: 9800 },
    eng: { stationKey: "eng", total: 10, success: 8, failed: 2, offline: 0, retryRate: 0.2, successRate: 0.8, p95LatencyMs: 3000 },
    sec: { stationKey: "sec", total: 10, success: 9, failed: 1, offline: 0, retryRate: 0.1, successRate: 0.9, p95LatencyMs: 1800 },
    med: { stationKey: "med", total: 8, success: 7, failed: 1, offline: 0, retryRate: 0.12, successRate: 0.87, p95LatencyMs: 2200 },
    cou: { stationKey: "cou", total: 9, success: 7, failed: 2, offline: 0, retryRate: 0.35, successRate: 0.78, p95LatencyMs: 8500 },
  }

  const scorecard = evaluateBridgeCrewScenarios({
    userId: "user-1",
    mode: "safe_sim",
    scenarioPack: "core",
    scenarios,
    metricsByStation,
    generatedAt: new Date("2026-02-10T12:00:00.000Z"),
  })

  assert.equal(scorecard.userId, "user-1")
  assert.equal(scorecard.mode, "safe_sim")
  assert.equal(scorecard.generatedAt, "2026-02-10T12:00:00.000Z")
  assert.equal(scorecard.sampleSize, 60)
  assert.ok(scorecard.overallScore >= 0 && scorecard.overallScore <= 100)
  assert.ok(scorecard.failingScenarios.length > 0)
  assert.equal(scorecard.perStationScores.sec >= scorecard.perStationScores.ops, true)
})
