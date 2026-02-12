const SHIP_NOT_FOUND_MESSAGE = "Ship not found"

export const SHIP_NOT_FOUND_CODE = "SHIP_NOT_FOUND" as const

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

export function buildShipNotFoundErrorPayload(message = SHIP_NOT_FOUND_MESSAGE): {
  error: string
  code: typeof SHIP_NOT_FOUND_CODE
} {
  const normalizedMessage = typeof message === "string" && message.trim().length > 0
    ? message.trim()
    : SHIP_NOT_FOUND_MESSAGE

  return {
    error: normalizedMessage,
    code: SHIP_NOT_FOUND_CODE,
  }
}

export function isShipNotFoundApiError(payload: unknown, status?: number | null): boolean {
  const record = asRecord(payload)
  const code = typeof record?.code === "string" ? record.code : null
  if (code === SHIP_NOT_FOUND_CODE) {
    return true
  }

  const error = typeof record?.error === "string" ? record.error.trim().toLowerCase() : null
  return status === 404 && error === SHIP_NOT_FOUND_MESSAGE.toLowerCase()
}
