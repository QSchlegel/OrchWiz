import type { MotionDecision, MotionStrictness } from "@prisma/client"
import {
  cosineSimilarity,
  parseCountMap,
  welfordFromBaseline,
  welfordZScore,
  type WelfordState,
} from "./stats"

export interface MotionReason {
  code: string
  message: string
  details?: Record<string, unknown>
}

export interface MotionBaselineSnapshot {
  sampleCount: number

  promptCharsMean: number | null
  promptCharsM2: number | null
  promptCharsCount: number

  outputCharsMean: number | null
  outputCharsM2: number | null
  outputCharsCount: number

  durationMsMean: number | null
  durationMsM2: number | null
  durationMsCount: number

  inputCentroid: unknown
  inputSimMean: number | null
  inputSimM2: number | null
  inputSimCount: number

  outputCentroid: unknown
  outputSimMean: number | null
  outputSimM2: number | null
  outputSimCount: number

  toolBindingSlugCounts: unknown
  skillPolicySlugCounts: unknown
  shipGrantedToolSlugCounts: unknown
  commandUsageCounts: unknown
}

export interface MotionSampleFeatures {
  strictness: MotionStrictness
  baselineMinSamples: number
  baseline: MotionBaselineSnapshot | null

  promptChars?: number | null
  outputChars?: number | null
  durationMs?: number | null

  inputEmbedding?: number[] | null
  outputEmbedding?: number[] | null

  toolBindingSlugs?: string[] | null
  skillPolicySlugs?: string[] | null
  shipGrantedToolSlugs?: string[] | null
  commandUsageKeys?: string[] | null
}

export interface MotionScoreResult {
  decision: MotionDecision
  baselineReady: boolean
  reasons: MotionReason[]
  inputSimilarity: number | null
  outputSimilarity: number | null
  zScores: {
    promptChars: number | null
    outputChars: number | null
    durationMs: number | null
  }
}

function baselineReady(args: { baseline: MotionBaselineSnapshot | null; baselineMinSamples: number }): boolean {
  if (!args.baseline) return false
  const min = Math.max(1, Math.trunc(args.baselineMinSamples))
  return (args.baseline.sampleCount ?? 0) >= min
}

function clampMin(value: number, min: number): number {
  return value < min ? min : value
}

function strictEmbeddingThresholds(args: { mean: number; std: number }): { warn: number; block: number } {
  const block = clampMin(args.mean - 4 * args.std, 0.78)
  const warn = clampMin(args.mean - 3 * args.std, 0.82)
  return { warn, block }
}

function strictZThresholds(): { warn: number; block: number } {
  return { warn: 3, block: 4 }
}

function unseenKeys(keys: string[], baselineCounts: Record<string, number>): string[] {
  const unseen: string[] = []
  for (const key of keys) {
    const trimmed = key.trim()
    if (!trimmed) continue
    if (baselineCounts[trimmed] === undefined) {
      unseen.push(trimmed)
    }
  }
  unseen.sort((a, b) => a.localeCompare(b))
  return unseen
}

function toWelford(state: MotionBaselineSnapshot | null, kind: "prompt" | "output" | "duration"): WelfordState | null {
  if (!state) return null
  if (kind === "prompt") {
    return welfordFromBaseline({
      mean: state.promptCharsMean,
      m2: state.promptCharsM2,
      count: state.promptCharsCount,
    })
  }
  if (kind === "output") {
    return welfordFromBaseline({
      mean: state.outputCharsMean,
      m2: state.outputCharsM2,
      count: state.outputCharsCount,
    })
  }
  return welfordFromBaseline({
    mean: state.durationMsMean,
    m2: state.durationMsM2,
    count: state.durationMsCount,
  })
}

