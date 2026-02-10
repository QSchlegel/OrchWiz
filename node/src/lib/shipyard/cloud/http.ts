import type { NextRequest } from "next/server"

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

export function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function asNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null
  }

  return value
}

export async function readJsonBody(request: NextRequest): Promise<Record<string, unknown>> {
  const parsed = await request.json().catch(() => ({}))
  return asRecord(parsed)
}
