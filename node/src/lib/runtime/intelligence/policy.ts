import type { RuntimeProfileName } from "@/lib/runtime/profiles"
import { runtimeIntelligenceConfig } from "@/lib/runtime/intelligence/config"
import { estimateRuntimeEconomics, computeRuntimeReward } from "@/lib/runtime/intelligence/economics"
import {
  getRuntimeClassifierPromptTemplate,
  renderRuntimeClassifierPrompt,
} from "@/lib/runtime/intelligence/prompt-manager"
import {
  loadRuntimeIntelligencePolicyState,
  updateRuntimeIntelligencePolicyStateOnline,
} from "@/lib/runtime/intelligence/state"
import type {
  RuntimeExecutionKind,
  RuntimeIntelligenceDecisionState,
  RuntimeIntelligenceFinalizeResult,
  RuntimeIntelligencePolicyResolution,
} from "@/lib/runtime/intelligence/types"
import type { RuntimeProvider, RuntimeRequest } from "@/lib/types/runtime"

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return null
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function uniqueProviders(input: RuntimeProvider[]): RuntimeProvider[] {
  const seen = new Set<RuntimeProvider>()
  const output: RuntimeProvider[] = []
  for (const provider of input) {
    if (seen.has(provider)) continue
    seen.add(provider)
    output.push(provider)
  }
  return output
}

function resolveRuntimeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  return asRecord(metadata.runtime)
}

function resolveRequestUserId(request: RuntimeRequest): string | null {
  if (request.userId) {
    return request.userId
  }
  const metadata = asRecord(request.metadata)
  return asString(metadata.userId)
}

export function resolveRuntimeExecutionKind(metadata?: Record<string, unknown>): RuntimeExecutionKind {
  const runtimeMetadata = resolveRuntimeMetadata(asRecord(metadata))
  const explicit = asString(runtimeMetadata.executionKind)?.toLowerCase()
  if (explicit === "autonomous_task") {
    return "autonomous_task"
  }
  return "human_chat"
}

function extractOpenAiOutput(payload: unknown): string | null {
  const root = payload as {
    output_text?: unknown
    output?: Array<{ content?: Array<{ text?: unknown; value?: unknown }> }>
  }

  const candidates = [
    root?.output_text,
    root?.output?.[0]?.content?.[0]?.text,
    root?.output?.[0]?.content?.[0]?.value,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate
    }
  }

  return null
}

function parseClassifierPayload(raw: string): {
  requiresBump: boolean
  confidence: number
  reason: string | null
} | null {
  const trimmed = raw.trim()
  const candidates = [trimmed]

  const match = trimmed.match(/\{[\s\S]*\}/u)
  if (match?.[0] && match[0] !== trimmed) {
    candidates.push(match[0])
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>
      const requiresBump = parsed.requiresBump === true
      const confidence = clamp(asNumber(parsed.confidence) ?? (requiresBump ? 0.9 : 0.4), 0, 1)
      const reason = asString(parsed.reason)
      return {
        requiresBump,
        confidence,
        reason,
      }
    } catch {
      // continue
    }
  }

  return null
}

async function runAutonomousClassifier(args: {
  request: RuntimeRequest
  executionContext: string
}): Promise<{
  requiresBump: boolean
  confidence: number
  reason: string | null
  promptSource: "langfuse" | "local"
  promptLabel: string | null
  promptVersion: number | null
} | null> {
  const config = runtimeIntelligenceConfig()
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    return null
  }

  const promptTemplate = await getRuntimeClassifierPromptTemplate(config)
  const prompt = renderRuntimeClassifierPrompt({
    template: promptTemplate.template,
    task: args.request.prompt,
    executionContext: args.executionContext,
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.classifierTimeoutMs)

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.classifierModel,
        input: prompt,
        metadata: {
          sessionId: args.request.sessionId,
          surface: "runtime-intelligence-classifier",
        },
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      return null
    }

    const payload = await response.json()
    const raw = extractOpenAiOutput(payload)
    if (!raw) {
      return null
    }

    const parsed = parseClassifierPayload(raw)
    if (!parsed) {
      return null
    }

    return {
      ...parsed,
      promptSource: promptTemplate.source,
      promptLabel: promptTemplate.label,
      promptVersion: promptTemplate.version,
    }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

function mergeIntelligenceMetadata(args: {
  metadata: Record<string, unknown>
  executionKind: RuntimeExecutionKind
  state: RuntimeIntelligenceDecisionState
}): Record<string, unknown> {
  const runtimeMetadata = resolveRuntimeMetadata(args.metadata)
  const intelligenceMetadata = asRecord(runtimeMetadata.intelligence)

  const nextRuntimeMetadata: Record<string, unknown> = {
    ...runtimeMetadata,
    executionKind: args.executionKind,
    intelligence: {
      ...intelligenceMetadata,
      policyVersion: 2,
      executionKind: args.executionKind,
      tier: args.state.tier,
      decision: args.state.decision,
      selectedModel: args.state.selectedModel,
      maxModel: args.state.maxModel,
      simpleModel: args.state.simpleModel,
      classifierModel: args.state.classifierModel,
      classifierRequiresBump: args.state.classifierRequiresBump,
      classifierConfidence: args.state.classifierConfidence,
      classifierReason: args.state.classifierReason,
      classifierPromptSource: args.state.classifierPromptSource,
      classifierPromptLabel: args.state.classifierPromptLabel,
      classifierPromptVersion: args.state.classifierPromptVersion,
      thresholdBefore: args.state.thresholdBefore,
      thresholdAfter: args.state.thresholdAfter,
      explorationRate: args.state.explorationRate,
      explorationApplied: args.state.explorationApplied,
    },
  }

  return {
    ...args.metadata,
    runtime: nextRuntimeMetadata,
  }
}

