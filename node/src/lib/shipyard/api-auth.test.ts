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

async function withAuthEnv<T>(patch: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
  const original: Record<string, string | undefined> = {}
  const keys = [
    "SHIPYARD_API_TOKEN_USER_ID",
    "SHIPYARD_API_ALLOWED_USER_IDS",
    "SHIPYARD_API_ALLOW_IMPERSONATION",
    "SHIPYARD_API_DEFAULT_USER_ID",
    ...Object.keys(patch),
  ]

  for (const key of keys) {
    original[key] = process.env[key]
    const next = patch[key]
    if (next === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = next
    }
  }

  try {
    return await run()
  } finally {
    for (const key of keys) {
      const previous = original[key]
      if (previous === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = previous
      }
    }
  }
}

test("resolveShipyardApiActorFromRequest accepts valid bearer token with userId in body", async () => {
  await withAuthEnv(
    {
      SHIPYARD_API_TOKEN_USER_ID: undefined,
      SHIPYARD_API_ALLOWED_USER_IDS: undefined,
      SHIPYARD_API_ALLOW_IMPERSONATION: undefined,
      SHIPYARD_API_DEFAULT_USER_ID: undefined,
    },
    async () => {
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
      assert.equal(result.actor.requestedUserId, "user-123")
      assert.equal(result.actor.impersonated, true)
    },
  )
})

test("resolveShipyardApiActorFromRequest enforces token user allowlist when configured", async () => {
  await withAuthEnv(
    {
      SHIPYARD_API_ALLOWED_USER_IDS: "allowed-user",
      SHIPYARD_API_ALLOW_IMPERSONATION: "true",
      SHIPYARD_API_TOKEN_USER_ID: undefined,
      SHIPYARD_API_DEFAULT_USER_ID: undefined,
    },
    async () => {
      const request = requestFor("http://localhost/api/ship-yard/launch", {
        authorization: "Bearer shipyard-token",
      })

      const result = await resolveShipyardApiActorFromRequest(request, {
        shipyardApiToken: "shipyard-token",
        body: { userId: "not-allowed" },
        getSessionUserId: async () => "session-user",
        userExists: async () => true,
      })

      assert.equal(result.ok, false)
      if (!result.ok) {
        assert.equal(result.status, 403)
      }
    },
  )
})

test("resolveShipyardApiActorFromRequest blocks impersonation when default user is enforced", async () => {
  await withAuthEnv(
    {
      SHIPYARD_API_DEFAULT_USER_ID: "system-user",
      SHIPYARD_API_ALLOW_IMPERSONATION: "false",
      SHIPYARD_API_TOKEN_USER_ID: undefined,
      SHIPYARD_API_ALLOWED_USER_IDS: undefined,
    },
    async () => {
      const request = requestFor("http://localhost/api/ship-yard/launch", {
        authorization: "Bearer shipyard-token",
      })

      const result = await resolveShipyardApiActorFromRequest(request, {
        shipyardApiToken: "shipyard-token",
        body: { userId: "other-user" },
        getSessionUserId: async () => "session-user",
        userExists: async () => true,
      })

      assert.equal(result.ok, false)
      if (!result.ok) {
        assert.equal(result.status, 403)
      }
    },
  )
})

test("resolveShipyardApiActorFromRequest rejects invalid bearer token without session fallback", async () => {
  await withAuthEnv(
    {
      SHIPYARD_API_TOKEN_USER_ID: undefined,
      SHIPYARD_API_ALLOWED_USER_IDS: undefined,
      SHIPYARD_API_ALLOW_IMPERSONATION: undefined,
      SHIPYARD_API_DEFAULT_USER_ID: undefined,
    },
    async () => {
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
    },
  )
})

test("resolveShipyardApiActorFromRequest requires userId for bearer token requests", async () => {
  await withAuthEnv(
    {
      SHIPYARD_API_TOKEN_USER_ID: undefined,
      SHIPYARD_API_ALLOWED_USER_IDS: undefined,
      SHIPYARD_API_ALLOW_IMPERSONATION: undefined,
      SHIPYARD_API_DEFAULT_USER_ID: undefined,
    },
    async () => {
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
    },
  )
})

test("resolveShipyardApiActorFromRequest validates token-auth user existence", async () => {
  await withAuthEnv(
    {
      SHIPYARD_API_TOKEN_USER_ID: undefined,
      SHIPYARD_API_ALLOWED_USER_IDS: undefined,
      SHIPYARD_API_ALLOW_IMPERSONATION: undefined,
      SHIPYARD_API_DEFAULT_USER_ID: undefined,
    },
    async () => {
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
    },
  )
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
