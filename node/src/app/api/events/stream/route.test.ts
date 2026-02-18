import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import type { RealtimeEvent } from "@/lib/types/realtime"
import { AccessControlError } from "@/lib/security/access-control"
import { toSseChunk } from "@/lib/realtime/events"
import { handleGetEventsStream, type EventsStreamRouteDeps } from "./route"

function requestFor(url: string, headers: Record<string, string> = {}): NextRequest {
  const request = new Request(url, {
    method: "GET",
    headers,
  })

  return {
    ...request,
    headers: request.headers,
    nextUrl: new URL(url),
    signal: request.signal,
  } as unknown as NextRequest
}

function deps(overrides: Partial<EventsStreamRouteDeps> = {}): EventsStreamRouteDeps {
  return {
    requireAccessActor: async () => ({
      userId: "user-1",
      email: "captain@example.com",
      role: "captain",
      isAdmin: false,
    }),
    subscribeRealtimeEvents: () => () => {
      // no-op
    },
    toSseChunk,
    getNodeRuntimeMetrics: () => ({
      capturedAt: "2026-02-17T00:00:00.000Z",
      status: "healthy",
      signals: {
        cpuPercent: 1,
        heapPressurePercent: 2,
        eventLoopLagP95Ms: 3,
        rssBytes: 4,
        heapUsedBytes: 5,
        heapTotalBytes: 6,
        uptimeSec: 7,
      },
    }),
    verifyToken: () => ({
      ok: false,
      status: 401,
      error: "Invalid token",
    }),
    strictTypeValidation: () => false,
    enforceCookieOrigin: () => false,
    now: () => new Date("2026-02-17T00:00:00.000Z"),
    ...overrides,
  }
}

async function readAvailableText(response: Response, timeoutMs = 40): Promise<{ text: string; cancel: () => Promise<void> }> {
  const reader = response.body?.getReader()
  assert.ok(reader)
  const decoder = new TextDecoder()
  let text = ""

  for (let i = 0; i < 8; i++) {
    const result = await Promise.race([
      reader.read().then((value) => ({ kind: "read" as const, value })),
      new Promise<{ kind: "timeout" }>((resolve) => setTimeout(() => resolve({ kind: "timeout" }), timeoutMs)),
    ])

    if (result.kind === "timeout") {
      break
    }

    if (result.value.done || !result.value.value) {
      break
    }

    text += decoder.decode(result.value.value)
  }

  return {
    text,
    cancel: async () => {
      await reader.cancel()
    },
  }
}

test("handleGetEventsStream rejects unauthenticated session requests", async () => {
  const response = await handleGetEventsStream(
    requestFor("http://localhost/api/events/stream"),
    deps({
      requireAccessActor: async () => {
        throw new AccessControlError("Unauthorized", 401, "UNAUTHORIZED")
      },
    }),
  )

  assert.equal(response.status, 401)
})

test("handleGetEventsStream rejects invalid bearer token", async () => {
  const response = await handleGetEventsStream(
    requestFor("http://localhost/api/events/stream", {
      authorization: "Bearer bad-token",
    }),
    deps(),
  )

  assert.equal(response.status, 401)
})

test("handleGetEventsStream enforces session user scoping", async () => {
  let listener: ((event: RealtimeEvent) => void) | null = null
  const response = await handleGetEventsStream(
    requestFor("http://localhost/api/events/stream"),
    deps({
      subscribeRealtimeEvents: (nextListener) => {
        listener = nextListener
        return () => {
          listener = null
        }
      },
    }),
  )

  assert.equal(response.status, 200)
  assert.ok(listener)
  listener({
    id: "evt-other",
    type: "task.updated",
    timestamp: "2026-02-17T00:00:00.000Z",
    userId: "user-2",
    payload: { value: "other" },
  })
  listener({
    id: "evt-own",
    type: "task.updated",
    timestamp: "2026-02-17T00:00:01.000Z",
    userId: "user-1",
    payload: { value: "own" },
  })

  const output = await readAvailableText(response)
  assert.match(output.text, /evt-own/u)
  assert.doesNotMatch(output.text, /evt-other/u)
  await output.cancel()
})

test("handleGetEventsStream preserves admin global visibility", async () => {
  let listener: ((event: RealtimeEvent) => void) | null = null
  const response = await handleGetEventsStream(
    requestFor("http://localhost/api/events/stream"),
    deps({
      requireAccessActor: async () => ({
        userId: "admin-1",
        email: "admin@example.com",
        role: "admin",
        isAdmin: true,
      }),
      subscribeRealtimeEvents: (nextListener) => {
        listener = nextListener
        return () => {
          listener = null
        }
      },
    }),
  )

  assert.equal(response.status, 200)
  assert.ok(listener)
  listener({
    id: "evt-any",
    type: "task.updated",
    timestamp: "2026-02-17T00:00:00.000Z",
    userId: "user-2",
    payload: { value: "any" },
  })

  const output = await readAvailableText(response)
  assert.match(output.text, /evt-any/u)
  await output.cancel()
})