function filterProviderOrder(providerOrder: RuntimeProvider[]): RuntimeProvider[] {
  const filtered = providerOrder.filter((provider) => provider !== "openclaw")
  const deduped = uniqueProviders(filtered)
  if (!deduped.includes("local-fallback")) {
    deduped.push("local-fallback")
  }
  return deduped
}

export async function applyRuntimeIntelligencePolicy(args: {
  request: RuntimeRequest
  providerOrder: RuntimeProvider[]
  profile: RuntimeProfileName
}): Promise<RuntimeIntelligencePolicyResolution> {
  const config = runtimeIntelligenceConfig()
  const metadata = asRecord(args.request.metadata)
  const executionKind = resolveRuntimeExecutionKind(metadata)

  if (!config.enabled) {
    const disabledState: RuntimeIntelligenceDecisionState = {
      executionKind,
      tier: "max",
      decision: "policy_disabled_passthrough",
      selectedModel: config.maxModel,
      maxModel: config.maxModel,
      simpleModel: config.simpleModel,
      classifierModel: config.classifierModel,
      classifierRequiresBump: null,
      classifierConfidence: null,
      classifierReason: null,
      classifierPromptSource: "local",
      classifierPromptLabel: null,
      classifierPromptVersion: null,
      thresholdBefore: null,
      thresholdAfter: null,
      explorationRate: null,
      explorationApplied: false,
    }

    return {
      request: args.request,
      providerOrder: args.providerOrder,
      state: disabledState,
    }
  }

  const userId = resolveRequestUserId(args.request)
  let thresholdBefore: number | null = null
  let explorationRate: number | null = null

  if (executionKind === "autonomous_task") {
    const policyState = await loadRuntimeIntelligencePolicyState(userId, config)
    thresholdBefore = policyState.threshold
    explorationRate = policyState.explorationRate
  }

  let state: RuntimeIntelligenceDecisionState = {
    executionKind,
    tier: "max",
    decision: "human_forced_max",
    selectedModel: config.maxModel,
    maxModel: config.maxModel,
    simpleModel: config.simpleModel,
    classifierModel: config.classifierModel,
    classifierRequiresBump: null,
    classifierConfidence: null,
    classifierReason: null,
    classifierPromptSource: "local",
    classifierPromptLabel: null,
    classifierPromptVersion: null,
    thresholdBefore,
    thresholdAfter: thresholdBefore,
    explorationRate,
    explorationApplied: false,
  }

  if (executionKind === "autonomous_task") {
    const classifier = await runAutonomousClassifier({
      request: args.request,
      executionContext: `profile=${args.profile}; session=${args.request.sessionId}`,
    })

    if (!classifier) {
      state = {
        ...state,
        tier: "max",
        decision: "classifier_unavailable_forced_max",
        selectedModel: config.maxModel,
      }
    } else {
      let shouldBump = classifier.requiresBump || classifier.confidence >= (thresholdBefore ?? config.thresholdDefault)
      let explorationApplied = false

      if (typeof explorationRate === "number" && explorationRate > 0 && Math.random() < explorationRate) {
        shouldBump = !shouldBump
        explorationApplied = true
      }

      state = {
        ...state,
        tier: shouldBump ? "max" : "simple",
        decision: shouldBump ? "classifier_bump" : "classifier_keep_simple",
        selectedModel: shouldBump ? config.maxModel : config.simpleModel,
        classifierRequiresBump: classifier.requiresBump,
        classifierConfidence: classifier.confidence,
        classifierReason: classifier.reason,
        classifierPromptSource: classifier.promptSource,
        classifierPromptLabel: classifier.promptLabel,
        classifierPromptVersion: classifier.promptVersion,
        explorationApplied,
      }

      if (explorationApplied) {
        state.decision = `${state.decision}_explore`
      }
    }
  }

  const metadataWithIntelligence = mergeIntelligenceMetadata({
    metadata,
    executionKind,
    state,
  })

  const providerOrder = config.requireControllableProviders
    ? filterProviderOrder(args.providerOrder)
    : args.providerOrder

  return {
    request: {
      ...args.request,
      metadata: metadataWithIntelligence,
    },
    providerOrder,
    state,
  }
}

export async function finalizeRuntimeIntelligencePolicy(args: {
  request: RuntimeRequest
  state: RuntimeIntelligenceDecisionState
  output: string
  fallbackUsed: boolean
  durationMs: number
  status: "success" | "error"
}): Promise<RuntimeIntelligenceFinalizeResult> {
  const config = runtimeIntelligenceConfig()

  const economics = estimateRuntimeEconomics({
    prompt: args.request.prompt,
    output: args.output,
    selectedModel: args.state.selectedModel,
    baselineMaxModel: args.state.maxModel,
    config,
  })

  let rewardScore: number | null = null
  let thresholdAfter = args.state.thresholdBefore

  if (config.enabled && args.state.executionKind === "autonomous_task") {
    rewardScore = computeRuntimeReward({
      status: args.status,
      durationMs: args.durationMs,
      fallbackUsed: args.fallbackUsed,
      estimatedSavingsUsd: economics.estimatedSavingsUsd,
    })

    thresholdAfter = await updateRuntimeIntelligencePolicyStateOnline({
      userId: resolveRequestUserId(args.request),
      rewardScore,
      thresholdBefore: args.state.thresholdBefore,
      config,
    })
  }

  return {
    state: {
      ...args.state,
      thresholdAfter,
    },
    rewardScore,
    economics,
  }
}
