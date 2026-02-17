import type { BridgeConnectionProvider } from "@prisma/client"
import type { BridgeConnectionCredentials } from "./validation"
import type { OpenClawBridgeDispatchResult } from "./openclaw-dispatch"
import { dispatchBridgeConnectionViaOpenClaw } from "./openclaw-dispatch"
import { resolveRuntimeAdapterByProviderId } from "@/lib/runtime/registry"

export interface BridgeRuntimeDispatchInput {
  deliveryId: string
  provider: BridgeConnectionProvider
  destination: string
  message: string
  config: Record<string, unknown>
  credentials: BridgeConnectionCredentials
  metadata?: Record<string, unknown>
}

type BridgeRuntimeDispatchAdapter = (
  input: BridgeRuntimeDispatchInput,
) => Promise<OpenClawBridgeDispatchResult>

const BUILTIN_BRIDGE_RUNTIME_ADAPTERS: Record<string, BridgeRuntimeDispatchAdapter> = {
  openclaw: dispatchBridgeConnectionViaOpenClaw,
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

function dispatchTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.BRIDGE_DISPATCH_REGISTRY_TIMEOUT_MS || "12000", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 12000
  }

  return parsed
}

async function dispatchBridgeConnectionViaWebhookRuntime(args: {
  endpoint: string
  runtimeId: string
  input: BridgeRuntimeDispatchInput
}): Promise<OpenClawBridgeDispatchResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), dispatchTimeoutMs())

  try {
    const response = await fetch(args.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requestType: "bridge_connection_dispatch.v1",
        runtimeId: args.runtimeId,
        input: args.input,
      }),
      signal: controller.signal,
    })

    const payload = asRecord(await response.json().catch(() => ({})))
    const providerMessageId =
      asString(payload.providerMessageId)
      || asString(payload.messageId)
      || asString(asRecord(payload.data).id)

    return {
      ok: response.ok && payload.ok !== false,
      status: response.status,
      providerMessageId,
      payload,
    }
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      throw new Error(`Dispatch runtime ${args.runtimeId} timed out.`)
    }

    throw new Error(`Dispatch runtime ${args.runtimeId} request failed: ${(error as Error)?.message || "Unknown error"}`)
  } finally {
    clearTimeout(timeout)
  }
}

export async function dispatchBridgeConnectionViaRuntime(args: {
  runtimeId: string
  input: BridgeRuntimeDispatchInput
}): Promise<OpenClawBridgeDispatchResult> {
  const builtin = BUILTIN_BRIDGE_RUNTIME_ADAPTERS[args.runtimeId]
  if (builtin) {
    return builtin(args.input)
  }

  const runtime = await resolveRuntimeAdapterByProviderId(args.runtimeId)
  if (!runtime) {
    throw new Error(`Unsupported bridge dispatch runtime: ${args.runtimeId}.`)
  }

  const capabilities = runtime.capabilities || {}
  if (capabilities.bridgeDispatch !== true) {
    throw new Error(`Bridge dispatch is not enabled for runtime: ${args.runtimeId}.`)
  }

  if (runtime.protocol === "webhook" && runtime.endpoint) {
    return dispatchBridgeConnectionViaWebhookRuntime({
      endpoint: runtime.endpoint,
      runtimeId: runtime.adapterId,
      input: args.input,
    })
  }

  throw new Error(`Unsupported bridge dispatch runtime protocol for ${args.runtimeId}: ${runtime.protocol}.`)
}
