import type { RuntimeRequest, RuntimeResult } from "@/lib/types/runtime"
import { createRecoverableRuntimeError, RuntimeProviderError } from "@/lib/runtime/errors"
import type { RuntimeProviderDefinition } from "@/lib/runtime/providers/types"

interface SpacebotPollMessage {
  type: string
  content?: string | null
}

interface SpacebotPollResponse {
  messages?: SpacebotPollMessage[]
}

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

function asBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback
  }

  const normalized = value.trim().toLowerCase()
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false
  }

  return fallback
}

function spacebotConnectorEnabled(): boolean {
  return asBoolean(process.env.SPACEBOT_CONNECTOR_ENABLED, false)
}

function spacebotWebhookBaseUrl(): string {
  const raw = asString(process.env.SPACEBOT_WEBHOOK_BASE_URL)
  if (!raw) {
    return "http://spacebot:18789"
  }

  return raw.replace(/\/+$/u, "")
}

function spacebotSendPath(): string {
  const raw = asString(process.env.SPACEBOT_WEBHOOK_SEND_PATH) || "/send"
  return raw.startsWith("/") ? raw : `/${raw}`
}

function spacebotPollPathTemplate(): string {
  const raw = asString(process.env.SPACEBOT_WEBHOOK_POLL_PATH_TEMPLATE) || "/poll/{conversationId}"
  return raw.startsWith("/") ? raw : `/${raw}`
}

function spacebotHealthPath(): string {
  const raw = asString(process.env.SPACEBOT_WEBHOOK_HEALTH_PATH) || "/health"
  return raw.startsWith("/") ? raw : `/${raw}`
}

function spacebotTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.SPACEBOT_WEBHOOK_TIMEOUT_MS || "90000", 10)
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed
  }

  return 90000
}

function spacebotPollIntervalMs(): number {
  const parsed = Number.parseInt(process.env.SPACEBOT_WEBHOOK_POLL_INTERVAL_MS || "1500", 10)
  if (Number.isFinite(parsed) && parsed >= 250) {
    return parsed
  }

  return 1500
}

function resolveConversationId(request: RuntimeRequest): string {
  const metadata = asRecord(request.metadata)
  const runtime = asRecord(metadata.runtime)
  const bridge = asRecord(metadata.bridge)
  const quartermaster = asRecord(metadata.quartermaster)

  return (
    asString(runtime.conversationId)
    || asString(bridge.conversationId)
    || asString(bridge.threadId)
    || asString(quartermaster.conversationId)
    || request.sessionId
  )
}

function resolveSenderId(request: RuntimeRequest): string {
  const metadata = asRecord(request.metadata)
  const runtime = asRecord(metadata.runtime)

  return asString(runtime.senderId) || asString(metadata.userId) || "orchwiz"
}

