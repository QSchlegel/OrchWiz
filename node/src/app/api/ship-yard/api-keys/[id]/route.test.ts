import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { AccessControlError, type AccessActor } from "@/lib/security/access-control"
import { handleDeleteShipyardApiKey } from "./route"

const actor: AccessActor = {
  userId: "user-1",
  email: "captain@example.com",
  role: "captain",
  isAdmin: false,
}

function requestFor(): NextRequest {
  return new Request("http://localhost/api/ship-yard/api-keys/key-1", {
    method: "DELETE",
  }) as unknown as NextRequest
}

test("ship-yard api-keys/:id DELETE revokes active key", async () => {
  let revokedId: string | null = null

  const response = await handleDeleteShipyardApiKey(
    requestFor(),
    {
      params: Promise.resolve({ id: "key-1" }),
    },
    {
      requireActor: async () => actor,
      findApiKey: async () => ({ id: "key-1", revokedAt: null }),
      revokeApiKey: async (id) => {
        revokedId = id
      },
    },
  )

  assert.equal(response.status, 200)
  assert.equal(revokedId, "key-1")
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.revoked, true)
  assert.equal(payload.alreadyRevoked, false)
})

test("ship-yard api-keys/:id DELETE is idempotent when key already revoked", async () => {
  const response = await handleDeleteShipyardApiKey(
    requestFor(),
    {
      params: Promise.resolve({ id: "key-1" }),
    },
    {
      requireActor: async () => actor,
      findApiKey: async () => ({ id: "key-1", revokedAt: new Date("2026-02-11T00:00:00.000Z") }),
      revokeApiKey: async () => {
        throw new Error("should not be called")
      },
    },
  )

  assert.equal(response.status, 200)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.revoked, true)
  assert.equal(payload.alreadyRevoked, true)
})

test("ship-yard api-keys/:id DELETE returns 404 when key missing", async () => {
  const response = await handleDeleteShipyardApiKey(
    requestFor(),
    {
      params: Promise.resolve({ id: "missing" }),
    },
    {
      requireActor: async () => actor,
      findApiKey: async () => null,
      revokeApiKey: async () => {},
    },
  )

  assert.equal(response.status, 404)
})

test("ship-yard api-keys/:id DELETE surfaces access control errors", async () => {
  const response = await handleDeleteShipyardApiKey(
    requestFor(),
    {
      params: Promise.resolve({ id: "key-1" }),
    },
    {
      requireActor: async () => {
        throw new AccessControlError("Unauthorized", 401, "UNAUTHORIZED")
      },
      findApiKey: async () => null,
      revokeApiKey: async () => {},
    },
  )

  assert.equal(response.status, 401)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.code, "UNAUTHORIZED")
})

test("ship-yard api-keys/:id DELETE returns actionable error when schema is unavailable", async () => {
  const response = await handleDeleteShipyardApiKey(
    requestFor(),
    {
      params: Promise.resolve({ id: "key-1" }),
    },
    {
      requireActor: async () => actor,
      findApiKey: async () => {
        throw { code: "P2021" }
      },
      revokeApiKey: async () => {},
    },
  )

  assert.equal(response.status, 503)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(typeof payload.error, "string")
  assert.equal(String(payload.error).includes("db:push"), true)
})
