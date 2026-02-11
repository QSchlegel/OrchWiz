import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { AccessControlError, type AccessActor } from "@/lib/security/access-control"
import { SHIPYARD_USER_API_KEY_PREFIX } from "@/lib/shipyard/user-api-keys"
import {
  handleGetShipyardApiKeys,
  handlePostShipyardApiKeys,
} from "./route"

const actor: AccessActor = {
  userId: "user-1",
  email: "captain@example.com",
  role: "captain",
  isAdmin: false,
}

function requestFor(body: Record<string, unknown>): NextRequest {
  return new Request("http://localhost/api/ship-yard/api-keys", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

test("ship-yard api-keys GET lists metadata only", async () => {
  const response = await handleGetShipyardApiKeys({
    requireActor: async () => actor,
    listApiKeys: async () => [
      {
        id: "key-1",
        name: "CI Agent",
        keyId: "kid-1",
        keyHash: "1234567890abcdef1234567890abcdef",
        createdAt: new Date("2026-02-11T00:00:00.000Z"),
        updatedAt: new Date("2026-02-11T00:10:00.000Z"),
        lastUsedAt: null,
        revokedAt: null,
      },
    ],
    createApiKey: async () => {
      throw new Error("unreachable")
    },
  })

  assert.equal(response.status, 200)
  const payload = (await response.json()) as { keys: Array<Record<string, unknown>> }
  assert.equal(payload.keys.length, 1)
  assert.equal(payload.keys[0].id, "key-1")
  assert.equal(typeof payload.keys[0].preview, "string")
  assert.equal(typeof payload.keys[0].fingerprint, "string")
  assert.equal(Object.prototype.hasOwnProperty.call(payload.keys[0], "plaintextKey"), false)
})

test("ship-yard api-keys POST creates key and returns one-time plaintext", async () => {
  const response = await handlePostShipyardApiKeys(
    requestFor({ name: "Build Agent" }),
    {
      requireActor: async () => actor,
      listApiKeys: async () => [],
      createApiKey: async ({ userId, name, keyId, keyHash }) => ({
        id: "key-1",
        name,
        keyId,
        keyHash,
        createdAt: new Date("2026-02-11T00:00:00.000Z"),
        updatedAt: new Date("2026-02-11T00:00:00.000Z"),
        lastUsedAt: null,
        revokedAt: null,
      }),
    },
  )

  assert.equal(response.status, 201)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(typeof payload.plaintextKey, "string")
  assert.equal(String(payload.plaintextKey).startsWith(`${SHIPYARD_USER_API_KEY_PREFIX}.`), true)

  const key = payload.key as Record<string, unknown>
  assert.equal(key.name, "Build Agent")
  assert.equal(key.status, "active")
  assert.equal(typeof key.preview, "string")
})

test("ship-yard api-keys routes surface access control errors", async () => {
  const response = await handleGetShipyardApiKeys({
    requireActor: async () => {
      throw new AccessControlError("Unauthorized", 401, "UNAUTHORIZED")
    },
    listApiKeys: async () => [],
    createApiKey: async () => {
      throw new Error("unreachable")
    },
  })

  assert.equal(response.status, 401)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.code, "UNAUTHORIZED")
})

test("ship-yard api-keys GET returns actionable error when schema is unavailable", async () => {
  const response = await handleGetShipyardApiKeys({
    requireActor: async () => actor,
    listApiKeys: async () => {
      throw { code: "P2021" }
    },
    createApiKey: async () => {
      throw new Error("unreachable")
    },
  })

  assert.equal(response.status, 503)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(typeof payload.error, "string")
  assert.equal(String(payload.error).includes("db:push"), true)
})

test("ship-yard api-keys POST returns actionable error when schema is unavailable", async () => {
  const response = await handlePostShipyardApiKeys(
    requestFor({ name: "Build Agent" }),
    {
      requireActor: async () => actor,
      listApiKeys: async () => [],
      createApiKey: async () => {
        throw { code: "P2021" }
      },
    },
  )

  assert.equal(response.status, 503)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(typeof payload.error, "string")
  assert.equal(String(payload.error).includes("db:push"), true)
})
