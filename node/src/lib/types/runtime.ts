export const BUILTIN_RUNTIME_PROVIDER_IDS = [
  "openclaw",
  "openai-fallback",
  "local-fallback",
  "codex-cli",
  "spacebot-webhook",
] as const

export type BuiltinRuntimeProvider = (typeof BUILTIN_RUNTIME_PROVIDER_IDS)[number]
export type RuntimeProvider = BuiltinRuntimeProvider | (string & {})

export type RuntimeAdapterProtocol =
  | "internal"
  | "webhook"
  | "openai_compat"
  | "mcp_sse"
  | "mcp_stdio"
  | "cli_exec"

export type RuntimeAdapterActivationStatus = "pending" | "approved" | "denied"
export type RuntimeAdapterBindingScope = "global" | "profile" | "user" | "deployment" | "subagent"

export interface RuntimeAdapterCatalogEntry {
  id: string
  adapterId: string
  name: string
  description: string | null
  protocol: RuntimeAdapterProtocol
  endpoint: string | null
  authRef: string | null
  capabilities: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  isSystem: boolean
  activationStatus: RuntimeAdapterActivationStatus
  activationRationale: string | null
  activatedAt: string | null
  activatedByUserId: string | null
  activatedByBridgeCrewId: string | null
  activationSecurityReportId: string | null
  createdByUserId: string | null
  createdAt: string
  updatedAt: string
}

export interface RuntimeAdapterBinding {
  id: string
  runtimeAdapterId: string
  adapterId: string
  scope: RuntimeAdapterBindingScope
  scopeKey: string
  priority: number
  enabled: boolean
  metadata: Record<string, unknown> | null
  createdByUserId: string | null
  createdAt: string
  updatedAt: string
}

export interface RuntimeSignatureBundle {
  keyRef: string
  signature: string
  algorithm: string
  payloadHash: string
  signedAt: string
  address?: string
  key?: string
}

export interface RuntimeRequest {
  userId?: string
  sessionId: string
  prompt: string
  metadata?: Record<string, unknown>
}

export interface RuntimeResult {
  provider: RuntimeProvider
  output: string
  fallbackUsed: boolean
  metadata?: Record<string, unknown>
  signatureBundle?: RuntimeSignatureBundle
}
