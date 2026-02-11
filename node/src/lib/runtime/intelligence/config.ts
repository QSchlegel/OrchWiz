interface ModelPricing {
  input: number
  output: number
}

export interface RuntimeIntelligenceConfig {
  enabled: boolean
  requireControllableProviders: boolean
  maxModel: string
  simpleModel: string
  classifierModel: string
  classifierTimeoutMs: number
  langfusePromptName: string
  langfusePromptLabel: string
  langfusePromptVersion: number | null
  langfusePromptCacheTtlSeconds: number
  usdToEur: number
  modelPricingUsdPer1M: Record<string, ModelPricing>
  thresholdDefault: number
  thresholdMin: number
  thresholdMax: number
  learningRate: number
  explorationRate: number
  targetReward: number
  nightlyCronToken: string | null
}

const DEFAULT_MODEL_PRICING_USD_PER_1M: Record<string, ModelPricing> = {
  "gpt-5": { input: 1.25, output: 10 },
  "gpt-5-mini": { input: 0.25, output: 2 },
  "gpt-5-nano": { input: 0.05, output: 0.4 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
}

function asBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  const normalized = value.trim().toLowerCase()
  if (["1", "true", "yes", "on"].includes(normalized)) return true
  if (["0", "false", "no", "off"].includes(normalized)) return false
  return fallback
}

function asString(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

function asNumber(value: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value || "")
  if (!Number.isFinite(parsed)) return fallback
  return parsed
}

function asPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return parsed
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function parsePromptVersion(value: string | undefined): number | null {
  if (!value || !value.trim()) return null
  const parsed = Number.parseInt(value.trim(), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }
  return parsed
}

function parseModelPricing(raw: string | undefined): Record<string, ModelPricing> {
  if (!raw || !raw.trim()) {
    return { ...DEFAULT_MODEL_PRICING_USD_PER_1M }
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const output: Record<string, ModelPricing> = {}

    for (const [model, candidate] of Object.entries(parsed)) {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
        continue
      }

      const input = Number.parseFloat(String((candidate as { input?: unknown }).input ?? ""))
      const out = Number.parseFloat(String((candidate as { output?: unknown }).output ?? ""))
      if (!Number.isFinite(input) || input < 0 || !Number.isFinite(out) || out < 0) {
        continue
      }

      output[model] = {
        input,
        output: out,
      }
    }

    if (Object.keys(output).length > 0) {
      return output
    }
  } catch {
    // ignore parse errors and fall back
  }

  return { ...DEFAULT_MODEL_PRICING_USD_PER_1M }
}

export function runtimeIntelligenceConfig(): RuntimeIntelligenceConfig {
  const thresholdMin = clamp(asNumber(process.env.RUNTIME_INTELLIGENCE_THRESHOLD_MIN, 0.35), 0, 1)
  const thresholdMax = clamp(asNumber(process.env.RUNTIME_INTELLIGENCE_THRESHOLD_MAX, 0.95), thresholdMin, 1)
  const thresholdDefault = clamp(
    asNumber(process.env.RUNTIME_INTELLIGENCE_THRESHOLD_DEFAULT, 0.62),
    thresholdMin,
    thresholdMax,
  )
  const explorationRate = clamp(asNumber(process.env.RUNTIME_INTELLIGENCE_EXPLORATION_RATE, 0.05), 0, 0.5)

  return {
    enabled: asBoolean(process.env.RUNTIME_INTELLIGENCE_POLICY_ENABLED, true),
    requireControllableProviders: asBoolean(process.env.RUNTIME_INTELLIGENCE_REQUIRE_CONTROLLABLE_PROVIDERS, true),
    maxModel: asString(process.env.RUNTIME_INTELLIGENCE_MAX_MODEL, "gpt-5"),
    simpleModel: asString(process.env.RUNTIME_INTELLIGENCE_SIMPLE_MODEL, "gpt-5-mini"),
    classifierModel: asString(process.env.RUNTIME_INTELLIGENCE_CLASSIFIER_MODEL, "gpt-5-nano"),
    classifierTimeoutMs: asPositiveInt(process.env.RUNTIME_INTELLIGENCE_CLASSIFIER_TIMEOUT_MS, 6000),
    langfusePromptName: asString(
      process.env.RUNTIME_INTELLIGENCE_LANGFUSE_PROMPT_NAME,
      "runtime-intelligence-autonomous-classifier",
    ),
    langfusePromptLabel: asString(process.env.RUNTIME_INTELLIGENCE_LANGFUSE_PROMPT_LABEL, "production"),
    langfusePromptVersion: parsePromptVersion(process.env.RUNTIME_INTELLIGENCE_LANGFUSE_PROMPT_VERSION),
    langfusePromptCacheTtlSeconds: asPositiveInt(
      process.env.RUNTIME_INTELLIGENCE_LANGFUSE_PROMPT_CACHE_TTL_SECONDS,
      60,
    ),
    usdToEur: asNumber(process.env.RUNTIME_INTELLIGENCE_USD_TO_EUR, 0.92),
    modelPricingUsdPer1M: parseModelPricing(process.env.RUNTIME_INTELLIGENCE_MODEL_PRICING_USD_PER_1M),
    thresholdDefault,
    thresholdMin,
    thresholdMax,
    learningRate: clamp(asNumber(process.env.RUNTIME_INTELLIGENCE_LEARNING_RATE, 0.08), 0.001, 0.8),
    explorationRate,
    targetReward: clamp(asNumber(process.env.RUNTIME_INTELLIGENCE_TARGET_REWARD, 0.55), -2, 2),
    nightlyCronToken: process.env.RUNTIME_INTELLIGENCE_NIGHTLY_CRON_TOKEN?.trim() || null,
  }
}

export function resolveModelPricing(
  model: string,
  pricing: Record<string, ModelPricing>,
): ModelPricing {
  const entry = pricing[model]
  if (entry && Number.isFinite(entry.input) && Number.isFinite(entry.output)) {
    return entry
  }

  return {
    input: 1,
    output: 1,
  }
}
