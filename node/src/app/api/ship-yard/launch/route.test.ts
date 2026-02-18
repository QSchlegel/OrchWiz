import assert from "node:assert/strict"
import test from "node:test"
import { withSanitizedAppRegistryLaunchConfig } from "./route"

const DISABLED_RUNTIME_REGISTRY_ENTRIES = {
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
} as const

test("withSanitizedAppRegistryLaunchConfig persists valid app registry payload", () => {
  const result = withSanitizedAppRegistryLaunchConfig({
    config: {
      infrastructure: { namespace: "orchwiz" },
      monitoring: { grafanaUrl: "https://grafana.local" },
    },
    deploymentProfile: "local_starship_build",
    rawSpacebot: {
      enabled: true,
      stack: "dev-local",
      launchRequirement: "require_running",
    },
  })

  assert.deepEqual(result, {
    infrastructure: { namespace: "orchwiz" },
    monitoring: { grafanaUrl: "https://grafana.local" },
    appRegistry: {
      n8n: {
        id: "n8n",
        enabled: true,
      },
      dokploy: {
        id: "dokploy",
        enabled: false,
      },
      spacebot: {
        id: "spacebot",
        enabled: true,
        stack: "dev-local",
        launchRequirement: "require_running",
        agentRuntimes: [],
      },
      ...DISABLED_RUNTIME_REGISTRY_ENTRIES,
    },
  })
})

test("withSanitizedAppRegistryLaunchConfig sanitizes optional agent runtimes", () => {
  const result = withSanitizedAppRegistryLaunchConfig({
    config: {
      infrastructure: { namespace: "orchwiz" },
    },
    deploymentProfile: "local_starship_build",
    rawSpacebot: {
      enabled: true,
      stack: "dev-local",
      launchRequirement: "require_running",
      agentRuntimes: ["opencode", "KIMI-CLI", "invalid", "opencode", null],
    },
  })

  assert.deepEqual(result.appRegistry, {
    n8n: {
      id: "n8n",
      enabled: true,
    },
    dokploy: {
      id: "dokploy",
      enabled: false,
    },
    spacebot: {
      id: "spacebot",
      enabled: true,
      stack: "dev-local",
      launchRequirement: "require_running",
      agentRuntimes: ["opencode", "kimi-cli"],
    },
    ...DISABLED_RUNTIME_REGISTRY_ENTRIES,
  })
})

test("withSanitizedAppRegistryLaunchConfig upgrades legacy initialApplications and spacebot", () => {
  const result = withSanitizedAppRegistryLaunchConfig({
    config: {
      infrastructure: { namespace: "orchwiz" },
      initialApplications: { n8n: false, dokploy: true },
      spacebot: {
        enabled: true,
        stack: "dev-local",
        launchRequirement: "require_running",
      },
    },
    deploymentProfile: "local_starship_build",
  })

  assert.deepEqual(result, {
    infrastructure: { namespace: "orchwiz" },
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
      ...DISABLED_RUNTIME_REGISTRY_ENTRIES,
    },
  })
})

test("withSanitizedAppRegistryLaunchConfig falls back to defaults when payload is invalid", () => {
  const result = withSanitizedAppRegistryLaunchConfig({
    config: {
      infrastructure: { namespace: "orchwiz" },
      initialApplications: { n8n: false },
      spacebot: {
        enabled: "yes",
        stack: "unknown",
      },
    },
    deploymentProfile: "local_starship_build",
    rawAppRegistry: {
      spacebot: {
        enabled: "yes",
        stack: "unknown",
      },
    },
  })

  assert.deepEqual(result, {
    infrastructure: { namespace: "orchwiz" },
    appRegistry: {
      n8n: {
        id: "n8n",
        enabled: false,
      },
      dokploy: {
        id: "dokploy",
        enabled: false,
      },
      spacebot: {
        id: "spacebot",
        enabled: false,
        stack: "cloudflare-local",
        launchRequirement: "require_running",
        agentRuntimes: [],
      },
      ...DISABLED_RUNTIME_REGISTRY_ENTRIES,
    },
  })
})
