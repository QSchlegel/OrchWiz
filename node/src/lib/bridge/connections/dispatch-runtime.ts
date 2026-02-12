export type BridgeDispatchRuntimeId = "openclaw"

export interface BridgeDispatchRuntimeDescriptor {
  id: BridgeDispatchRuntimeId
  label: string
  description: string
  status: "active" | "planned"
}

export const BRIDGE_DISPATCH_DEFAULT_RUNTIME: BridgeDispatchRuntimeId = "openclaw"

const BRIDGE_DISPATCH_RUNTIME_IDS: readonly BridgeDispatchRuntimeId[] = ["openclaw"]

const BRIDGE_DISPATCH_RUNTIME_DESCRIPTORS: readonly BridgeDispatchRuntimeDescriptor[] = [
  {
    id: "openclaw",
    label: "OpenClaw Gateway",
    description: "Primary dispatch rail for bridge connector outbound delivery.",
    status: "active",
  },
]

function asRuntimeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim().toLowerCase()
  return trimmed.length > 0 ? trimmed : null
}

export function isBridgeDispatchRuntimeId(value: unknown): value is BridgeDispatchRuntimeId {
  return typeof value === "string" && BRIDGE_DISPATCH_RUNTIME_IDS.includes(value as BridgeDispatchRuntimeId)
}

export function listBridgeDispatchRuntimeIds(): BridgeDispatchRuntimeId[] {
  return [...BRIDGE_DISPATCH_RUNTIME_IDS]
}

export function listBridgeDispatchRuntimeDescriptors(): BridgeDispatchRuntimeDescriptor[] {
  return [...BRIDGE_DISPATCH_RUNTIME_DESCRIPTORS]
}

export class BridgeDispatchRuntimeValidationError extends Error {
  supportedRuntimeIds: BridgeDispatchRuntimeId[]

  constructor(value: string) {
    const supportedRuntimeIds = listBridgeDispatchRuntimeIds()
    super(
      `runtime must be one of: ${supportedRuntimeIds.join(", ")}. Received: ${value}.`,
    )
    this.name = "BridgeDispatchRuntimeValidationError"
    this.supportedRuntimeIds = supportedRuntimeIds
  }
}

export function resolveBridgeDispatchRuntime(value: unknown): BridgeDispatchRuntimeId {
  const normalized = asRuntimeString(value)
  if (!normalized || !isBridgeDispatchRuntimeId(normalized)) {
    return BRIDGE_DISPATCH_DEFAULT_RUNTIME
  }

  return normalized
}

export function parseBridgeDispatchRuntimeStrict(value: unknown): BridgeDispatchRuntimeId {
  const normalized = asRuntimeString(value)
  if (!normalized) {
    return BRIDGE_DISPATCH_DEFAULT_RUNTIME
  }

  if (!isBridgeDispatchRuntimeId(normalized)) {
    throw new BridgeDispatchRuntimeValidationError(normalized)
  }

  return normalized
}
