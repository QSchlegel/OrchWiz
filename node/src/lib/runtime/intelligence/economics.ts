import { resolveModelPricing, type RuntimeIntelligenceConfig } from "@/lib/runtime/intelligence/config"
import type { RuntimeEconomicsEstimate } from "@/lib/runtime/intelligence/types"

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function round(value: number, digits = 8): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function estimateTokenCount(text: string): number {
  const normalized = text.trim()
  if (!normalized) {
    return 0
  }
  return Math.max(1, Math.round(normalized.length / 4))
}

export function estimateRuntimeEconomics(args: {
  prompt: string
  output: string
  selectedModel: string
  baselineMaxModel: string
  config: RuntimeIntelligenceConfig
}): RuntimeEconomicsEstimate {
  const estimatedPromptTokens = estimateTokenCount(args.prompt)
  const estimatedCompletionTokens = estimateTokenCount(args.output)
  const estimatedTotalTokens = estimatedPromptTokens + estimatedCompletionTokens

  const selectedPricing = resolveModelPricing(args.selectedModel, args.config.modelPricingUsdPer1M)
  const baselinePricing = resolveModelPricing(args.baselineMaxModel, args.config.modelPricingUsdPer1M)

  const estimatedCostUsd =
    estimatedPromptTokens / 1_000_000 * selectedPricing.input
    + estimatedCompletionTokens / 1_000_000 * selectedPricing.output

  const baselineMaxCostUsd =
    estimatedPromptTokens / 1_000_000 * baselinePricing.input
    + estimatedCompletionTokens / 1_000_000 * baselinePricing.output

  const estimatedSavingsUsd = baselineMaxCostUsd - estimatedCostUsd
  const fx = args.config.usdToEur

  return {
    estimatedPromptTokens,
    estimatedCompletionTokens,
    estimatedTotalTokens,
    estimatedCostUsd: round(estimatedCostUsd),
    estimatedCostEur: round(estimatedCostUsd * fx),
    baselineMaxCostUsd: round(baselineMaxCostUsd),
    baselineMaxCostEur: round(baselineMaxCostUsd * fx),
    estimatedSavingsUsd: round(estimatedSavingsUsd),
    estimatedSavingsEur: round(estimatedSavingsUsd * fx),
    currencyFxUsdToEur: fx,
    economicsEstimated: true,
  }
}

export function computeRuntimeReward(args: {
  status: "success" | "error"
  durationMs: number
  fallbackUsed: boolean
  estimatedSavingsUsd: number
}): number {
  let reward = args.status === "success" ? 1 : -1

  if (args.fallbackUsed) {
    reward -= 0.25
  }

  if (args.durationMs <= 8_000) {
    reward += 0.12
  } else if (args.durationMs >= 60_000) {
    reward -= 0.18
  }

  const savingsBonus = clamp(args.estimatedSavingsUsd * 3, -0.25, 0.5)
  reward += savingsBonus

  return round(clamp(reward, -2, 2), 4)
}
