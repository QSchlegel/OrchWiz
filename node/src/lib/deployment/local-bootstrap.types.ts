export type LocalBootstrapErrorCode =
  | "LOCAL_PROVISIONING_BLOCKED"
  | "LOCAL_BOOTSTRAP_CONFIG_MISSING"
  | "LOCAL_BOOTSTRAP_TOOLS_MISSING"
  | "LOCAL_BOOTSTRAP_INSTALL_DISABLED"
  | "LOCAL_BOOTSTRAP_INSTALL_FAILED"
  | "LOCAL_BOOTSTRAP_CONTEXT_MISSING"
  | "LOCAL_PROVISIONING_FAILED"
  | "LOCAL_BOOTSTRAP_UNSUPPORTED_PLATFORM"

export interface LocalBootstrapFailureDetails {
  missingCommands?: string[]
  missingFiles?: string[]
  missingContext?: string
  suggestedCommands?: string[]
}

export interface LocalBootstrapFailure {
  ok: false
  expected: boolean
  code: LocalBootstrapErrorCode
  error: string
  details?: LocalBootstrapFailureDetails
  metadata?: Record<string, unknown>
}

export interface LocalBootstrapSuccess {
  ok: true
  metadata: Record<string, unknown>
}

export type LocalBootstrapResult = LocalBootstrapSuccess | LocalBootstrapFailure
