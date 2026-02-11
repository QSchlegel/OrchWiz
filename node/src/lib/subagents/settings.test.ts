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
    capabilities: {
      diagnostics: false,
      statusRelay: false,
    },
  })

  assert.equal(merged.workspace.workingDirectory, "node")
  assert.deepEqual(merged.workspace.includePaths, ["src/**"])
  assert.equal(merged.memory.mode, "rolling")
  assert.equal(merged.memory.maxEntries, 120)
  assert.equal(merged.memory.summaryStyle, "concise")
  assert.equal(merged.orchestration.handoffEnabled, true)
  assert.equal(merged.capabilities.preset, "core_maintenance")
  assert.equal(merged.capabilities.diagnostics, false)
  assert.equal(merged.capabilities.microRepairPlanning, true)
  assert.equal(merged.capabilities.statusRelay, false)
  assert.equal(merged.harness.runtimeProfile, "default")
  assert.equal(merged.harness.autoload.context, true)
  assert.equal(merged.harness.applyWhenSubagentPresent, true)
  assert.equal(merged.harness.failureMode, "fail-open")
})

test("normalizeSubagentSettings defaults harness settings when omitted", () => {
  const normalized = normalizeSubagentSettings({
    orchestration: {
      handoffEnabled: false,
      handoffMode: "manual",
      riskChecksEnabled: true,
      outputContractStrict: true,
    },
  })

  assert.equal(normalized.harness.runtimeProfile, "default")
  assert.equal(normalized.harness.autoload.context, true)
  assert.equal(normalized.harness.autoload.tools, true)
  assert.equal(normalized.harness.autoload.skills, true)
  assert.equal(normalized.harness.applyWhenSubagentPresent, true)
  assert.equal(normalized.harness.failureMode, "fail-open")
})

test("normalizeSubagentSettings rejects invalid harness runtime profile", () => {
  const normalized = normalizeSubagentSettings({
    harness: {
      runtimeProfile: "invalid",
    },
  })

  assert.deepEqual(normalized, DEFAULT_SUBAGENT_SETTINGS)
})
