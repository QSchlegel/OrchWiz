import test from "node:test"
import assert from "node:assert/strict"
import { scoreMotionSample } from "./scoring"

test("scoreMotionSample blocks when input embedding similarity is below strict threshold", () => {
  const baseline = {
    sampleCount: 10,
    promptCharsMean: 100,
    promptCharsM2: 900,
    promptCharsCount: 10,
    outputCharsMean: 100,
    outputCharsM2: 900,
    outputCharsCount: 10,
    durationMsMean: 100,
    durationMsM2: 900,
    durationMsCount: 10,
    inputCentroid: [1, 0],
    inputSimMean: 0.9,
    inputSimM2: 0.0009,
    inputSimCount: 10,
    outputCentroid: [1, 0],
    outputSimMean: 0.9,
    outputSimM2: 0.0009,
    outputSimCount: 10,
    toolBindingSlugCounts: { tool_a: 5 },
    skillPolicySlugCounts: { policy_a: 5 },
    shipGrantedToolSlugCounts: { ship_tool_a: 5 },
    commandUsageCounts: { "cmd:1": 3 },
  }

  const result = scoreMotionSample({
    strictness: "strict",
    baselineMinSamples: 10,
    baseline,
    promptChars: 100,
    inputEmbedding: [0.85, Math.sqrt(1 - 0.85 * 0.85)],
    outputEmbedding: undefined,
    toolBindingSlugs: ["tool_a"],
    skillPolicySlugs: ["policy_a"],
    shipGrantedToolSlugs: ["ship_tool_a"],
    commandUsageKeys: ["cmd:1"],
  })

  assert.equal(result.baselineReady, true)
  assert.equal(result.decision, "block")
  assert.ok(result.reasons.some((r) => r.code === "input_embedding_out_of_range"))
})

test("scoreMotionSample warns on z-score threshold and blocks at higher threshold", () => {
  const baseline = {
    sampleCount: 10,
    promptCharsMean: 100,
    promptCharsM2: 900,
    promptCharsCount: 10,
    outputCharsMean: null,
    outputCharsM2: null,
    outputCharsCount: 0,
    durationMsMean: null,
    durationMsM2: null,
    durationMsCount: 0,
    inputCentroid: [1, 0],
    inputSimMean: 0.9,
    inputSimM2: 0.0009,
    inputSimCount: 10,
    outputCentroid: [1, 0],
    outputSimMean: 0.9,
    outputSimM2: 0.0009,
    outputSimCount: 10,
    toolBindingSlugCounts: {},
    skillPolicySlugCounts: {},
    shipGrantedToolSlugCounts: {},
    commandUsageCounts: {},
  }

  const warn = scoreMotionSample({
    strictness: "strict",
    baselineMinSamples: 10,
    baseline,
    promptChars: 130,
    inputEmbedding: [1, 0],
    outputEmbedding: undefined,
  })
  assert.equal(warn.decision, "warn")
  assert.ok(warn.reasons.some((r) => r.code === "promptChars_suspect"))

  const block = scoreMotionSample({
    strictness: "strict",
    baselineMinSamples: 10,
    baseline,
    promptChars: 140,
    inputEmbedding: [1, 0],
    outputEmbedding: undefined,
  })
  assert.equal(block.decision, "block")
  assert.ok(block.reasons.some((r) => r.code === "promptChars_out_of_range"))
})

test("scoreMotionSample blocks on previously unseen tool binding when baseline ready", () => {
  const baseline = {
    sampleCount: 10,
    promptCharsMean: null,
    promptCharsM2: null,
    promptCharsCount: 0,
    outputCharsMean: null,
    outputCharsM2: null,
    outputCharsCount: 0,
    durationMsMean: null,
    durationMsM2: null,
    durationMsCount: 0,
    inputCentroid: [1, 0],
    inputSimMean: 0.9,
    inputSimM2: 0.0009,
    inputSimCount: 10,
    outputCentroid: [1, 0],
    outputSimMean: 0.9,
    outputSimM2: 0.0009,
    outputSimCount: 10,
    toolBindingSlugCounts: { tool_a: 5 },
    skillPolicySlugCounts: {},
    shipGrantedToolSlugCounts: {},
    commandUsageCounts: {},
  }

  const result = scoreMotionSample({
    strictness: "strict",
    baselineMinSamples: 10,
    baseline,
    toolBindingSlugs: ["tool_a", "tool_new"],
    inputEmbedding: [1, 0],
    outputEmbedding: undefined,
  })

  assert.equal(result.decision, "block")
  assert.ok(result.reasons.some((r) => r.code === "toolBindings_unseen"))
})

