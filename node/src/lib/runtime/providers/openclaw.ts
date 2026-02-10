import type { RuntimeRequest, RuntimeResult } from "@/lib/types/runtime"
import { createRecoverableRuntimeError, RuntimeProviderError } from "@/lib/runtime/errors"
import type { RuntimeProviderDefinition } from "@/lib/runtime/providers/types"

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {}
  }
  return value as Record<string, unknown>
}

function asSignatureBundle(value: unknown) {
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

function extractRuntimeSignatureBundle(payload: unknown) {
  const root = asRecord(payload)
  const direct = asSignatureBundle(root.signatureBundle || root.signature)
  if (direct) {
    return direct
  }

  const dataRecord = asRecord(root.data)
  return asSignatureBundle(dataRecord.signatureBundle || dataRecord.signature)
}

function openClawGateway(): string | null {
  const raw = process.env.OPENCLAW_GATEWAY_URL
  if (!raw || !raw.trim()) {
    return null
  }
  return raw.trim()
}

function openClawPath(): string {
  const raw = process.env.OPENCLAW_PROMPT_PATH
  if (!raw || !raw.trim()) {
    return "/v1/prompt"
  }
  return raw.trim()
}

function openClawTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.OPENCLAW_TIMEOUT_MS || "15000", 10)
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed
  }
  return 15000
}

function extractOpenClawOutput(payload: unknown): string | null {
  const root = asRecord(payload)
  const candidates = [
    root.output,
    root.response,
    root.text,
    root.message,
    asRecord(root.data).output,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate
    }
  }

  return null
}

async function runOpenClawRuntime(request: RuntimeRequest): Promise<RuntimeResult> {
  const gateway = openClawGateway()
  if (!gateway) {
    throw createRecoverableRuntimeError({
      provider: "openclaw",
      code: "OPENCLAW_NOT_CONFIGURED",
      message: "OpenClaw gateway URL is not configured",
    })
  }

  const path = openClawPath()
  const timeoutMs = openClawTimeoutMs()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

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
      throw createRecoverableRuntimeError({
        provider: "openclaw",
        code: "OPENCLAW_HTTP_ERROR",
        message: `OpenClaw runtime request failed with status ${response.status}`,
      })
    }

    const payload = await response.json()
    const output = extractOpenClawOutput(payload)
    if (!output) {
      throw createRecoverableRuntimeError({
        provider: "openclaw",
        code: "OPENCLAW_MISSING_OUTPUT",
        message: "OpenClaw runtime response did not contain a text output",
      })
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
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      throw createRecoverableRuntimeError({
        provider: "openclaw",
        code: "OPENCLAW_TIMEOUT",
        message: `OpenClaw runtime timed out after ${timeoutMs}ms`,
      })
    }

    if (error instanceof RuntimeProviderError) {
      throw error
    }

    throw createRecoverableRuntimeError({
      provider: "openclaw",
      code: "OPENCLAW_REQUEST_FAILED",
      message: `OpenClaw runtime request failed: ${(error as Error).message || "Unknown error"}`,
    })
  } finally {
    clearTimeout(timeout)
  }
}

export const openClawRuntimeProvider: RuntimeProviderDefinition = {
  id: "openclaw",
  run: runOpenClawRuntime,
}
