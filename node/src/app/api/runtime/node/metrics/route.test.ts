import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { handleGetNodeRuntimeMetrics } from "./route"

function requestFor(): NextRequest {
  return {
    headers: new Headers(),
    nextUrl: new URL("http://localhost:3000/api/runtime/node/metrics"),
  } as unknown as NextRequest
}

test("handleGetNodeRuntimeMetrics returns 401 when session is missing", async () => {
  const response = await handleGetNodeRuntimeMetrics(requestFor(), {
    getSessionUserId: async () => null,
    getMetrics: () => ({
      capturedAt: "2026-02-12T00:00:00.000Z",
      status: "healthy",
      signals: {
        cpuPercent: 10,
        heapPressurePercent: 40,
        eventLoopLagP95Ms: 5,
        rssBytes: 1000,
        heapUsedBytes: 800,
        heapTotalBytes: 1600,
        uptimeSec: 120,
      },
    }),
  })

  assert.equal(response.status, 401)
})

test("handleGetNodeRuntimeMetrics returns metrics for authenticated users", async () => {
  const response = await handleGetNodeRuntimeMetrics(requestFor(), {
    getSessionUserId: async () => "user-1",
    getMetrics: () => ({
      capturedAt: "2026-02-12T00:00:00.000Z",
      status: "elevated",
      signals: {
        cpuPercent: 66.2,
        heapPressurePercent: 72.1,
        eventLoopLagP95Ms: 55.8,
        rssBytes: 52428800,
        heapUsedBytes: 20971520,
        heapTotalBytes: 41943040,
        uptimeSec: 720,
      },
    }),
  })

  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.status, "elevated")
  assert.equal(payload.signals.cpuPercent, 66.2)
  assert.equal(payload.signals.eventLoopLagP95Ms, 55.8)
})

test("handleGetNodeRuntimeMetrics returns 500 when metrics provider throws", async () => {
  const response = await handleGetNodeRuntimeMetrics(requestFor(), {
    getSessionUserId: async () => "user-1",
    getMetrics: () => {
      throw new Error("boom")
    },
  })

  assert.equal(response.status, 500)
  const payload = await response.json()
  assert.equal(payload.error, "Internal server error")
})
