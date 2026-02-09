import test from "node:test"
import assert from "node:assert/strict"
import {
  DEFAULT_SUBAGENT_SETTINGS,
  mergeSubagentSettings,
  normalizeSubagentSettings,
} from "./settings"

test("normalizeSubagentSettings returns defaults for invalid payload", () => {
  const normalized = normalizeSubagentSettings({ memory: { maxEntries: -2 } })

  assert.deepEqual(normalized, DEFAULT_SUBAGENT_SETTINGS)
})

test("mergeSubagentSettings applies partial patch over defaults", () => {
  const merged = mergeSubagentSettings(DEFAULT_SUBAGENT_SETTINGS, {
    workspace: {
      workingDirectory: "node",
      includePaths: ["src/**"],
    },
    memory: {
      mode: "rolling",
      maxEntries: 120,
    },
  })

  assert.equal(merged.workspace.workingDirectory, "node")
  assert.deepEqual(merged.workspace.includePaths, ["src/**"])
  assert.equal(merged.memory.mode, "rolling")
  assert.equal(merged.memory.maxEntries, 120)
  assert.equal(merged.memory.summaryStyle, "concise")
  assert.equal(merged.orchestration.handoffEnabled, true)
})
