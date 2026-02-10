import type { RuntimeRequest, RuntimeResult } from "@/lib/types/runtime"
import { createRecoverableRuntimeError, RuntimeProviderError } from "@/lib/runtime/errors"
import type { RuntimeProviderDefinition } from "@/lib/runtime/providers/types"

function openAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY) && process.env.ENABLE_OPENAI_RUNTIME_FALLBACK !== "false"
}

function openAiModel(): string {
  const model = process.env.OPENAI_RUNTIME_FALLBACK_MODEL
  if (model && model.trim()) {
    return model.trim()
  }

  return "gpt-4.1-mini"
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

async function runOpenAiFallback(request: RuntimeRequest): Promise<RuntimeResult> {
  if (!openAiConfigured()) {
    throw createRecoverableRuntimeError({
      provider: "openai-fallback",
      code: "OPENAI_NOT_CONFIGURED",
      message: "OpenAI fallback is not configured",
    })
  }

  const apiKey = process.env.OPENAI_API_KEY!
  const model = openAiModel()

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: request.prompt,
        metadata: {
          sessionId: request.sessionId,
        },
      }),
    })

    if (!response.ok) {
      throw createRecoverableRuntimeError({
        provider: "openai-fallback",
        code: "OPENAI_HTTP_ERROR",
        message: `OpenAI fallback request failed with status ${response.status}`,
      })
    }

    const payload = await response.json()
    const outputText = extractOpenAiOutput(payload)

    if (!outputText) {
      throw createRecoverableRuntimeError({
        provider: "openai-fallback",
        code: "OPENAI_MISSING_OUTPUT",
        message: "OpenAI fallback response did not contain output text",
      })
    }

    return {
      provider: "openai-fallback",
      output: outputText,
      fallbackUsed: true,
      metadata: {
        model,
      },
    }
  } catch (error) {
    if (error instanceof RuntimeProviderError) {
      throw error
    }

    throw createRecoverableRuntimeError({
      provider: "openai-fallback",
      code: "OPENAI_REQUEST_FAILED",
      message: `OpenAI fallback request failed: ${(error as Error).message || "Unknown error"}`,
    })
  }
}

export const openAiFallbackRuntimeProvider: RuntimeProviderDefinition = {
  id: "openai-fallback",
  run: runOpenAiFallback,
}