test("handleGetEventsStream intersects query type filter with JWT token types", async () => {
  let listener: ((event: RealtimeEvent) => void) | null = null
  const response = await handleGetEventsStream(
    requestFor("http://localhost/api/events/stream?types=task.updated,verification.updated", {
      authorization: "Bearer good-token",
    }),
    deps({
      verifyToken: () => ({
        ok: true,
        actor: {
          userId: "user-1",
          isAdmin: false,
          authType: "jwt",
          tokenTypes: new Set(["task.updated"]),
        },
      }),
      subscribeRealtimeEvents: (nextListener) => {
        listener = nextListener
        return () => {
          listener = null
        }
      },
    }),
  )

  assert.equal(response.status, 200)
  assert.ok(listener)
  listener({
    id: "evt-task",
    type: "task.updated",
    timestamp: "2026-02-17T00:00:00.000Z",
    userId: "user-1",
    payload: { value: "task" },
  })
  listener({
    id: "evt-verification",
    type: "verification.updated",
    timestamp: "2026-02-17T00:00:01.000Z",
    userId: "user-1",
    payload: { value: "verification" },
  })

  const output = await readAvailableText(response)
  assert.match(output.text, /evt-task/u)
  assert.doesNotMatch(output.text, /evt-verification/u)
  await output.cancel()
})

test("handleGetEventsStream enforces strict type validation when enabled", async () => {
  const response = await handleGetEventsStream(
    requestFor("http://localhost/api/events/stream?types=unknown.type"),
    deps({
      strictTypeValidation: () => true,
    }),
  )

  assert.equal(response.status, 400)
})

test("handleGetEventsStream blocks cross-site cookie-auth requests when enabled", async () => {
  const response = await handleGetEventsStream(
    requestFor("http://localhost/api/events/stream", {
      origin: "https://evil.example",
      "sec-fetch-site": "cross-site",
    }),
    deps({
      enforceCookieOrigin: () => true,
    }),
  )

  assert.equal(response.status, 403)
})

test("handleGetEventsStream returns hardened SSE headers", async () => {
  const response = await handleGetEventsStream(
    requestFor("http://localhost/api/events/stream"),
    deps(),
  )

  assert.equal(response.status, 200)
  assert.equal(response.headers.get("cache-control"), "no-store, private, no-transform")
  assert.equal(response.headers.get("pragma"), "no-cache")
  assert.equal(response.headers.get("x-content-type-options"), "nosniff")
  assert.equal(response.headers.get("x-accel-buffering"), "no")
  assert.equal(response.headers.get("vary"), "Authorization, Cookie, Origin")

  await response.body?.cancel()
})

test("handleGetEventsStream returns 429 when stream limits are enforced", async () => {
  const originalEnforce = process.env.ORCHWIZ_SSE_LIMITS_ENFORCE
  const originalPerUserMax = process.env.ORCHWIZ_SSE_PER_USER_MAX_STREAMS
  const originalGlobalMax = process.env.ORCHWIZ_SSE_GLOBAL_MAX_STREAMS

  process.env.ORCHWIZ_SSE_LIMITS_ENFORCE = "true"
  process.env.ORCHWIZ_SSE_PER_USER_MAX_STREAMS = "1"
  process.env.ORCHWIZ_SSE_GLOBAL_MAX_STREAMS = "10"

  try {
    const first = await handleGetEventsStream(requestFor("http://localhost/api/events/stream"), deps())
    assert.equal(first.status, 200)

    const second = await handleGetEventsStream(requestFor("http://localhost/api/events/stream"), deps())
    assert.equal(second.status, 429)
    assert.equal(second.headers.get("retry-after"), "5")

    await first.body?.cancel()
  } finally {
    if (originalEnforce === undefined) {
      delete process.env.ORCHWIZ_SSE_LIMITS_ENFORCE
    } else {
      process.env.ORCHWIZ_SSE_LIMITS_ENFORCE = originalEnforce
    }

    if (originalPerUserMax === undefined) {
      delete process.env.ORCHWIZ_SSE_PER_USER_MAX_STREAMS
    } else {
      process.env.ORCHWIZ_SSE_PER_USER_MAX_STREAMS = originalPerUserMax
    }

    if (originalGlobalMax === undefined) {
      delete process.env.ORCHWIZ_SSE_GLOBAL_MAX_STREAMS
    } else {
      process.env.ORCHWIZ_SSE_GLOBAL_MAX_STREAMS = originalGlobalMax
    }
  }
})
