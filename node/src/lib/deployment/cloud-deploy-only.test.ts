import test from "node:test"
import assert from "node:assert/strict"
import { isCloudDeployOnlyEnabled, parseBooleanEnvFlag } from "./cloud-deploy-only"

test("parseBooleanEnvFlag only enables explicit true value", () => {
  assert.equal(parseBooleanEnvFlag(undefined), false)
  assert.equal(parseBooleanEnvFlag(""), false)
  assert.equal(parseBooleanEnvFlag("false"), false)
  assert.equal(parseBooleanEnvFlag("1"), false)
  assert.equal(parseBooleanEnvFlag("true"), true)
  assert.equal(parseBooleanEnvFlag(" TRUE "), true)
})

test("isCloudDeployOnlyEnabled reads CLOUD_DEPLOY_ONLY from env", () => {
  assert.equal(isCloudDeployOnlyEnabled({ CLOUD_DEPLOY_ONLY: "true" } as NodeJS.ProcessEnv), true)
  assert.equal(isCloudDeployOnlyEnabled({ CLOUD_DEPLOY_ONLY: "false" } as NodeJS.ProcessEnv), false)
  assert.equal(isCloudDeployOnlyEnabled({} as NodeJS.ProcessEnv), false)
})
