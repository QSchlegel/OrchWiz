import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { handlePostNightly } from "./route"

function requestWithAuth(token?: string): NextRequest {
  const headers = new Headers()
  if (token) {
    headers.set("authorization", `Bearer ${token}`)
  }

  return {
    headers,
    nextUrl: new URL("http://localhost:3000/api/runtime/intelligence/nightly"),
  } as unknown as NextRequest
}

test("handlePostNightly returns 503 when cron token is not configured", async () => {
  const response = await handlePostNightly(requestWithAuth(), {
    expectedToken: () => null,
    now: () => new Date("2026-02-11T00:00:00.000Z"),
    runConsolidation: async () => ({
      checked: 0,
      updated: 0,
      failed: 0,
      executedAt: "2026-02-11T00:00:00.000Z",
    }),
  })

  assert.equal(response.status, 503)
})

test("handlePostNightly returns 401 on invalid bearer token", async () => {
  const response = await handlePostNightly(requestWithAuth("wrong-token"), {
    expectedToken: () => "nightly-token",
    now: () => new Date("2026-02-11T00:00:00.000Z"),
    runConsolidation: async () => ({
      checked: 0,
      updated: 0,
      failed: 0,
      executedAt: "2026-02-11T00:00:00.000Z",
    }),
  })

  assert.equal(response.status, 401)
})

test("handlePostNightly runs consolidation with valid bearer token", async () => {
  let called = false

  const response = await handlePostNightly(requestWithAuth("nightly-token"), {
    expectedToken: () => "nightly-token",
    now: () => new Date("2026-02-11T00:00:00.000Z"),
    runConsolidation: async () => {
      called = true
      return {
        checked: 3,
        updated: 3,
        failed: 0,
        executedAt: "2026-02-11T00:00:00.000Z",
      }
    },
  })

  assert.equal(response.status, 200)
  assert.equal(called, true)
  const payload = await response.json()
  assert.equal(payload.checked, 3)
  assert.equal(payload.updated, 3)
})
