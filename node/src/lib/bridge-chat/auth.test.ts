import test from "node:test"
import assert from "node:assert/strict"
import type { NextRequest } from "next/server"
import {
  readRequestedUserId,
  resolveBridgeChatActorFromRequest,
} from "./auth"

function requestFor(url: string, headers?: Record<string, string>): NextRequest {
  return {
    headers: new Headers(headers),
    nextUrl: new URL(url),
  } as unknown as NextRequest
}

test("resolveBridgeChatActorFromRequest accepts valid bearer admin token", async () => {
  const request = requestFor("http://localhost/api/threads", {
    authorization: "Bearer top-secret",
  })

  const result = await resolveBridgeChatActorFromRequest(request, {
    adminToken: "top-secret",
    getSession: async () => {
      throw new Error("session fallback should not run for valid bearer")
    },
  })

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.actor.type, "admin")
  }
})

test("resolveBridgeChatActorFromRequest rejects invalid bearer token without session fallback", async () => {
  const request = requestFor("http://localhost/api/threads", {
    authorization: "Bearer wrong-token",
  })

  let sessionCalls = 0
  const result = await resolveBridgeChatActorFromRequest(request, {
    adminToken: "expected-token",
    getSession: async () => {
      sessionCalls += 1
      return {
        user: {
          id: "user-1",
        },
      }
    },
  })

  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 401)
  }
  assert.equal(sessionCalls, 0)
})

test("resolveBridgeChatActorFromRequest falls back to session user", async () => {
  const request = requestFor("http://localhost/api/threads")

  const result = await resolveBridgeChatActorFromRequest(request, {
    adminToken: "expected-token",
    getSession: async () => ({
      user: {
        id: "user-123",
        email: "bridge@example.com",
      },
    }),
  })

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.actor.type, "user")
    assert.equal(result.actor.userId, "user-123")
    assert.equal(result.actor.email, "bridge@example.com")
  }
})

test("resolveBridgeChatActorFromRequest rejects unauthenticated access", async () => {
  const request = requestFor("http://localhost/api/threads")

  const result = await resolveBridgeChatActorFromRequest(request, {
    adminToken: "expected-token",
    getSession: async () => null,
  })

  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 401)
  }
})

test("readRequestedUserId prefers body, then query, then header", () => {
  const request = requestFor("http://localhost/api/threads?userId=query-user", {
    "x-orchwiz-user-id": "header-user",
  })

  const fromBody = readRequestedUserId(request, { userId: "body-user" })
  assert.equal(fromBody, "body-user")

  const fromQuery = readRequestedUserId(request, {})
  assert.equal(fromQuery, "query-user")

  const fromHeaderOnly = readRequestedUserId(requestFor("http://localhost/api/threads", {
    "x-orchwiz-user-id": "header-user",
  }))
  assert.equal(fromHeaderOnly, "header-user")
})
