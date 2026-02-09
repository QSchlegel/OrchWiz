const DEFAULT_SENSITIVE_TRACE_FIELDS = [
  "input.prompt",
  "output.text",
  "tool.args",
  "tool.result",
  "metadata.rawModelIO",
] as const

function envFlag(name: string, fallback = true): boolean {
  const value = process.env[name]
  if (value === undefined) {
    return fallback
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false
  }
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true
  }

  return fallback
}

export function traceEncryptionEnabled(): boolean {
  return envFlag("TRACE_ENCRYPT_ENABLED", true)
}

export function traceEncryptionRequired(): boolean {
  return envFlag("TRACE_ENCRYPT_REQUIRED", true)
}

export function sensitiveTraceFieldPaths(): string[] {
  const configured = process.env.TRACE_ENCRYPT_FIELDS
  if (!configured) {
    return [...DEFAULT_SENSITIVE_TRACE_FIELDS]
  }

  const parsed = configured
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)

  return parsed.length > 0 ? parsed : [...DEFAULT_SENSITIVE_TRACE_FIELDS]
}

export function getValueAtPath(payload: Record<string, unknown>, path: string): unknown {
  const segments = path.split(".").filter(Boolean)
  let current: unknown = payload

  for (const segment of segments) {
    if (!current || typeof current !== "object") {
      return undefined
    }

    current = (current as Record<string, unknown>)[segment]
  }

  return current
}

export function setValueAtPath(payload: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split(".").filter(Boolean)
  if (segments.length === 0) {
    return
  }

  let current: Record<string, unknown> = payload
  const parentSegments = segments.slice(0, -1)
  const leafSegment = segments[segments.length - 1]

  for (const segment of parentSegments) {
    const nextValue = current[segment]
    if (!nextValue || typeof nextValue !== "object" || Array.isArray(nextValue)) {
      current[segment] = {}
    }
    current = current[segment] as Record<string, unknown>
  }

  current[leafSegment] = value
}
