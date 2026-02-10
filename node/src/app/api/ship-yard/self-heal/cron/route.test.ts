import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import {
  SHIPYARD_SELF_HEAL_FEATURE_KEY,
  SHIPYARD_SELF_HEAL_FEATURE_STAGE,
} from "@/lib/shipyard/self-heal/constants"
import { handlePostCron } from "./route"

function requestWithAuth(token?: string): NextRequest {
  return new Request("http://localhost/api/ship-yard/self-heal/cron", {
    method: "POST",
    headers: token
      ? {
          authorization: `Bearer ${token}`,
        }
      : {},
  }) as unknown as NextRequest
}

test("self-heal cron returns 503 with beta metadata when token is unconfigured", async () => {
  const response = await handlePostCron(requestWithAuth(), {
    expectedToken: () => null,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  })

  assert.equal(response.status, 503)
  assert.equal(response.headers.get("X-Orchwiz-Feature-Key"), SHIPYARD_SELF_HEAL_FEATURE_KEY)
  assert.equal(response.headers.get("X-Orchwiz-Feature-Stage"), SHIPYARD_SELF_HEAL_FEATURE_STAGE)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.error, "SHIPYARD_SELF_HEAL_CRON_TOKEN is not configured")
})

test("self-heal cron returns 401 with beta metadata for invalid tokens", async () => {
  const response = await handlePostCron(requestWithAuth("wrong"), {
    expectedToken: () => "expected",
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  })

  assert.equal(response.status, 401)
  assert.equal(response.headers.get("X-Orchwiz-Feature-Key"), SHIPYARD_SELF_HEAL_FEATURE_KEY)
  assert.equal(response.headers.get("X-Orchwiz-Feature-Stage"), SHIPYARD_SELF_HEAL_FEATURE_STAGE)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.error, "Unauthorized")
})

test("self-heal cron success includes beta metadata", async () => {
  const response = await handlePostCron(requestWithAuth("expected"), {
    expectedToken: () => "expected",
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  })

  assert.equal(response.status, 202)
  assert.equal(response.headers.get("X-Orchwiz-Feature-Key"), SHIPYARD_SELF_HEAL_FEATURE_KEY)
  assert.equal(response.headers.get("X-Orchwiz-Feature-Stage"), SHIPYARD_SELF_HEAL_FEATURE_STAGE)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.executed, false)
  assert.equal(payload.trigger, "cron")
  assert.equal(payload.executedAt, "2026-01-01T00:00:00.000Z")
})

test("self-heal cron internal errors include beta metadata", async () => {
  const originalError = console.error
  console.error = () => {}
  try {
    const response = await handlePostCron(requestWithAuth("expected"), {
      expectedToken: () => {
        throw new Error("boom")
      },
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    })

    assert.equal(response.status, 500)
    assert.equal(response.headers.get("X-Orchwiz-Feature-Key"), SHIPYARD_SELF_HEAL_FEATURE_KEY)
    assert.equal(response.headers.get("X-Orchwiz-Feature-Stage"), SHIPYARD_SELF_HEAL_FEATURE_STAGE)
    const payload = (await response.json()) as Record<string, unknown>
    assert.equal(payload.error, "Internal server error")
  } finally {
    console.error = originalError
  }
})
