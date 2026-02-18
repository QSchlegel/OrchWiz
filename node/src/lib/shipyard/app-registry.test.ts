import assert from "node:assert/strict"
import test from "node:test"
import {
  defaultShipAppRegistry,
  normalizeShipAppRegistry,
  withSanitizedShipAppRegistryConfig,
} from "./app-registry"

test("defaultShipAppRegistry uses profile defaults", () => {
  const local = defaultShipAppRegistry("local_starship_build")
  assert.equal(local.n8n.enabled, true)
  assert.equal(local.dokploy.enabled, false)
  assert.equal(local.spacebot.enabled, false)
  assert.equal(local.opencode.enabled, false)
  assert.equal(local.codex.enabled, false)
  assert.equal(local["gemini-cli"].enabled, false)
  assert.equal(local["github-copilot"].enabled, false)
  assert.equal(local.amp.enabled, false)
  assert.equal(local["kimi-cli"].enabled, false)
  assert.equal(local.spacebot.stack, "cloudflare-local")
  assert.deepEqual(local.spacebot.agentRuntimes, [])

  const shuttle = defaultShipAppRegistry("lightweight_shuttle")
  assert.equal(shuttle.dokploy.enabled, true)
})

test("normalizeShipAppRegistry supports legacy initialApplications and spacebot", () => {
  const normalized = normalizeShipAppRegistry(
    {
      initialApplications: {
        n8n: false,
        dokploy: true,
      },
      spacebot: {
        enabled: true,
        stack: "dev-local",
        launchRequirement: "require_running",
      },
    },
    "local_starship_build",
  )

  assert.equal(normalized.n8n.enabled, false)
  assert.equal(normalized.dokploy.enabled, true)
  assert.equal(normalized.spacebot.enabled, true)
  assert.equal(normalized.spacebot.stack, "dev-local")
  assert.deepEqual(normalized.spacebot.agentRuntimes, [])
})

test("normalizeShipAppRegistry prefers explicit appRegistry entries over legacy fields", () => {
  const normalized = normalizeShipAppRegistry(
    {
      initialApplications: {
        n8n: false,
        dokploy: false,
      },
      appRegistry: {
        n8n: { enabled: true },
        dokploy: { enabled: true },
        spacebot: { enabled: true },
        codex: { enabled: true },
        "github-copilot": { enabled: true },
      },
      spacebot: {
        enabled: false,
        stack: "cloudflare-local",
        launchRequirement: "require_running",
      },
    },
    "local_starship_build",
  )

  assert.equal(normalized.n8n.enabled, true)
  assert.equal(normalized.dokploy.enabled, true)
  assert.equal(normalized.spacebot.enabled, true)
  assert.equal(normalized.codex.enabled, true)
  assert.equal(normalized["github-copilot"].enabled, true)
  assert.equal(normalized.spacebot.stack, "cloudflare-local")
  assert.deepEqual(normalized.spacebot.agentRuntimes, [])
})

test("withSanitizedShipAppRegistryConfig writes canonical appRegistry and removes legacy keys", () => {
  const sanitized = withSanitizedShipAppRegistryConfig({
    config: {
      infrastructure: {
        namespace: "orchwiz",
      },
      initialApplications: {
        n8n: false,
        dokploy: true,
      },
      spacebot: {
        enabled: true,
        stack: "dev-local",
        launchRequirement: "require_running",
      },
    },
    deploymentProfile: "local_starship_build",
  })

  assert.deepEqual(sanitized, {
    infrastructure: {
      namespace: "orchwiz",
    },
    appRegistry: {
      n8n: {
        id: "n8n",
        enabled: false,
      },
      dokploy: {
        id: "dokploy",
        enabled: true,
      },
      spacebot: {
        id: "spacebot",
        enabled: true,
        stack: "dev-local",
        launchRequirement: "require_running",
        agentRuntimes: [],
      },
      opencode: {
        id: "opencode",
        enabled: false,
      },
      codex: {
        id: "codex",
        enabled: false,
      },
      "gemini-cli": {
        id: "gemini-cli",
        enabled: false,
      },
      "github-copilot": {
        id: "github-copilot",
        enabled: false,
      },
      amp: {
        id: "amp",
        enabled: false,
      },
      "kimi-cli": {
        id: "kimi-cli",
        enabled: false,
      },
    },
  })
})
