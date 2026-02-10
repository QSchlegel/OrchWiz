import { defaultAgentSyncNightlyHour } from "./constants"

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {}
  }

  return value as Record<string, unknown>
}

export function parseScope(value: unknown): "selected_agent" | "bridge_crew" {
  return value === "bridge_crew" ? "bridge_crew" : "selected_agent"
}

export function parseTake(value: string | null): number {
  const parsed = Number.parseInt(value || "", 10)
  if (!Number.isFinite(parsed)) {
    return 30
  }

  return Math.max(1, Math.min(100, parsed))
}

export function parseBearerToken(headerValue: string | null): string | null {
  if (!headerValue) {
    return null
  }

  const match = headerValue.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

export function normalizeTimezone(value: unknown): string {
  if (typeof value !== "string") {
    return "UTC"
  }

  const timezone = value.trim()
  if (!timezone) {
    return "UTC"
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date())
    return timezone
  } catch {
    return "UTC"
  }
}

export function normalizeNightlyHour(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10)
  if (!Number.isFinite(parsed)) {
    return defaultAgentSyncNightlyHour()
  }

  return Math.max(0, Math.min(23, Math.round(parsed)))
}

