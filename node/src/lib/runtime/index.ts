import type { RuntimeRequest, RuntimeResult, RuntimeSignatureBundle } from "@/lib/types/runtime"

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {}
  }
  return value as Record<string, unknown>
}

function asSignatureBundle(value: unknown): RuntimeSignatureBundle | undefined {
  const record = asRecord(value)
  const keyRef = typeof record.keyRef === "string" ? record.keyRef.trim() : ""
  const signature = typeof record.signature === "string" ? record.signature.trim() : ""
  const algorithm = typeof record.algorithm === "string" ? record.algorithm.trim() : ""
  const payloadHash = typeof record.payloadHash === "string" ? record.payloadHash.trim() : ""
  const signedAt = typeof record.signedAt === "string" ? record.signedAt.trim() : ""
  const address = typeof record.address === "string" ? record.address : undefined
  const key = typeof record.key === "string" ? record.key : undefined

  if (!keyRef || !signature || !algorithm || !payloadHash || !signedAt) {
    return undefined
  }

  return {
    keyRef,
    signature,
    algorithm,
    payloadHash,
    signedAt,
    address,
    key,
  }
}

function extractRuntimeSignatureBundle(payload: unknown): RuntimeSignatureBundle | undefined {
  const root = asRecord(payload)
  const direct = asSignatureBundle(root.signatureBundle || root.signature)
  if (direct) {
    return direct
  }

  const dataRecord = asRecord(root.data)
  return asSignatureBundle(dataRecord.signatureBundle || dataRecord.signature)
}

function openClawConfigured(): boolean {
  return Boolean(process.env.OPENCLAW_GATEWAY_URL)
}

function openAiFallbackConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY) && process.env.ENABLE_OPENAI_RUNTIME_FALLBACK !== "false"
}

async function runOpenClawRuntime(request: RuntimeRequest): Promise<RuntimeResult> {
  const gateway = process.env.OPENCLAW_GATEWAY_URL
  if (!gateway) {
    throw new Error("OpenClaw gateway URL is not configured")
  }

  const path = process.env.OPENCLAW_PROMPT_PATH || "/v1/prompt"
  const timeoutMs = Number.parseInt(process.env.OPENCLAW_TIMEOUT_MS || "15000", 10)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 15000)

  try {
    const response = await fetch(`${gateway}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.OPENCLAW_API_KEY
          ? { Authorization: `Bearer ${process.env.OPENCLAW_API_KEY}` }
          : {}),
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`OpenClaw runtime request failed with status ${response.status}`)
    }

    const payload = await response.json()
    const output =
      payload?.output ||
      payload?.response ||
      payload?.text ||
      payload?.message ||
      payload?.data?.output ||
      null

    if (!output || typeof output !== "string") {
      throw new Error("OpenClaw runtime response did not contain a text output")
    }

    return {
      provider: "openclaw",
      output,
      fallbackUsed: false,
      signatureBundle: extractRuntimeSignatureBundle(payload),
      metadata: {
        gateway,
        path,
      },
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function runOpenAiFallback(request: RuntimeRequest): Promise<RuntimeResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OpenAI API key is not configured")
  }

  const model = process.env.OPENAI_RUNTIME_FALLBACK_MODEL || "gpt-4.1-mini"
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
    throw new Error(`OpenAI fallback request failed with status ${response.status}`)
  }

  const payload = await response.json()
  const outputText =
    payload?.output_text ||
    payload?.output?.[0]?.content?.[0]?.text ||
    payload?.output?.[0]?.content?.[0]?.value ||
    null

  if (!outputText || typeof outputText !== "string") {
    throw new Error("OpenAI fallback response did not contain output text")
  }

  return {
    provider: "openai-fallback",
    output: outputText,
    fallbackUsed: true,
    metadata: {
      model,
    },
  }
}

function runLocalFallback(request: RuntimeRequest, reason: string): RuntimeResult {
  const snippet = request.prompt.trim().slice(0, 280)
  const output =
    `Runtime fallback active. OpenClaw is unavailable.\n\n` +
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

export async function runSessionRuntime(request: RuntimeRequest): Promise<RuntimeResult> {
  if (openClawConfigured()) {
    try {
      return await runOpenClawRuntime(request)
    } catch (error) {
      if (openAiFallbackConfigured()) {
        try {
          return await runOpenAiFallback(request)
        } catch (openAiError) {
          const reason = `OpenClaw error: ${(error as Error).message}; OpenAI fallback error: ${(openAiError as Error).message}`
          return runLocalFallback(request, reason)
        }
      }

      return runLocalFallback(request, `OpenClaw error: ${(error as Error).message}`)
    }
  }

  if (openAiFallbackConfigured()) {
    try {
      return await runOpenAiFallback(request)
    } catch (error) {
      return runLocalFallback(request, `OpenAI fallback error: ${(error as Error).message}`)
    }
  }

  return runLocalFallback(request, "No runtime provider configured")
}
