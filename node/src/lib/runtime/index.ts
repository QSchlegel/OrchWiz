import type { RuntimeProvider, RuntimeRequest, RuntimeResult } from "@/lib/types/runtime"
import { RuntimeProviderError, createRecoverableRuntimeError } from "@/lib/runtime/errors"
import { resolveRuntimeProfileConfig } from "@/lib/runtime/profiles"
import { codexCliRuntimeProvider } from "@/lib/runtime/providers/codex-cli"
import { localFallbackRuntimeProvider } from "@/lib/runtime/providers/local-fallback"
import { openAiFallbackRuntimeProvider } from "@/lib/runtime/providers/openai-fallback"
import { openClawRuntimeProvider } from "@/lib/runtime/providers/openclaw"
import type { RuntimeProviderContext, RuntimeProviderDefinition } from "@/lib/runtime/providers/types"

const PROVIDERS_BY_ID: Record<RuntimeProvider, RuntimeProviderDefinition> = {
  openclaw: openClawRuntimeProvider,
  "openai-fallback": openAiFallbackRuntimeProvider,
  "local-fallback": localFallbackRuntimeProvider,
  "codex-cli": codexCliRuntimeProvider,
}

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
  const providerErrors: string[] = []

  for (const providerId of profileConfig.providerOrder) {
    const provider = PROVIDERS_BY_ID[providerId]
    if (!provider) {
      console.warn("Skipping unknown runtime provider", { providerId, profile: profileConfig.profile })
      continue
    }

    const context: RuntimeProviderContext = {
      profile: profileConfig.profile,
      previousErrors: [...providerErrors],
    }

    try {
      return await provider.run(request, context)
    } catch (error) {
      const normalizedError = normalizeProviderError(providerId, error)
      if (!normalizedError.recoverable) {
        throw normalizedError
      }

      providerErrors.push(`${providerLabel(normalizedError)}:${normalizedError.message}`)
      continue
    }
  }

  return localFallbackRuntimeProvider.run(request, {
    profile: profileConfig.profile,
    previousErrors: providerErrors,
  })
}
