import assert from "node:assert/strict"
import test from "node:test"
import {
  clampPercent,
  classifyNodeRuntimeStatus,
  computeCpuPercent,
  computeHeapPressurePercent,
  nanosToMilliseconds,
} from "./node-metrics"

test("classifyNodeRuntimeStatus returns healthy when all signals are below healthy thresholds", () => {
  const status = classifyNodeRuntimeStatus({
    cpuPercent: 40,
    heapPressurePercent: 50,
    eventLoopLagP95Ms: 18,
  })

  assert.equal(status, "healthy")
})

test("classifyNodeRuntimeStatus returns elevated when outside healthy but inside elevated thresholds", () => {
  const status = classifyNodeRuntimeStatus({
    cpuPercent: 70,
    heapPressurePercent: 80,
    eventLoopLagP95Ms: 60,
  })

  assert.equal(status, "elevated")
})

test("classifyNodeRuntimeStatus returns degraded when any signal exceeds elevated thresholds", () => {
  assert.equal(
    classifyNodeRuntimeStatus({
      cpuPercent: 86,
      heapPressurePercent: 10,
      eventLoopLagP95Ms: 8,
    }),
    "degraded",
  )
  assert.equal(
    classifyNodeRuntimeStatus({
      cpuPercent: 10,
      heapPressurePercent: 91,
      eventLoopLagP95Ms: 8,
    }),
    "degraded",
  )
  assert.equal(
    classifyNodeRuntimeStatus({
      cpuPercent: 10,
      heapPressurePercent: 10,
      eventLoopLagP95Ms: 130,
    }),
    "degraded",
  )
})

test("computeHeapPressurePercent handles normal and invalid totals", () => {
  assert.equal(computeHeapPressurePercent(512, 1024), 50)
  assert.equal(computeHeapPressurePercent(500, 0), 0)
  assert.equal(computeHeapPressurePercent(2_048, 1_024), 100)
})

test("nanosToMilliseconds converts safely and rounds to one decimal place", () => {
  assert.equal(nanosToMilliseconds(15_240_000), 15.2)
  assert.equal(nanosToMilliseconds(-1), 0)
})

test("clampPercent enforces 0..100 range", () => {
  assert.equal(clampPercent(-5), 0)
  assert.equal(clampPercent(42.5), 42.5)
  assert.equal(clampPercent(150), 100)
})

test("computeCpuPercent first sample uses uptime-average formula deterministically", () => {
  const percent = computeCpuPercent({
    usage: { user: 2_000_000, system: 1_000_000 },
    hrtimeNs: BigInt(10_000_000_000),
    previousSample: null,
    uptimeSec: 10,
    cpuCoreCount: 4,
  })

  assert.equal(percent, 7.5)
})

test("computeCpuPercent with previous sample uses interval delta formula", () => {
  const percent = computeCpuPercent({
    usage: { user: 1_400_000, system: 1_200_000 },
    hrtimeNs: BigInt(4_000_000_000),
    previousSample: {
      usage: { user: 1_000_000, system: 1_000_000 },
      hrtimeNs: BigInt(2_000_000_000),
    },
    uptimeSec: 4,
    cpuCoreCount: 2,
  })

  assert.equal(percent, 15)
})
