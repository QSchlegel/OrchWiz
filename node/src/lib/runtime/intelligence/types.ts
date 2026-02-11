import type { RuntimeProvider, RuntimeRequest } from "@/lib/types/runtime"

export type RuntimeExecutionKind = "human_chat" | "autonomous_task"
export type RuntimeIntelligenceTier = "max" | "simple"

export interface RuntimeIntelligenceDecisionState {
  executionKind: RuntimeExecutionKind
  tier: RuntimeIntelligenceTier
  decision: string
  selectedModel: string
  maxModel: string
  simpleModel: string
  classifierModel: string
  classifierRequiresBump: boolean | null
  classifierConfidence: number | null
  classifierReason: string | null
  classifierPromptSource: "langfuse" | "local"
  classifierPromptLabel: string | null
  classifierPromptVersion: number | null
  thresholdBefore: number | null
  thresholdAfter: number | null
  explorationRate: number | null
  explorationApplied: boolean
}

export interface RuntimeEconomicsEstimate {
  estimatedPromptTokens: number
  estimatedCompletionTokens: number
  estimatedTotalTokens: number
  estimatedCostUsd: number
  estimatedCostEur: number
  baselineMaxCostUsd: number
  baselineMaxCostEur: number
  estimatedSavingsUsd: number
  estimatedSavingsEur: number
  currencyFxUsdToEur: number
  economicsEstimated: boolean
}

export interface RuntimeIntelligenceMetadata extends RuntimeEconomicsEstimate {
  executionKind: RuntimeExecutionKind
  tier: RuntimeIntelligenceTier
  decision: string
  resolvedModel: string
  classifierModel: string
  classifierConfidence: number | null
  thresholdBefore: number | null
  thresholdAfter: number | null
  rewardScore: number | null
}

export interface RuntimeIntelligencePolicyResolution {
  request: RuntimeRequest
  providerOrder: RuntimeProvider[]
  state: RuntimeIntelligenceDecisionState
}

export interface RuntimeIntelligenceFinalizeResult {
  state: RuntimeIntelligenceDecisionState
  rewardScore: number | null
  economics: RuntimeEconomicsEstimate
}
