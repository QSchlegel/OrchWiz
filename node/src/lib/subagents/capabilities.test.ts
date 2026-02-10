import test from "node:test"
import assert from "node:assert/strict"
import {
  DEFAULT_EXOCOMP_CAPABILITIES,
  buildExocompCapabilityInstructionBlock,
  normalizeExocompCapabilities,
} from "./capabilities"

test("normalizeExocompCapabilities falls back to core maintenance defaults", () => {
  const normalized = normalizeExocompCapabilities({
    preset: "unknown",
    diagnostics: "yes",
  })

  assert.deepEqual(normalized, DEFAULT_EXOCOMP_CAPABILITIES)
})

test("buildExocompCapabilityInstructionBlock emits deterministic enabled-ability order", () => {
  const block = buildExocompCapabilityInstructionBlock({
    preset: "core_maintenance",
    diagnostics: true,
    microRepairPlanning: false,
    hazardChecks: true,
    safeShutdownGuidance: false,
    statusRelay: true,
  })

  assert.match(block, /^Exocomp abilities \(system constraints\):/)

  const lines = block.split("\n")
  assert.equal(lines[1], "- Preset: core_maintenance.")
  assert.equal(
    lines[2],
    "- Run concise system diagnostics first and report concrete health signals.",
  )
  assert.equal(
    lines[3],
    "- Perform hazard checks before action; call out thermal, power, and stability risks.",
  )
  assert.equal(
    lines[4],
    "- Relay status in short operator-ready updates with owner, next action, and risk state.",
  )
})

test("buildExocompCapabilityInstructionBlock handles zero enabled abilities", () => {
  const block = buildExocompCapabilityInstructionBlock({
    diagnostics: false,
    microRepairPlanning: false,
    hazardChecks: false,
    safeShutdownGuidance: false,
    statusRelay: false,
  })

  assert.match(block, /No active exocomp abilities/)
})
