import assert from "node:assert/strict"
import test from "node:test"
import {
  LANDING_XO_DEFAULT_STAGE,
  LANDING_XO_FEATURE_KEY,
  isLandingXoEnabled,
  landingXoFeatureMetadata,
} from "./feature"

function env(values: Record<string, string>): NodeJS.ProcessEnv {
  return values as unknown as NodeJS.ProcessEnv
}

test("isLandingXoEnabled defaults to true", () => {
  assert.equal(isLandingXoEnabled({} as NodeJS.ProcessEnv), true)
})

test("isLandingXoEnabled respects explicit disable values", () => {
  assert.equal(isLandingXoEnabled(env({ LANDING_XO_ENABLED: "false" })), false)
  assert.equal(isLandingXoEnabled(env({ LANDING_XO_ENABLED: "0" })), false)
  assert.equal(isLandingXoEnabled(env({ LANDING_XO_ENABLED: "no" })), false)
})

test("landingXoFeatureMetadata uses defaults and override stage", () => {
  assert.deepEqual(landingXoFeatureMetadata({} as NodeJS.ProcessEnv), {
    key: LANDING_XO_FEATURE_KEY,
    stage: LANDING_XO_DEFAULT_STAGE,
  })
  assert.deepEqual(
    landingXoFeatureMetadata(env({ LANDING_XO_STAGE: "pilot" })),
    {
      key: LANDING_XO_FEATURE_KEY,
      stage: "pilot",
    },
  )
})
