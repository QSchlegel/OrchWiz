import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import type { AccessActor } from "@/lib/security/access-control"
import { AccessControlError } from "@/lib/security/access-control"
import {
  SHIPYARD_SELF_HEAL_FEATURE_KEY,
  SHIPYARD_SELF_HEAL_FEATURE_STAGE,
} from "@/lib/shipyard/self-heal/constants"
import { handleGetRun, handlePostRun } from "./route"

const actor: AccessActor = {
  userId: "user-1",
  email: "user@example.com",
  role: "captain",
  isAdmin: false,
}

test("self-heal run GET success includes beta metadata", async () => {
  const response = await handleGetRun({
    requireActor: async () => actor,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    createRunId: () => "run-1",
  })

  assert.equal(response.status, 200)
  assert.equal(response.headers.get("X-Orchwiz-Feature-Key"), SHIPYARD_SELF_HEAL_FEATURE_KEY)
  assert.equal(response.headers.get("X-Orchwiz-Feature-Stage"), SHIPYARD_SELF_HEAL_FEATURE_STAGE)

  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.status, "idle")
  assert.deepEqual(payload.feature, {
    key: SHIPYARD_SELF_HEAL_FEATURE_KEY,
    stage: SHIPYARD_SELF_HEAL_FEATURE_STAGE,
  })
})

test("self-heal run POST validation errors include beta metadata", async () => {
  const request = new Request("http://localhost/api/ship-yard/self-heal/run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      maxDeployments: 0,
    }),
  })

  const response = await handlePostRun(request as unknown as NextRequest, {
    requireActor: async () => actor,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    createRunId: () => "run-2",
  })

  assert.equal(response.status, 400)
  assert.equal(response.headers.get("X-Orchwiz-Feature-Key"), SHIPYARD_SELF_HEAL_FEATURE_KEY)
  assert.equal(response.headers.get("X-Orchwiz-Feature-Stage"), SHIPYARD_SELF_HEAL_FEATURE_STAGE)

  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.error, "maxDeployments must be between 1 and 100")
  assert.deepEqual(payload.feature, {
    key: SHIPYARD_SELF_HEAL_FEATURE_KEY,
    stage: SHIPYARD_SELF_HEAL_FEATURE_STAGE,
  })
})

test("self-heal run unauthorized responses include beta metadata", async () => {
  const response = await handleGetRun({
    requireActor: async () => {
      throw new AccessControlError("Unauthorized", 401, "UNAUTHORIZED")
    },
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    createRunId: () => "run-3",
  })

  assert.equal(response.status, 401)
  assert.equal(response.headers.get("X-Orchwiz-Feature-Key"), SHIPYARD_SELF_HEAL_FEATURE_KEY)
  assert.equal(response.headers.get("X-Orchwiz-Feature-Stage"), SHIPYARD_SELF_HEAL_FEATURE_STAGE)

  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.error, "Unauthorized")
  assert.deepEqual(payload.feature, {
    key: SHIPYARD_SELF_HEAL_FEATURE_KEY,
    stage: SHIPYARD_SELF_HEAL_FEATURE_STAGE,
  })
})

test("self-heal run internal errors include beta metadata", async () => {
  const originalError = console.error
  console.error = () => {}
  try {
    const response = await handleGetRun({
      requireActor: async () => {
        throw new Error("unexpected")
      },
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      createRunId: () => "run-4",
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
