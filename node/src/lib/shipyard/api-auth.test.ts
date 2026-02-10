import test from "node:test"
import assert from "node:assert/strict"
import type { NextRequest } from "next/server"
import {
  readRequestedUserId,
  resolveShipyardApiActorFromRequest,
} from "./api-auth"

function requestFor(url: string, headers?: Record<string, string>): NextRequest {
  return {
    headers: new Headers(headers),
    nextUrl: new URL(url),
  } as unknown as NextRequest
}

test("resolveShipyardApiActorFromRequest accepts valid bearer token with userId in body", async () => {
  const request = requestFor("http://localhost/api/ship-yard/launch", {
    authorization: "Bearer shipyard-token",
  })

  const result = await resolveShipyardApiActorFromRequest(request, {
    shipyardApiToken: "shipyard-token",
    body: {
      userId: "user-123",
    },
    getSessionUserId: async () => {
      throw new Error("session fallback should not run for valid bearer")
    },
    userExists: async (userId) => userId === "user-123",
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.actor.type, "token")
  assert.equal(result.actor.userId, "user-123")
})

test("resolveShipyardApiActorFromRequest rejects invalid bearer token without session fallback", async () => {
  const request = requestFor("http://localhost/api/ship-yard/launch", {
    authorization: "Bearer wrong-token",
  })

  let sessionCalls = 0
  const result = await resolveShipyardApiActorFromRequest(request, {
    shipyardApiToken: "shipyard-token",
    getSessionUserId: async () => {
      sessionCalls += 1
      return "session-user"
    },
    userExists: async () => true,
  })

  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 401)
  }
  assert.equal(sessionCalls, 0)
})

test("resolveShipyardApiActorFromRequest requires userId for bearer token requests", async () => {
  const request = requestFor("http://localhost/api/ship-yard/launch", {
    authorization: "Bearer shipyard-token",
  })

  const result = await resolveShipyardApiActorFromRequest(request, {
    shipyardApiToken: "shipyard-token",
    getSessionUserId: async () => "session-user",
    userExists: async () => true,
  })

  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 400)
  }
})

test("resolveShipyardApiActorFromRequest validates token-auth user existence", async () => {
  const request = requestFor("http://localhost/api/ship-yard/launch?userId=missing-user", {
    authorization: "Bearer shipyard-token",
  })

  const result = await resolveShipyardApiActorFromRequest(request, {
    shipyardApiToken: "shipyard-token",
    getSessionUserId: async () => "session-user",
    userExists: async () => false,
  })

  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 404)
    assert.equal(result.error, "User not found")
  }
})

test("resolveShipyardApiActorFromRequest falls back to session when no bearer header is present", async () => {
  const request = requestFor("http://localhost/api/ship-yard/launch")

  const result = await resolveShipyardApiActorFromRequest(request, {
    shipyardApiToken: "shipyard-token",
    getSessionUserId: async () => "session-user",
    userExists: async () => {
      throw new Error("user existence lookup should not run for session flow")
    },
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.actor.type, "session")
  assert.equal(result.actor.userId, "session-user")
})

test("readRequestedUserId prefers body, then query, then header", () => {
  const request = requestFor("http://localhost/api/ship-yard/launch?userId=query-user", {
    "x-orchwiz-user-id": "header-user",
  })

  const fromBody = readRequestedUserId(request, { userId: "body-user" })
  assert.equal(fromBody, "body-user")

  const fromQuery = readRequestedUserId(request, {})
  assert.equal(fromQuery, "query-user")

  const fromHeader = readRequestedUserId(
    requestFor("http://localhost/api/ship-yard/launch", {
      "x-orchwiz-user-id": "header-user",
    }),
  )
  assert.equal(fromHeader, "header-user")
})
