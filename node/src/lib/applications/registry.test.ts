import assert from "node:assert/strict"
import test from "node:test"
import {
  defaultAppRegistryEntries,
  parseAppRegistryEntries,
} from "./registry"

const EXPECTED_SYSTEM_APP_IDS = [
  "amp",
  "codex",
  "dokploy",
  "gemini-cli",
  "github-copilot",
  "kimi-cli",
  "n8n",
  "opencode",
  "spacebot",
]

test("defaultAppRegistryEntries seeds system launch apps", () => {
  const entries = defaultAppRegistryEntries()
  const ids = entries.map((entry) => entry.id).sort()

  assert.deepEqual(ids, EXPECTED_SYSTEM_APP_IDS)
  assert.equal(entries.every((entry) => entry.showInLaunchWizard), true)
  assert.equal(entries.every((entry) => entry.system), true)
})

test("parseAppRegistryEntries merges user entries with seeded system entries", () => {
  const parsed = parseAppRegistryEntries(
    JSON.stringify([
      {
        id: "custom-app",
        name: "Custom App",
        applicationType: "docker",
        showInLaunchWizard: true,
      },
      {
        id: "n8n",
        name: "n8n",
        applicationType: "n8n",
        showInLaunchWizard: false,
      },
    ]),
  )

  const custom = parsed.find((entry) => entry.id === "custom-app")
  const n8n = parsed.find((entry) => entry.id === "n8n")
  const dokploy = parsed.find((entry) => entry.id === "dokploy")
  const spacebot = parsed.find((entry) => entry.id === "spacebot")

  assert.ok(custom)
  assert.equal(custom.system, false)
  assert.equal(custom.showInLaunchWizard, true)

  assert.ok(n8n)
  assert.equal(n8n.system, true)
  assert.equal(n8n.showInLaunchWizard, false)

  assert.ok(dokploy)
  assert.equal(dokploy.system, true)

  assert.ok(spacebot)
  assert.equal(spacebot.system, true)
})

test("parseAppRegistryEntries falls back to defaults when input is invalid", () => {
  const parsed = parseAppRegistryEntries("{invalid-json")
  assert.deepEqual(parsed.map((entry) => entry.id).sort(), EXPECTED_SYSTEM_APP_IDS)
})
