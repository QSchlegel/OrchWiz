export type PostToolUseStatus = "completed" | "failed" | "blocked"

export interface PostToolUseEventInput {
  ownerUserId: string
  toolName: string
  status: PostToolUseStatus
  sessionId?: string | null
  toolUseId?: string | null
  durationMs?: number | null
  input?: unknown
  output?: unknown
  error?: unknown
  metadata?: Record<string, unknown>
  occurredAt?: Date
}

export interface PostToolUseEvent {
  ownerUserId: string
  toolName: string
  status: PostToolUseStatus
  sessionId: string | null
  toolUseId: string | null
  durationMs: number | null
  input: unknown
  output: unknown
  error: unknown
  metadata: Record<string, unknown>
  occurredAt: Date
}

export interface HookExecutionSummary {
  hookId: string
  hookName: string
  status: "completed" | "failed"
  durationMs: number
  error: string | null
}

export interface PostToolUseHookRunResult {
  matchedHooks: number
  delivered: number
  failed: number
  executions: HookExecutionSummary[]
}