function evaluateEmbeddingAnomaly(args: {
  label: "input" | "output"
  strictness: MotionStrictness
  baselineReady: boolean
  embedding: number[] | null | undefined
  centroid: unknown
  simMean: number | null
  simM2: number | null
  simCount: number
}): { decision: MotionDecision; reason?: MotionReason; similarity: number | null } {
  if (args.embedding === undefined) {
    return {
      decision: "allow",
      similarity: null,
    }
  }

  if (args.embedding === null) {
    return {
      decision: args.baselineReady ? "warn" : "warn",
      reason: {
        code: `${args.label}_embedding_unavailable`,
        message: `${args.label} embedding is unavailable; fail-open.`,
      },
      similarity: null,
    }
  }

  const centroidVector = Array.isArray(args.centroid) ? (args.centroid as number[]) : null
  if (!centroidVector || centroidVector.length === 0) {
    return {
      decision: "warn",
      reason: {
        code: `${args.label}_baseline_missing_centroid`,
        message: `${args.label} embedding baseline centroid is missing; fail-open.`,
      },
      similarity: null,
    }
  }

  const sim = cosineSimilarity(args.embedding, centroidVector)
  if (sim === null || !Number.isFinite(sim)) {
    return {
      decision: "warn",
      reason: {
        code: `${args.label}_baseline_vector_mismatch`,
        message: `${args.label} embedding vector could not be compared to centroid; fail-open.`,
      },
      similarity: null,
    }
  }

  if (!args.baselineReady) {
    return {
      decision: "warn",
      reason: {
        code: `${args.label}_baseline_not_ready`,
        message: `${args.label} embedding baseline is not ready; fail-open.`,
        details: {
          similarity: sim,
        },
      },
      similarity: sim,
    }
  }

  if (
    typeof args.simMean !== "number" ||
    !Number.isFinite(args.simMean) ||
    typeof args.simM2 !== "number" ||
    !Number.isFinite(args.simM2) ||
    typeof args.simCount !== "number" ||
    !Number.isFinite(args.simCount) ||
    args.simCount < 2
  ) {
    return {
      decision: "warn",
      reason: {
        code: `${args.label}_baseline_stats_missing`,
        message: `${args.label} embedding baseline similarity stats are missing; fail-open.`,
        details: {
          similarity: sim,
        },
      },
      similarity: sim,
    }
  }

  const denom = Math.max(1, Math.trunc(args.simCount) - 1)
  const variance = args.simM2 / denom
  const std = variance > 0 ? Math.sqrt(variance) : 0

  if (args.strictness !== "strict") {
    // Currently strict only; treat other modes as warn-only.
    return {
      decision: "warn",
      reason: {
        code: `${args.label}_embedding_scoring_unimplemented`,
        message: `Embedding scoring for strictness=${args.strictness} is not implemented; fail-open.`,
        details: { similarity: sim },
      },
      similarity: sim,
    }
  }

  const thresholds = strictEmbeddingThresholds({ mean: args.simMean, std })
  if (sim < thresholds.block) {
    return {
      decision: "block",
      reason: {
        code: `${args.label}_embedding_out_of_range`,
        message: `${args.label} embedding similarity below block threshold.`,
        details: {
          similarity: sim,
          mean: args.simMean,
          std,
          threshold: thresholds.block,
        },
      },
      similarity: sim,
    }
  }

  if (sim < thresholds.warn) {
    return {
      decision: "warn",
      reason: {
        code: `${args.label}_embedding_suspect`,
        message: `${args.label} embedding similarity below warn threshold.`,
        details: {
          similarity: sim,
          mean: args.simMean,
          std,
          threshold: thresholds.warn,
        },
      },
      similarity: sim,
    }
  }

  return {
    decision: "allow",
    similarity: sim,
  }
}

function evaluateUnseenSetRule(args: {
  label: string
  strictness: MotionStrictness
  baselineReady: boolean
  keys: string[] | null | undefined
  baselineCounts: unknown
}): { decision: MotionDecision; reason?: MotionReason } {
  const keys = args.keys || []
  if (keys.length === 0) {
    return { decision: "allow" }
  }

  const counts = parseCountMap(args.baselineCounts)
  if (Object.keys(counts).length === 0) {
    return {
      decision: "warn",
      reason: {
        code: `${args.label}_baseline_missing`,
        message: `${args.label} baseline counts missing; fail-open.`,
      },
    }
  }

  if (!args.baselineReady) {
    return {
      decision: "warn",
      reason: {
        code: `${args.label}_baseline_not_ready`,
        message: `${args.label} baseline is not ready; fail-open.`,
      },
    }
  }

  if (args.strictness !== "strict") {
    return {
      decision: "warn",
      reason: {
        code: `${args.label}_scoring_unimplemented`,
        message: `Set anomaly scoring for strictness=${args.strictness} is not implemented; fail-open.`,
      },
    }
  }

  const unseen = unseenKeys(keys, counts)
  if (unseen.length === 0) {
    return { decision: "allow" }
  }

  return {
    decision: "block",
    reason: {
      code: `${args.label}_unseen`,
      message: `${args.label} contains previously unseen values in baseline.`,
      details: {
        unseen,
      },
    },
  }
}

function evaluateNumericRule(args: {
  label: string
  strictness: MotionStrictness
  baselineReady: boolean
  value: number | null | undefined
  state: WelfordState | null
}): { decision: MotionDecision; reason?: MotionReason; z: number | null } {
  const value = typeof args.value === "number" && Number.isFinite(args.value) ? args.value : null
  if (value === null) {
    return { decision: "allow", z: null }
  }

  if (!args.baselineReady) {
    return {
      decision: "warn",
      reason: {
        code: `${args.label}_baseline_not_ready`,
        message: `${args.label} baseline not ready; fail-open.`,
      },
      z: null,
    }
  }

  const z = welfordZScore(args.state, value)
  if (z === null) {
    return {
      decision: "warn",
      reason: {
        code: `${args.label}_baseline_stats_missing`,
        message: `${args.label} baseline stats missing; fail-open.`,
      },
      z: null,
    }
  }

  if (args.strictness !== "strict") {
    return {
      decision: "warn",
      reason: {
        code: `${args.label}_scoring_unimplemented`,
        message: `Numeric scoring for strictness=${args.strictness} is not implemented; fail-open.`,
        details: { z },
      },
      z,
    }
  }

  const thresholds = strictZThresholds()
  const abs = Math.abs(z)
  if (abs >= thresholds.block) {
    return {
      decision: "block",
      reason: {
        code: `${args.label}_out_of_range`,
        message: `${args.label} z-score above block threshold.`,
        details: { z },
      },
      z,
    }
  }

  if (abs >= thresholds.warn) {
    return {
      decision: "warn",
      reason: {
        code: `${args.label}_suspect`,
        message: `${args.label} z-score above warn threshold.`,
        details: { z },
      },
      z,
    }
  }

  return { decision: "allow", z }
}

