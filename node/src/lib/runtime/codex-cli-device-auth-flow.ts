export type CodexDeviceAuthFlowState =
  | "idle"
  | "awaiting_authorization"
  | "connected"
  | "timed_out"
  | "error"

export const CODEX_DEVICE_AUTH_PENDING_STORAGE_KEY = "codex_device_auth_pending"
export const DEVICE_AUTH_FAST_POLL_INTERVAL_MS = 2_000
export const DEVICE_AUTH_FAST_WINDOW_MS = 30_000
export const DEVICE_AUTH_SLOW_POLL_INTERVAL_MS = 5_000
export const DEVICE_AUTH_MAX_WAIT_MS = 3 * 60_000

interface CodexDeviceAuthPendingMetadata {
  startedAt: number
}

export interface RestoredCodexDeviceAuthFlow {
  flowState: "idle" | "awaiting_authorization" | "timed_out"
  startedAt: number | null
}

function isValidStartedAt(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

export function createCodexDeviceAuthPendingMetadata(startedAt: number): string {
  return JSON.stringify({ startedAt })
}

export function parseCodexDeviceAuthPendingMetadata(raw: string | null | undefined): CodexDeviceAuthPendingMetadata | null {
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as { startedAt?: unknown }
    if (!isValidStartedAt(parsed.startedAt)) {
      return null
    }

    return { startedAt: parsed.startedAt }
  } catch {
    return null
  }
}

export function isCodexDeviceAuthTimedOut(startedAt: number, now = Date.now()): boolean {
  return now - startedAt >= DEVICE_AUTH_MAX_WAIT_MS
}

export function codexDeviceAuthPollDelayMs(startedAt: number, now = Date.now()): number {
  const elapsed = Math.max(0, now - startedAt)
  return elapsed < DEVICE_AUTH_FAST_WINDOW_MS
    ? DEVICE_AUTH_FAST_POLL_INTERVAL_MS
    : DEVICE_AUTH_SLOW_POLL_INTERVAL_MS
}

export function codexDeviceAuthSecondsRemaining(startedAt: number, now = Date.now()): number {
  const elapsed = Math.max(0, now - startedAt)
  const remaining = Math.max(0, DEVICE_AUTH_MAX_WAIT_MS - elapsed)
  return Math.ceil(remaining / 1_000)
}

export function resolveCodexDeviceAuthFlowState(args: {
  flowState: CodexDeviceAuthFlowState
  startedAt: number | null
  connectorConnected: boolean
  now?: number
}): CodexDeviceAuthFlowState {
  if (args.flowState !== "awaiting_authorization") {
    return args.flowState
  }

  if (args.connectorConnected) {
    return "connected"
  }

  if (!args.startedAt) {
    return "timed_out"
  }

  return isCodexDeviceAuthTimedOut(args.startedAt, args.now) ? "timed_out" : "awaiting_authorization"
}

export function restoreCodexDeviceAuthFlow(raw: string | null | undefined, now = Date.now()): RestoredCodexDeviceAuthFlow {
  const pending = parseCodexDeviceAuthPendingMetadata(raw)
  if (!pending) {
    return { flowState: "idle", startedAt: null }
  }

  if (isCodexDeviceAuthTimedOut(pending.startedAt, now)) {
    return { flowState: "timed_out", startedAt: null }
  }

  return {
    flowState: "awaiting_authorization",
    startedAt: pending.startedAt,
  }
}
