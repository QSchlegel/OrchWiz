import type { RuntimeRequest, RuntimeResult } from "@/lib/types/runtime"
import type { RuntimeProviderDefinition } from "@/lib/runtime/providers/types"

function buildReason(previousErrors: string[]): string {
  if (previousErrors.length === 0) {
    return "No runtime provider configured"
  }

  return previousErrors.join("; ")
}

function runLocalFallback(request: RuntimeRequest, reason: string): RuntimeResult {
  const snippet = request.prompt.trim().slice(0, 280)
  const output =
    "Runtime fallback active. Provider chain did not return a result.\n\n" +
    `Prompt received:\n${snippet}${snippet.length === 280 ? "..." : ""}`

  return {
    provider: "local-fallback",
    output,
    fallbackUsed: true,
    metadata: {
      reason,
    },
  }
}

export const localFallbackRuntimeProvider: RuntimeProviderDefinition = {
  id: "local-fallback",
  async run(request, context) {
    return runLocalFallback(request, buildReason(context.previousErrors))
  },
}
