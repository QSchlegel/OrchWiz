import assert from "node:assert/strict"
import test from "node:test"
import {
  parseRuntimeNodeMetricsPayload,
  RUNTIME_NODE_METRICS_EVENT_TYPE,
} from "./realtime-node-metrics"

test("runtime node metrics event type constant remains stable", () => {
  assert.equal(RUNTIME_NODE_METRICS_EVENT_TYPE, "runtime.node.metrics.updated")
})

test("parseRuntimeNodeMetricsPayload accepts valid payloads", () => {
  const parsed = parseRuntimeNodeMetricsPayload({
    capturedAt: "2026-02-12T00:00:00.000Z",
    status: "healthy",
    signals: {
      cpuPercent: 12.5,
      heapPressurePercent: 67.2,
      eventLoopLagP95Ms: 8.1,
      rssBytes: 123456789,
      heapUsedBytes: 6543210,
      heapTotalBytes: 9999999,
      uptimeSec: 88,
    },
  })

  assert.deepEqual(parsed, {
    capturedAt: "2026-02-12T00:00:00.000Z",
    status: "healthy",
    signals: {
      cpuPercent: 12.5,
      heapPressurePercent: 67.2,
      eventLoopLagP95Ms: 8.1,
      rssBytes: 123456789,
      heapUsedBytes: 6543210,
      heapTotalBytes: 9999999,
      uptimeSec: 88,
    },
  })
})

test("parseRuntimeNodeMetricsPayload rejects malformed payloads", () => {
  assert.equal(parseRuntimeNodeMetricsPayload(null), null)
  assert.equal(parseRuntimeNodeMetricsPayload({}), null)
  assert.equal(
    parseRuntimeNodeMetricsPayload({
      capturedAt: "2026-02-12T00:00:00.000Z",
      status: "unknown",
      signals: {
        cpuPercent: 10,
        heapPressurePercent: 20,
        eventLoopLagP95Ms: 2,
        rssBytes: 1,
        heapUsedBytes: 1,
        heapTotalBytes: 1,
        uptimeSec: 1,
      },
    }),
    null,
  )
  assert.equal(
    parseRuntimeNodeMetricsPayload({
      capturedAt: "2026-02-12T00:00:00.000Z",
      status: "healthy",
      signals: {
        cpuPercent: "10",
        heapPressurePercent: 20,
        eventLoopLagP95Ms: 2,
        rssBytes: 1,
        heapUsedBytes: 1,
        heapTotalBytes: 1,
        uptimeSec: 1,
      },
    }),
    null,
  )
})

test("parseRuntimeNodeMetricsPayload handles finite edge numeric values", () => {
  const parsed = parseRuntimeNodeMetricsPayload({
    capturedAt: "2026-02-12T00:00:00.000Z",
    status: "degraded",
    signals: {
      cpuPercent: 0,
      heapPressurePercent: 100,
      eventLoopLagP95Ms: 0,
      rssBytes: 0,
      heapUsedBytes: 0,
      heapTotalBytes: 1,
      uptimeSec: 0,
    },
  })

  assert.ok(parsed)
  assert.equal(parsed?.signals.cpuPercent, 0)
  assert.equal(parsed?.signals.heapPressurePercent, 100)
  assert.equal(parsed?.signals.uptimeSec, 0)
  assert.equal(
    parseRuntimeNodeMetricsPayload({
      capturedAt: "2026-02-12T00:00:00.000Z",
      status: "healthy",
      signals: {
        cpuPercent: Number.NaN,
        heapPressurePercent: 10,
        eventLoopLagP95Ms: 10,
        rssBytes: 10,
        heapUsedBytes: 10,
        heapTotalBytes: 10,
        uptimeSec: 10,
      },
    }),
    null,
  )
})
