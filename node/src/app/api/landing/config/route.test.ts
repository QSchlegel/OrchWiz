import assert from "node:assert/strict"
import test from "node:test"
import { LANDING_XO_FEATURE_KEY } from "@/lib/landing/feature"
import { handleGetConfig } from "./route"

function env(values: Record<string, string>): NodeJS.ProcessEnv {
  return values as unknown as NodeJS.ProcessEnv
}

test("landing config returns enabled false when feature is disabled", async () => {
  const response = await handleGetConfig({
    env: env({
      LANDING_XO_ENABLED: "false",
      LANDING_XO_STAGE: "pilot",
    }),
  })

  assert.equal(response.status, 200)
  assert.equal(response.headers.get("X-Orchwiz-Feature-Key"), LANDING_XO_FEATURE_KEY)
  assert.equal(response.headers.get("X-Orchwiz-Feature-Stage"), "pilot")

  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.enabled, false)
  assert.deepEqual(payload.feature, {
    key: LANDING_XO_FEATURE_KEY,
    stage: "pilot",
  })
})

test("landing config defaults to enabled", async () => {
  const response = await handleGetConfig({
    env: {} as NodeJS.ProcessEnv,
  })

  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.enabled, true)
})