function combine(decisions: MotionDecision[]): MotionDecision {
  if (decisions.includes("block")) return "block"
  if (decisions.includes("warn")) return "warn"
  return "allow"
}

export function scoreMotionSample(features: MotionSampleFeatures): MotionScoreResult {
  const minSamples = Math.max(1, Math.trunc(features.baselineMinSamples))
  const ready = baselineReady({ baseline: features.baseline, baselineMinSamples: minSamples })

  const reasons: MotionReason[] = []
  const decisions: MotionDecision[] = []

  const promptState = toWelford(features.baseline, "prompt")
  const outputState = toWelford(features.baseline, "output")
  const durationState = toWelford(features.baseline, "duration")

  const promptEval = evaluateNumericRule({
    label: "promptChars",
    strictness: features.strictness,
    baselineReady: ready,
    value: features.promptChars,
    state: promptState,
  })
  if (promptEval.reason) reasons.push(promptEval.reason)
  decisions.push(promptEval.decision)

  const outputEval = evaluateNumericRule({
    label: "outputChars",
    strictness: features.strictness,
    baselineReady: ready,
    value: features.outputChars,
    state: outputState,
  })
  if (outputEval.reason) reasons.push(outputEval.reason)
  decisions.push(outputEval.decision)

  const durationEval = evaluateNumericRule({
    label: "durationMs",
    strictness: features.strictness,
    baselineReady: ready,
    value: features.durationMs,
    state: durationState,
  })
  if (durationEval.reason) reasons.push(durationEval.reason)
  decisions.push(durationEval.decision)

  const inputEval = evaluateEmbeddingAnomaly({
    label: "input",
    strictness: features.strictness,
    baselineReady: ready,
    embedding: features.inputEmbedding,
    centroid: features.baseline?.inputCentroid,
    simMean: features.baseline?.inputSimMean ?? null,
    simM2: features.baseline?.inputSimM2 ?? null,
    simCount: features.baseline?.inputSimCount ?? 0,
  })
  if (inputEval.reason) reasons.push(inputEval.reason)
  decisions.push(inputEval.decision)

  const outputEmbeddingEval = evaluateEmbeddingAnomaly({
    label: "output",
    strictness: features.strictness,
    baselineReady: ready,
    embedding: features.outputEmbedding,
    centroid: features.baseline?.outputCentroid,
    simMean: features.baseline?.outputSimMean ?? null,
    simM2: features.baseline?.outputSimM2 ?? null,
    simCount: features.baseline?.outputSimCount ?? 0,
  })
  if (outputEmbeddingEval.reason) reasons.push(outputEmbeddingEval.reason)
  decisions.push(outputEmbeddingEval.decision)

  const toolEval = evaluateUnseenSetRule({
    label: "toolBindings",
    strictness: features.strictness,
    baselineReady: ready,
    keys: features.toolBindingSlugs,
    baselineCounts: features.baseline?.toolBindingSlugCounts,
  })
  if (toolEval.reason) reasons.push(toolEval.reason)
  decisions.push(toolEval.decision)

  const skillEval = evaluateUnseenSetRule({
    label: "skillPolicies",
    strictness: features.strictness,
    baselineReady: ready,
    keys: features.skillPolicySlugs,
    baselineCounts: features.baseline?.skillPolicySlugCounts,
  })
  if (skillEval.reason) reasons.push(skillEval.reason)
  decisions.push(skillEval.decision)

  const grantedEval = evaluateUnseenSetRule({
    label: "shipGrantedTools",
    strictness: features.strictness,
    baselineReady: ready,
    keys: features.shipGrantedToolSlugs,
    baselineCounts: features.baseline?.shipGrantedToolSlugCounts,
  })
  if (grantedEval.reason) reasons.push(grantedEval.reason)
  decisions.push(grantedEval.decision)

  const commandEval = evaluateUnseenSetRule({
    label: "commandUsage",
    strictness: features.strictness,
    baselineReady: ready,
    keys: features.commandUsageKeys,
    baselineCounts: features.baseline?.commandUsageCounts,
  })
  if (commandEval.reason) reasons.push(commandEval.reason)
  decisions.push(commandEval.decision)

  return {
    decision: combine(decisions),
    baselineReady: ready,
    reasons,
    inputSimilarity: inputEval.similarity,
    outputSimilarity: outputEmbeddingEval.similarity,
    zScores: {
      promptChars: promptEval.z,
      outputChars: outputEval.z,
      durationMs: durationEval.z,
    },
  }
}
