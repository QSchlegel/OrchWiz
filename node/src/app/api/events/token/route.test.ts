import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { verifySseJwt } from "@/lib/realtime/sse-jwt"
import { AccessControlError } from "@/lib/security/access-control"
import { handlePostEventsToken, type EventsTokenRouteDeps } from "./route"

function requestFor(body: Record<string, unknown>, headers: Record<string, string> = {}): NextRequest {
  const request = new Request("http://localhost/api/events/token", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  })

  return {
    ...request,
    headers: request.headers,
    nextUrl: new URL(request.url),
    json: request.json.bind(request),
  } as unknown as NextRequest
}

function deps(overrides: Partial<EventsTokenRouteDeps> = {}): EventsTokenRouteDeps {
  return {
    now: () => new Date("2026-02-17T00:00:00.000Z"),
    requireSessionActor: async () => ({
      userId: "user-1",
      email: "captain@example.com",
      role: "captain",
      isAdmin: false,
    }),
    resolveMachineActor: async () => ({ ok: true, userId: "machine-user" }),
    secret: () => "sse-secret",
    issuer: () => "orchwiz",
    audience: () => "orchwiz-sse",
    defaultTtlSeconds: () => 60,
    maxTtlSeconds: () => 300,
    strictTypeValidation: () => false,
    ...overrides,
  }
}

test("handlePostEventsToken mints a self-scoped token for session user", async () => {
  const response = await handlePostEventsToken(
    requestFor({
      types: ["task.updated", "verification.updated"],
      ttlSeconds: 45,
    }),
    deps(),
  )

  assert.equal(response.status, 200)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.userId, "user-1")
  assert.equal(payload.admin, false)
  assert.deepEqual(payload.types, ["task.updated", "verification.updated"])
  assert.equal(typeof payload.token, "string")

  const token = String(payload.token)
  const verified = verifySseJwt(token, {
    secret: "sse-secret",
    issuer: "orchwiz",
    audience: "orchwiz-sse",
    now: new Date("2026-02-17T00:00:10.000Z"),
  })
  assert.equal(verified.ok, true)
  if (verified.ok) {
    assert.equal(verified.payload.sub, "user-1")
    assert.deepEqual(verified.payload.types, ["task.updated", "verification.updated"])
  }
})

test("handlePostEventsToken rejects non-admin cross-user minting", async () => {
  const response = await handlePostEventsToken(
    requestFor({
      userId: "user-2",
    }),
    deps(),
  )

  assert.equal(response.status, 403)
})

test("handlePostEventsToken allows admin minting admin token", async () => {
  const response = await handlePostEventsToken(
    requestFor({
      userId: "user-2",
      admin: true,
      ttlSeconds: 5000,
    }),
    deps({
      requireSessionActor: async () => ({
        userId: "admin-1",
        email: "admin@example.com",
        role: "admin",
        isAdmin: true,
      }),
    }),
  )

  assert.equal(response.status, 200)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.userId, "user-2")
  assert.equal(payload.admin, true)

  const token = String(payload.token)
  const verified = verifySseJwt(token, {
    secret: "sse-secret",
    issuer: "orchwiz",
    audience: "orchwiz-sse",
    now: new Date("2026-02-17T00:04:59.000Z"),
  })
  assert.equal(verified.ok, true)
  if (verified.ok) {
    assert.equal(verified.payload.adm, true)
    assert.equal(verified.payload.exp - verified.payload.iat, 300)
  }
})

test("handlePostEventsToken machine mode requires explicit body userId", async () => {
  const response = await handlePostEventsToken(
    requestFor(
      {
        types: ["task.updated"],
      },
      { authorization: "Bearer machine-token" },
    ),
    deps({
      requireSessionActor: async () => {
        throw new AccessControlError("Unauthorized", 401, "UNAUTHORIZED")
      },
    }),
  )

  assert.equal(response.status, 400)
})

test("handlePostEventsToken machine mode disallows admin token minting", async () => {
  const response = await handlePostEventsToken(
    requestFor(
      {
        userId: "machine-user",
        admin: true,
      },
      { authorization: "Bearer machine-token" },
    ),
    deps({
      requireSessionActor: async () => {
        throw new AccessControlError("Unauthorized", 401, "UNAUTHORIZED")
      },
    }),
  )

  assert.equal(response.status, 403)
})

test("handlePostEventsToken prefers session auth over bearer token when session exists", async () => {
  const response = await handlePostEventsToken(
    requestFor(
      {
        userId: "user-1",
      },
      { authorization: "Bearer machine-token" },
    ),
    deps({
      resolveMachineActor: async () => ({
        ok: false,
        status: 401,
        error: "Unexpected machine auth path",
      }),
    }),
  )

  assert.equal(response.status, 200)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.userId, "user-1")
})

test("handlePostEventsToken strict type validation rejects unknown types", async () => {
  const response = await handlePostEventsToken(
    requestFor({
      types: ["task.updated", "unknown.type"],
    }),
    deps({
      strictTypeValidation: () => true,
    }),
  )

  assert.equal(response.status, 400)
  const payload = (await response.json()) as Record<string, unknown>
  assert.match(String(payload.error), /Unsupported realtime event type/u)
})
