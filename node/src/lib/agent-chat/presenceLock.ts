export const AGENT_CHAT_LAST_PRESENCE_AT_KEY = "orchwiz:agent-chat:last-presence-at"

export const DEFAULT_LOCK_TIMEOUT_MS = 5 * 60 * 1000
const MIN_LOCK_TIMEOUT_MS = 30 * 1000
const MAX_LOCK_TIMEOUT_MS = 60 * 60 * 1000

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function getAgentChatLockTimeoutMsFromEnv(envValue: string | undefined): number {
  const raw = typeof envValue === "string" ? envValue.trim() : ""
  const parsed = raw.length > 0 ? Number.parseInt(raw, 10) : NaN

  if (!Number.isFinite(parsed)) {
    return DEFAULT_LOCK_TIMEOUT_MS
  }

  return clamp(parsed, MIN_LOCK_TIMEOUT_MS, MAX_LOCK_TIMEOUT_MS)
}

export function shouldLockFromAbsence(args: {
  now: number
  lastPresenceAt: number | null
  timeoutMs: number
}): boolean {
  const { now, lastPresenceAt, timeoutMs } = args

  if (!Number.isFinite(now) || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return false
  }

  if (lastPresenceAt === null || !Number.isFinite(lastPresenceAt)) {
    return false
  }

  const elapsedMs = now - lastPresenceAt
  if (elapsedMs < 0) {
    return false
  }

  return elapsedMs > timeoutMs
}

export function readLastPresenceAt(storage: Storage): number | null {
  try {
    const raw = storage.getItem(AGENT_CHAT_LAST_PRESENCE_AT_KEY)
    if (!raw) return null
    const parsed = Number.parseInt(raw, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  } catch {
    return null
  }
}

export function writeLastPresenceAt(storage: Storage, value: number): void {
  if (!Number.isFinite(value)) {
    return
  }

  try {
    storage.setItem(AGENT_CHAT_LAST_PRESENCE_AT_KEY, `${Math.floor(value)}`)
  } catch {
    // Best-effort only (private mode, storage disabled, etc).
  }
}

