import type { BridgeConnectionProvider } from "@prisma/client"
import type { BridgeConnectionCredentials } from "./validation"
import type { OpenClawBridgeDispatchResult } from "./openclaw-dispatch"
import { dispatchBridgeConnectionViaOpenClaw } from "./openclaw-dispatch"
import type { BridgeDispatchRuntimeId } from "./dispatch-runtime"

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

const BRIDGE_RUNTIME_ADAPTERS: Record<BridgeDispatchRuntimeId, BridgeRuntimeDispatchAdapter> = {
  openclaw: dispatchBridgeConnectionViaOpenClaw,
}

export async function dispatchBridgeConnectionViaRuntime(args: {
  runtimeId: string
  input: BridgeRuntimeDispatchInput
}): Promise<OpenClawBridgeDispatchResult> {
  const adapter = BRIDGE_RUNTIME_ADAPTERS[args.runtimeId as BridgeDispatchRuntimeId]
  if (!adapter) {
    throw new Error(`Unsupported bridge dispatch runtime: ${args.runtimeId}.`)
  }

  return adapter(args.input)
}
