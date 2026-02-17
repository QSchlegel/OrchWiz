import type { RuntimeResult } from "@/lib/types/runtime"
import type {
  RuntimeProviderDefinition,
  RuntimeProviderContext,
  RuntimeProviderFailureDetail,
} from "@/lib/runtime/providers/types"

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function buildReason(previousErrors: string[]): string {
  if (previousErrors.length === 0) {
    return "No runtime provider configured"
  }

  return previousErrors.join("; ")
}

function parseFailureDetailFromLegacyError(value: string): RuntimeProviderFailureDetail | null {
  const firstColon = value.indexOf(":")
  const secondColon = value.indexOf(":", firstColon + 1)
  if (firstColon <= 0 || secondColon <= firstColon + 1) {
    return null
  }

  const provider = asString(value.slice(0, firstColon))
  const code = asString(value.slice(firstColon + 1, secondColon))
  const message = asString(value.slice(secondColon + 1))
  if (!provider || !code || !message) {
    return null
  }

  return { provider, code, message }
}

function normalizeFailureDetails(context: RuntimeProviderContext): RuntimeProviderFailureDetail[] {
  if (context.previousErrorDetails.length > 0) {
    return context.previousErrorDetails
  }

  return context.previousErrors
    .map(parseFailureDetailFromLegacyError)
    .filter((detail): detail is RuntimeProviderFailureDetail => Boolean(detail))
}

function runLocalFallback(context: RuntimeProviderContext, reason: string): RuntimeResult {
  const providerErrors = normalizeFailureDetails(context)
  const output = "Runtime fallback active. Provider chain did not return a result."

  return {
    provider: "local-fallback",
    output,
    fallbackUsed: true,
    metadata: {
      reason,
      providerErrors,
      fallback: {
        active: true,
        provider: "local-fallback",
        reason,
        providerErrors,
      },
    },
  }
}

export const localFallbackRuntimeProvider: RuntimeProviderDefinition = {
  id: "local-fallback",
  async run(_request, context) {
    return runLocalFallback(context, buildReason(context.previousErrors))
  },
}
