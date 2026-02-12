import type { BridgeConnectionProvider } from "@prisma/client"
import {
  isBridgeStationKey,
  resolveOpenClawRuntimeUrlForStation,
} from "@/lib/bridge/openclaw-runtime"
import type { BridgeConnectionCredentials } from "./validation"

export interface OpenClawBridgeDispatchInput {
  deliveryId: string
  provider: BridgeConnectionProvider
  destination: string
  message: string
  config: Record<string, unknown>
  credentials: BridgeConnectionCredentials
  metadata?: Record<string, unknown>
}

export interface OpenClawBridgeDispatchResult {
  ok: boolean
  status: number
  providerMessageId: string | null
  payload: Record<string, unknown>
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function openClawDispatchPath(): string {
  const configured = process.env.OPENCLAW_DISPATCH_PATH
  if (!configured || !configured.trim()) {
    return "/v1/message"
  }

  const trimmed = configured.trim()
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`
}

function openClawDispatchTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.OPENCLAW_DISPATCH_TIMEOUT_MS || "12000", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 12000
  }

  return parsed
}

function openClawGatewayUrlFallback(): string {
  const value = asNonEmptyString(process.env.OPENCLAW_GATEWAY_URL)
  if (!value) {
    throw new Error("OPENCLAW_GATEWAY_URL is required for bridge dispatch.")
  }

  return value.replace(/\/+$/u, "")
}

function resolveOpenClawGatewayUrl(input: OpenClawBridgeDispatchInput): string {
  const metadata = asRecord(input.metadata)
  const bridgeContext = asRecord(metadata.bridgeContext)
  const stationKeyRaw = bridgeContext.stationKey
  const payload = asRecord(metadata.payload)
  const shipContext = asRecord(payload.shipContext)
  const namespace = asNonEmptyString(shipContext.namespace)

  if (isBridgeStationKey(stationKeyRaw)) {
    const resolved = resolveOpenClawRuntimeUrlForStation({
      stationKey: stationKeyRaw,
      namespace,
    })
    if (resolved.href) {
      return resolved.href
    }
  }

  return openClawGatewayUrlFallback()
}

export async function dispatchBridgeConnectionViaOpenClaw(
  input: OpenClawBridgeDispatchInput,
): Promise<OpenClawBridgeDispatchResult> {
  const gatewayUrl = resolveOpenClawGatewayUrl(input)
  const path = openClawDispatchPath()
  const timeoutMs = openClawDispatchTimeoutMs()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${gatewayUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.OPENCLAW_API_KEY
          ? { Authorization: `Bearer ${process.env.OPENCLAW_API_KEY}` }
          : {}),
      },
      body: JSON.stringify({
        requestType: "bridge_connection_dispatch.v1",
        deliveryId: input.deliveryId,
        provider: input.provider,
        destination: input.destination,
        message: input.message,
        config: input.config,
        credentials: input.credentials,
        metadata: input.metadata || {},
      }),
      signal: controller.signal,
    })

    const payload = asRecord(await response.json().catch(() => ({})))
    const explicitFailure = payload.ok === false
    const providerMessageId =
      asNonEmptyString(payload.providerMessageId) ||
      asNonEmptyString(payload.messageId) ||
      asNonEmptyString(asRecord(payload.data).id)

    return {
      ok: response.ok && !explicitFailure,
      status: response.status,
      providerMessageId,
      payload,
    }
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new Error(`OpenClaw dispatch timed out after ${timeoutMs}ms.`)
    }

    throw new Error(`OpenClaw dispatch request failed: ${(error as Error).message}`)
  } finally {
    clearTimeout(timeout)
  }
}
