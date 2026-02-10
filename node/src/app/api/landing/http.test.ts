import assert from "node:assert/strict"
import test from "node:test"
import { NextResponse } from "next/server"
import { LANDING_XO_FEATURE_KEY } from "@/lib/landing/feature"
import { landingErrorJson, landingJson } from "./http"

function env(values: Record<string, string>): NodeJS.ProcessEnv {
  return values as unknown as NodeJS.ProcessEnv
}

test("landingJson appends feature metadata and headers", async () => {
  const response = landingJson(
    { ok: true },
    200,
    env({
      LANDING_XO_STAGE: "pilot",
    }),
  )

  assert.equal(response.headers.get("X-Orchwiz-Feature-Key"), LANDING_XO_FEATURE_KEY)
  assert.equal(response.headers.get("X-Orchwiz-Feature-Stage"), "pilot")
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.ok, true)
  assert.deepEqual(payload.feature, {
    key: LANDING_XO_FEATURE_KEY,
    stage: "pilot",
  })
})

test("landingErrorJson preserves status and metadata", async () => {
  const response = landingErrorJson("disabled", 503, { code: "LANDING_XO_DISABLED" })
  assert.equal(response.status, 503)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.error, "disabled")
  assert.equal(payload.code, "LANDING_XO_DISABLED")
})

test("plain next responses are unchanged", async () => {
  const response = NextResponse.json({ ok: true })
  assert.equal(response.headers.get("X-Orchwiz-Feature-Key"), null)
})
