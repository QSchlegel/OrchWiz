import assert from "node:assert/strict"
import test from "node:test"
import {
  defaultSpacebotLaunchIntent,
  normalizeSpacebotLaunchIntent,
} from "./spacebot-launch-intent"

test("defaultSpacebotLaunchIntent returns disabled cloudflare-local intent", () => {
  assert.deepEqual(defaultSpacebotLaunchIntent(), {
    enabled: false,
    stack: "cloudflare-local",
    launchRequirement: "require_running",
    agentRuntimes: [],
  })
})

test("normalizeSpacebotLaunchIntent accepts valid payload", () => {
  const result = normalizeSpacebotLaunchIntent({
    enabled: true,
    stack: "dev-local",
    launchRequirement: "require_running",
    agentRuntimes: ["opencode", "codex"],
  })

  assert.deepEqual(result, {
    enabled: true,
    stack: "dev-local",
    launchRequirement: "require_running",
    agentRuntimes: ["opencode", "codex"],
  })
})

test("normalizeSpacebotLaunchIntent applies defaults for stack and requirement", () => {
  const result = normalizeSpacebotLaunchIntent({
    enabled: false,
    stack: "not-a-stack",
    launchRequirement: "unknown",
  })

  assert.deepEqual(result, {
    enabled: false,
    stack: "cloudflare-local",
    launchRequirement: "require_running",
    agentRuntimes: [],
  })
})

test("normalizeSpacebotLaunchIntent sanitizes agent runtime selections", () => {
  const result = normalizeSpacebotLaunchIntent({
    enabled: true,
    stack: "dev-local",
    launchRequirement: "require_running",
    agentRuntimes: ["opencode", "KIMI-CLI", "invalid", "opencode", null],
  })

  assert.deepEqual(result, {
    enabled: true,
    stack: "dev-local",
    launchRequirement: "require_running",
    agentRuntimes: ["opencode", "kimi-cli"],
  })
})

test("normalizeSpacebotLaunchIntent returns null when enabled is missing", () => {
  const result = normalizeSpacebotLaunchIntent({
    stack: "cloudflare-local",
  })

  assert.equal(result, null)
})

test("normalizeSpacebotLaunchIntent returns null for non-object payloads", () => {
  assert.equal(normalizeSpacebotLaunchIntent("invalid"), null)
  assert.equal(normalizeSpacebotLaunchIntent(null), null)
})
