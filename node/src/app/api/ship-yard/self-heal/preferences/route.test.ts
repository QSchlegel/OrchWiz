import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import type { AccessActor } from "@/lib/security/access-control"
import { AccessControlError } from "@/lib/security/access-control"
import {
  SHIPYARD_SELF_HEAL_FEATURE_KEY,
  SHIPYARD_SELF_HEAL_FEATURE_STAGE,
} from "@/lib/shipyard/self-heal/constants"
import { handleGetPreferences, handlePutPreferences } from "./route"

const actor: AccessActor = {
  userId: "user-1",
  email: "user@example.com",
  role: "captain",
  isAdmin: false,
}

test("self-heal preferences GET success includes beta metadata", async () => {
  const response = await handleGetPreferences({
    requireActor: async () => actor,
    defaultCooldownMinutes: () => 30,
  })

  assert.equal(response.status, 200)
  assert.equal(response.headers.get("X-Orchwiz-Feature-Key"), SHIPYARD_SELF_HEAL_FEATURE_KEY)
  assert.equal(response.headers.get("X-Orchwiz-Feature-Stage"), SHIPYARD_SELF_HEAL_FEATURE_STAGE)

  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(typeof payload.preferences, "object")
  assert.deepEqual(payload.feature, {
    key: SHIPYARD_SELF_HEAL_FEATURE_KEY,
    stage: SHIPYARD_SELF_HEAL_FEATURE_STAGE,
  })
})

test("self-heal preferences PUT validation errors include beta metadata", async () => {
  const request = new Request("http://localhost/api/ship-yard/self-heal/preferences", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      enabled: "yes",
    }),
  })

  const response = await handlePutPreferences(request as unknown as NextRequest, {
    requireActor: async () => actor,
    defaultCooldownMinutes: () => 30,
  })

  assert.equal(response.status, 400)
  assert.equal(response.headers.get("X-Orchwiz-Feature-Key"), SHIPYARD_SELF_HEAL_FEATURE_KEY)
  assert.equal(response.headers.get("X-Orchwiz-Feature-Stage"), SHIPYARD_SELF_HEAL_FEATURE_STAGE)

  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.error, "enabled must be a boolean when provided")
  assert.deepEqual(payload.feature, {
    key: SHIPYARD_SELF_HEAL_FEATURE_KEY,
    stage: SHIPYARD_SELF_HEAL_FEATURE_STAGE,
  })
})

test("self-heal preferences unauthorized responses include beta metadata", async () => {
  const response = await handleGetPreferences({
    requireActor: async () => {
      throw new AccessControlError("Unauthorized", 401, "UNAUTHORIZED")
    },
    defaultCooldownMinutes: () => 30,
  })

  assert.equal(response.status, 401)
  assert.equal(response.headers.get("X-Orchwiz-Feature-Key"), SHIPYARD_SELF_HEAL_FEATURE_KEY)
  assert.equal(response.headers.get("X-Orchwiz-Feature-Stage"), SHIPYARD_SELF_HEAL_FEATURE_STAGE)

  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.error, "Unauthorized")
  assert.equal(payload.code, "UNAUTHORIZED")
  assert.deepEqual(payload.feature, {
    key: SHIPYARD_SELF_HEAL_FEATURE_KEY,
    stage: SHIPYARD_SELF_HEAL_FEATURE_STAGE,
  })
})

test("self-heal preferences internal errors include beta metadata", async () => {
  const originalError = console.error
  console.error = () => {}
  try {
    const response = await handleGetPreferences({
      requireActor: async () => {
        throw new Error("db offline")
      },
      defaultCooldownMinutes: () => 30,
    })

    assert.equal(response.status, 500)
    assert.equal(response.headers.get("X-Orchwiz-Feature-Key"), SHIPYARD_SELF_HEAL_FEATURE_KEY)
    assert.equal(response.headers.get("X-Orchwiz-Feature-Stage"), SHIPYARD_SELF_HEAL_FEATURE_STAGE)

    const payload = (await response.json()) as Record<string, unknown>
    assert.equal(payload.error, "Internal server error")
    assert.deepEqual(payload.feature, {
      key: SHIPYARD_SELF_HEAL_FEATURE_KEY,
      stage: SHIPYARD_SELF_HEAL_FEATURE_STAGE,
    })
  } finally {
    console.error = originalError
  }
})
