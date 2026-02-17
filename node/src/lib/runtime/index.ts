import type { RuntimeProvider, RuntimeRequest, RuntimeResult } from "@/lib/types/runtime"
import { RuntimeProviderError, createRecoverableRuntimeError } from "@/lib/runtime/errors"
import { resolveRuntimeProfileConfig } from "@/lib/runtime/profiles"
import { resolveRuntimeExecutionPlan } from "@/lib/runtime/registry"
import {
  applyRuntimeIntelligencePolicy,
  finalizeRuntimeIntelligencePolicy,
} from "@/lib/runtime/intelligence"
import { localFallbackRuntimeProvider } from "@/lib/runtime/providers/local-fallback"
import type { RuntimeProviderContext, RuntimeProviderFailureDetail } from "@/lib/runtime/providers/types"

function providerLabel(error: RuntimeProviderError): string {
  return `${error.provider}:${error.code}`
}

function normalizeProviderError(providerId: RuntimeProvider, error: unknown): RuntimeProviderError {
  if (error instanceof RuntimeProviderError) {
    return error
  }

  return createRecoverableRuntimeError({
    provider: providerId,
    code: "RUNTIME_PROVIDER_ERROR",
    message: `${providerId} runtime provider failed: ${(error as Error)?.message || "Unknown error"}`,
  })
}

export async function runSessionRuntime(request: RuntimeRequest): Promise<RuntimeResult> {
  const profileConfig = resolveRuntimeProfileConfig(request)
  const executionPlan = await resolveRuntimeExecutionPlan({
    request,
    profile: profileConfig.profile,
    legacyProviderOrder: profileConfig.providerOrder,
  })
  const policy = await applyRuntimeIntelligencePolicy({
    request,
    providerOrder: executionPlan.providerOrder,
    profile: profileConfig.profile,
    catalogByAdapterId: executionPlan.catalogByAdapterId,
  })
  const runtimeStartedAt = Date.now()
  const providerErrors: string[] = []
  const providerErrorDetails: RuntimeProviderFailureDetail[] = []

  for (const providerId of policy.providerOrder) {
    const provider = executionPlan.providersById[providerId]
    if (!provider) {
      console.warn("Skipping unknown runtime provider", { providerId, profile: profileConfig.profile })
      continue
    }

    const context: RuntimeProviderContext = {
      profile: profileConfig.profile,
      previousErrors: [...providerErrors],
      previousErrorDetails: [...providerErrorDetails],
    }

    try {
      const runtimeResult = await provider.run(policy.request, context)
      const finalized = await finalizeRuntimeIntelligencePolicy({
        request: policy.request,
        state: policy.state,
        output: runtimeResult.output,
        fallbackUsed: runtimeResult.fallbackUsed,
        durationMs: Date.now() - runtimeStartedAt,
        status: "success",
      })

      return {
        ...runtimeResult,
        metadata: {
          ...(runtimeResult.metadata || {}),
          intelligence: {
            executionKind: finalized.state.executionKind,
            tier: finalized.state.tier,
            decision: finalized.state.decision,
            resolvedModel: finalized.state.selectedModel,
            classifierModel: finalized.state.classifierModel,
            classifierConfidence: finalized.state.classifierConfidence,
            thresholdBefore: finalized.state.thresholdBefore,
            thresholdAfter: finalized.state.thresholdAfter,
            rewardScore: finalized.rewardScore,
            classifierRequiresBump: finalized.state.classifierRequiresBump,
            classifierReason: finalized.state.classifierReason,
            classifierPromptSource: finalized.state.classifierPromptSource,
            classifierPromptLabel: finalized.state.classifierPromptLabel,
            classifierPromptVersion: finalized.state.classifierPromptVersion,
            explorationRate: finalized.state.explorationRate,
            explorationApplied: finalized.state.explorationApplied,
            ...finalized.economics,
          },
        },
      }
    } catch (error) {
      const normalizedError = normalizeProviderError(providerId, error)
      if (!normalizedError.recoverable) {
        throw normalizedError
      }

      providerErrors.push(`${providerLabel(normalizedError)}:${normalizedError.message}`)
      providerErrorDetails.push({
        provider: normalizedError.provider,
        code: normalizedError.code,
        message: normalizedError.message,
      })
      continue
    }
  }

  const fallbackResult = await localFallbackRuntimeProvider.run(policy.request, {
    profile: profileConfig.profile,
    previousErrors: providerErrors,
    previousErrorDetails: providerErrorDetails,
  })
  const finalized = await finalizeRuntimeIntelligencePolicy({
    request: policy.request,
    state: policy.state,
    output: fallbackResult.output,
    fallbackUsed: true,
    durationMs: Date.now() - runtimeStartedAt,
    status: "success",
  })

  return {
    ...fallbackResult,
    metadata: {
      ...(fallbackResult.metadata || {}),
      intelligence: {
        executionKind: finalized.state.executionKind,
        tier: finalized.state.tier,
        decision: finalized.state.decision,
        resolvedModel: finalized.state.selectedModel,
        classifierModel: finalized.state.classifierModel,
        classifierConfidence: finalized.state.classifierConfidence,
        thresholdBefore: finalized.state.thresholdBefore,
        thresholdAfter: finalized.state.thresholdAfter,
        rewardScore: finalized.rewardScore,
        classifierRequiresBump: finalized.state.classifierRequiresBump,
        classifierReason: finalized.state.classifierReason,
        classifierPromptSource: finalized.state.classifierPromptSource,
        classifierPromptLabel: finalized.state.classifierPromptLabel,
        classifierPromptVersion: finalized.state.classifierPromptVersion,
        explorationRate: finalized.state.explorationRate,
        explorationApplied: finalized.state.explorationApplied,
        ...finalized.economics,
      },
    },
  }
}
