import type { RuntimeProvider } from "@/lib/types/runtime"
import {
  isBridgeDispatchRegistryEnabled,
  listBridgeDispatchRuntimeCatalogEntries,
} from "@/lib/runtime/registry"

export type BridgeDispatchRuntimeId = RuntimeProvider

export interface BridgeDispatchRuntimeDescriptor {
  id: BridgeDispatchRuntimeId
  label: string
  description: string
  status: "active" | "planned"
}

export const BRIDGE_DISPATCH_DEFAULT_RUNTIME: BridgeDispatchRuntimeId = "openclaw"

const LEGACY_BRIDGE_DISPATCH_RUNTIME_DESCRIPTORS: readonly BridgeDispatchRuntimeDescriptor[] = [
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

export async function listBridgeDispatchRuntimeDescriptors(): Promise<BridgeDispatchRuntimeDescriptor[]> {
  if (!isBridgeDispatchRegistryEnabled()) {
    return [...LEGACY_BRIDGE_DISPATCH_RUNTIME_DESCRIPTORS]
  }

  const entries = await listBridgeDispatchRuntimeCatalogEntries()
  if (entries.length === 0) {
    return [...LEGACY_BRIDGE_DISPATCH_RUNTIME_DESCRIPTORS]
  }

  const descriptors: BridgeDispatchRuntimeDescriptor[] = entries.map((entry) => ({
    id: entry.adapterId,
    label: entry.name,
    description: entry.description || "Registry-managed bridge dispatch runtime adapter.",
    status: entry.activationStatus === "approved" ? "active" : "planned",
  }))

  const hasDefault = descriptors.some((descriptor) => descriptor.id === BRIDGE_DISPATCH_DEFAULT_RUNTIME)
  if (!hasDefault) {
    descriptors.unshift(...LEGACY_BRIDGE_DISPATCH_RUNTIME_DESCRIPTORS)
  }

  return descriptors
}

export async function listBridgeDispatchRuntimeIds(): Promise<BridgeDispatchRuntimeId[]> {
  const descriptors = await listBridgeDispatchRuntimeDescriptors()
  return descriptors.map((descriptor) => descriptor.id)
}

export class BridgeDispatchRuntimeValidationError extends Error {
  supportedRuntimeIds: BridgeDispatchRuntimeId[]

  constructor(value: string, supportedRuntimeIds: BridgeDispatchRuntimeId[]) {
    super(
      `runtime must be one of: ${supportedRuntimeIds.join(", ")}. Received: ${value}.`,
    )
    this.name = "BridgeDispatchRuntimeValidationError"
    this.supportedRuntimeIds = supportedRuntimeIds
  }
}

export async function isBridgeDispatchRuntimeId(value: unknown): Promise<boolean> {
  if (typeof value !== "string") {
    return false
  }

  const runtimeIds = await listBridgeDispatchRuntimeIds()
  return runtimeIds.includes(value as BridgeDispatchRuntimeId)
}

export async function resolveBridgeDispatchRuntime(value: unknown): Promise<BridgeDispatchRuntimeId> {
  const normalized = asRuntimeString(value)
  if (!normalized || !(await isBridgeDispatchRuntimeId(normalized))) {
    return BRIDGE_DISPATCH_DEFAULT_RUNTIME
  }

  return normalized
}

export async function parseBridgeDispatchRuntimeStrict(value: unknown): Promise<BridgeDispatchRuntimeId> {
  const normalized = asRuntimeString(value)
  if (!normalized) {
    return BRIDGE_DISPATCH_DEFAULT_RUNTIME
  }

  const supportedRuntimeIds = await listBridgeDispatchRuntimeIds()
  if (!supportedRuntimeIds.includes(normalized as BridgeDispatchRuntimeId)) {
    throw new BridgeDispatchRuntimeValidationError(normalized, supportedRuntimeIds)
  }

  return normalized
}
