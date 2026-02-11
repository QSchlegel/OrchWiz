import assert from "node:assert/strict"
import test from "node:test"
import {
  parsePerformanceWindow,
  performanceWindowStart,
  summarizePerformanceRows,
} from "./summary"

test("parsePerformanceWindow defaults to 24h and validates values", () => {
  assert.equal(parsePerformanceWindow(undefined), "24h")
  assert.equal(parsePerformanceWindow(null), "24h")
  assert.equal(parsePerformanceWindow("1h"), "1h")
  assert.equal(parsePerformanceWindow("24h"), "24h")
  assert.equal(parsePerformanceWindow("7d"), "7d")
  assert.equal(parsePerformanceWindow("2h"), null)
})

test("performanceWindowStart returns the expected relative time", () => {
  const now = new Date("2026-02-11T12:00:00.000Z")
  assert.equal(performanceWindowStart("1h", now).toISOString(), "2026-02-11T11:00:00.000Z")
  assert.equal(performanceWindowStart("24h", now).toISOString(), "2026-02-10T12:00:00.000Z")
  assert.equal(performanceWindowStart("7d", now).toISOString(), "2026-02-04T12:00:00.000Z")
})

test("summarizePerformanceRows computes rates and percentiles", () => {
  const summary = summarizePerformanceRows([
    { status: "success", fallbackUsed: false, durationMs: 10 },
    { status: "success", fallbackUsed: true, durationMs: 20 },
    { status: "error", fallbackUsed: false, durationMs: 40 },
    { status: "backend_unavailable", fallbackUsed: false, durationMs: 100 },
  ])

  assert.equal(summary.count, 4)
  assert.equal(summary.errorRate, 0.5)
  assert.equal(summary.fallbackRate, 0.25)
  assert.equal(summary.p50, 30)
  assert.equal(summary.p95, 91)
})

test("summarizePerformanceRows handles empty datasets", () => {
  const summary = summarizePerformanceRows([])
  assert.deepEqual(summary, {
    count: 0,
    errorRate: 0,
    fallbackRate: 0,
    p50: null,
    p95: null,
  })
})