function resolveAgentId(request: RuntimeRequest): string | null {
  const metadata = asRecord(request.metadata)
  const runtime = asRecord(metadata.runtime)

  return asString(runtime.agentId)
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function resolvePollUrl(baseUrl: string, conversationId: string): string {
  const path = spacebotPollPathTemplate().replaceAll("{conversationId}", encodeURIComponent(conversationId))
  return `${baseUrl}${path}`
}

function extractSpacebotText(payload: SpacebotPollResponse): {
  immediateTexts: string[]
  streamChunks: string[]
  streamEnded: boolean
} {
  const messages = Array.isArray(payload.messages) ? payload.messages : []
  const immediateTexts: string[] = []
  const streamChunks: string[] = []
  let streamEnded = false

  for (const message of messages) {
    const type = asString(message?.type)
    const content = asString(message?.content)

    if (!type) {
      continue
    }

    if (type === "text") {
      if (content) {
        immediateTexts.push(content)
      }
      continue
    }

    if (type === "stream_chunk") {
      if (content) {
        streamChunks.push(content)
      }
      continue
    }

    if (type === "stream_end") {
      streamEnded = true
    }
  }

  return {
    immediateTexts,
    streamChunks,
    streamEnded,
  }
}

async function runSpacebotWebhook(request: RuntimeRequest): Promise<RuntimeResult> {
  if (!spacebotConnectorEnabled()) {
    throw createRecoverableRuntimeError({
      provider: "spacebot-webhook",
      code: "SPACEBOT_CONNECTOR_DISABLED",
      message: "Spacebot webhook connector is disabled. Set SPACEBOT_CONNECTOR_ENABLED=true to enable it.",
    })
  }

  const baseUrl = spacebotWebhookBaseUrl()
  const sendUrl = `${baseUrl}${spacebotSendPath()}`
  const conversationId = resolveConversationId(request)
  const senderId = resolveSenderId(request)
  const agentId = resolveAgentId(request)
  const timeoutMs = spacebotTimeoutMs()
  const pollIntervalMs = spacebotPollIntervalMs()
  const deadline = Date.now() + timeoutMs

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }

  const authToken = asString(process.env.SPACEBOT_WEBHOOK_AUTH_TOKEN)
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`
  }

  try {
    const sendResponse = await fetch(sendUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        conversation_id: conversationId,
        sender_id: senderId,
        content: request.prompt,
        ...(agentId
          ? {
              agent_id: agentId,
            }
          : {}),
      }),
    })

    if (!sendResponse.ok) {
      throw createRecoverableRuntimeError({
        provider: "spacebot-webhook",
        code: "SPACEBOT_SEND_HTTP_ERROR",
        message: `Spacebot webhook send failed with status ${sendResponse.status}.`,
        details: {
          sendUrl,
          status: sendResponse.status,
        },
      })
    }
  } catch (error) {
    if (error instanceof RuntimeProviderError) {
      throw error
    }

    throw createRecoverableRuntimeError({
      provider: "spacebot-webhook",
      code: "SPACEBOT_SEND_FAILED",
      message: `Spacebot webhook send request failed: ${(error as Error)?.message || "Unknown error"}`,
      details: {
        sendUrl,
      },
    })
  }

  const pollUrl = resolvePollUrl(baseUrl, conversationId)
  const streamedChunks: string[] = []
  let polls = 0

  while (Date.now() < deadline) {
    polls += 1

    let pollPayload: SpacebotPollResponse
    try {
      const pollResponse = await fetch(pollUrl, {
        method: "GET",
        headers: authToken
          ? {
              Authorization: `Bearer ${authToken}`,
            }
          : undefined,
      })

      if (!pollResponse.ok) {
        throw createRecoverableRuntimeError({
          provider: "spacebot-webhook",
          code: "SPACEBOT_POLL_HTTP_ERROR",
          message: `Spacebot webhook poll failed with status ${pollResponse.status}.`,
          details: {
            pollUrl,
            status: pollResponse.status,
          },
        })
      }

      pollPayload = (await pollResponse.json().catch(() => ({}))) as SpacebotPollResponse
    } catch (error) {
      if (error instanceof RuntimeProviderError) {
        throw error
      }

      throw createRecoverableRuntimeError({
        provider: "spacebot-webhook",
        code: "SPACEBOT_POLL_FAILED",
        message: `Spacebot webhook poll request failed: ${(error as Error)?.message || "Unknown error"}`,
        details: {
          pollUrl,
        },
      })
    }

    const extracted = extractSpacebotText(pollPayload)

    if (extracted.immediateTexts.length > 0) {
      return {
        provider: "spacebot-webhook",
        output: extracted.immediateTexts.join("\n"),
        fallbackUsed: false,
        metadata: {
          baseUrl,
          conversationId,
          polls,
        },
      }
    }

    if (extracted.streamChunks.length > 0) {
      streamedChunks.push(...extracted.streamChunks)
    }

    if (extracted.streamEnded && streamedChunks.length > 0) {
      return {
        provider: "spacebot-webhook",
        output: streamedChunks.join(""),
        fallbackUsed: false,
        metadata: {
          baseUrl,
          conversationId,
          polls,
          streaming: true,
        },
      }
    }

    await sleep(pollIntervalMs)
  }

  if (streamedChunks.length > 0) {
    return {
      provider: "spacebot-webhook",
      output: streamedChunks.join(""),
      fallbackUsed: false,
      metadata: {
        baseUrl,
        conversationId,
        timeoutMs,
        partial: true,
      },
    }
  }

  throw createRecoverableRuntimeError({
    provider: "spacebot-webhook",
    code: "SPACEBOT_TIMEOUT",
    message: `Spacebot webhook timed out after ${timeoutMs}ms without response output.`,
    details: {
      baseUrl,
      conversationId,
      pollUrl,
      timeoutMs,
    },
  })
}

export async function probeSpacebotWebhookHealth(baseUrl = spacebotWebhookBaseUrl()): Promise<{
  ok: boolean
  status: number | null
  url: string
  error?: string
}> {
  const url = `${baseUrl}${spacebotHealthPath()}`

  try {
    const response = await fetch(url, {
      method: "GET",
    })

    return {
      ok: response.ok,
      status: response.status,
      url,
    }
  } catch (error) {
    return {
      ok: false,
      status: null,
      url,
      error: (error as Error)?.message || "Unknown error",
    }
  }
}

export const spacebotWebhookRuntimeProvider: RuntimeProviderDefinition = {
  id: "spacebot-webhook",
  run: runSpacebotWebhook,
}
