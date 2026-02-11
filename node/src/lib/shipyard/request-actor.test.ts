import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { AccessControlError } from "@/lib/security/access-control"
import { createShipyardUserApiKey } from "@/lib/shipyard/user-api-keys"
import {
  requireShipyardRequestActor,
  type ShipyardRequestActorDeps,
} from "./request-actor"

function requestFor(url: string, headers?: Record<string, string>): NextRequest {
  return {
    headers: new Headers(headers),
    nextUrl: new URL(url),
  } as unknown as NextRequest
}

async function withEnv<T>(patch: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
  const original: Record<string, string | undefined> = {}
  const keys = Object.keys(patch)

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

function defaultDeps(overrides: Partial<ShipyardRequestActorDeps> = {}): ShipyardRequestActorDeps {
  return {
    requireSessionActor: async () => ({
      userId: "session-user",
      email: "session@example.com",
      role: "captain",
      isAdmin: false,
    }),
    findApiKeyByKeyId: async () => null,
    touchApiKeyLastUsedAt: async () => {},
    findUserById: async (userId) => ({
      id: userId,
      email: `${userId}@example.com`,
      role: "captain",
    }),
    ...overrides,
  }
}

test("requireShipyardRequestActor falls back to session actor without bearer", async () => {
  const actor = await requireShipyardRequestActor(
    requestFor("http://localhost/api/ship-yard/billing/wallet"),
    {},
    defaultDeps(),
  )

  assert.equal(actor.authType, "session")
  assert.equal(actor.userId, "session-user")
})

test("requireShipyardRequestActor accepts valid user API key", async () => {
  const generated = createShipyardUserApiKey()
  let touchedId: string | null = null

  const actor = await requireShipyardRequestActor(
    requestFor("http://localhost/api/ship-yard/billing/wallet", {
      authorization: `Bearer ${generated.plaintextKey}`,
    }),
    {},
    defaultDeps({
      findApiKeyByKeyId: async (keyId) => ({
        id: "shipyard-key-1",
        keyId,
        keyHash: generated.keyHash,
        revokedAt: null,
        user: {
          id: "user-1",
          email: "captain@example.com",
          role: "captain",
        },
      }),
      touchApiKeyLastUsedAt: async (id) => {
        touchedId = id
      },
      requireSessionActor: async () => {
        throw new Error("session fallback should not run for valid API key")
      },
    }),
  )

  assert.equal(actor.authType, "user_api_key")
  assert.equal(actor.userId, "user-1")
  assert.equal(actor.keyId, generated.keyId)
  assert.equal(touchedId, "shipyard-key-1")
})

test("requireShipyardRequestActor rejects revoked user API key", async () => {
  const generated = createShipyardUserApiKey()

  await assert.rejects(
    requireShipyardRequestActor(
      requestFor("http://localhost/api/ship-yard/billing/wallet", {
        authorization: `Bearer ${generated.plaintextKey}`,
      }),
      {},
      defaultDeps({
        findApiKeyByKeyId: async (keyId) => ({
          id: "shipyard-key-1",
          keyId,
          keyHash: generated.keyHash,
          revokedAt: new Date("2026-02-11T00:00:00.000Z"),
          user: {
            id: "user-1",
            email: "captain@example.com",
            role: "captain",
          },
        }),
      }),
    ),
    (error) => {
      assert.ok(error instanceof AccessControlError)
      assert.equal(error.status, 401)
      return true
    },
  )
})

test("requireShipyardRequestActor rejects invalid bearer token on non-legacy routes", async () => {
  await assert.rejects(
    requireShipyardRequestActor(
      requestFor("http://localhost/api/ship-yard/billing/wallet", {
        authorization: "Bearer not-a-shipyard-key",
      }),
      {
        allowLegacyTokenAuth: false,
      },
      defaultDeps(),
    ),
    (error) => {
      assert.ok(error instanceof AccessControlError)
      assert.equal(error.status, 401)
      return true
    },
  )
})

test("requireShipyardRequestActor accepts legacy token when enabled", async () => {
  await withEnv(
    {
      SHIPYARD_API_TOKEN: "legacy-token",
      SHIPYARD_API_TOKEN_USER_ID: undefined,
      SHIPYARD_API_ALLOWED_USER_IDS: undefined,
      SHIPYARD_API_ALLOW_IMPERSONATION: "true",
      SHIPYARD_API_DEFAULT_USER_ID: undefined,
    },
    async () => {
      const actor = await requireShipyardRequestActor(
        requestFor("http://localhost/api/ship-yard/launch", {
          authorization: "Bearer legacy-token",
        }),
        {
          allowLegacyTokenAuth: true,
          body: {
            userId: "legacy-user",
          },
        },
        defaultDeps({
          findUserById: async (userId) => ({
            id: userId,
            email: "legacy@example.com",
            role: "captain",
          }),
          requireSessionActor: async () => {
            throw new Error("session fallback should not run for bearer requests")
          },
        }),
      )

      assert.equal(actor.authType, "legacy_token")
      assert.equal(actor.userId, "legacy-user")
    },
  )
})

test("requireShipyardRequestActor rejects legacy token on routes that disable legacy auth", async () => {
  await withEnv(
    {
      SHIPYARD_API_TOKEN: "legacy-token",
    },
    async () => {
      await assert.rejects(
        requireShipyardRequestActor(
          requestFor("http://localhost/api/ship-yard/billing/wallet", {
            authorization: "Bearer legacy-token",
          }),
          {
            allowLegacyTokenAuth: false,
          },
          defaultDeps(),
        ),
        (error) => {
          assert.ok(error instanceof AccessControlError)
          assert.equal(error.status, 401)
          return true
        },
      )
    },
  )
})
