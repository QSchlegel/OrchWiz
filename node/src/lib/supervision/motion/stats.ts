export interface WelfordState {
  mean: number
  m2: number
  count: number
}

export function welfordFromBaseline(args: {
  mean: number | null | undefined
  m2: number | null | undefined
  count: number | null | undefined
}): WelfordState | null {
  const mean = args.mean
  const m2 = args.m2
  const count = args.count

  if (typeof mean !== "number" || !Number.isFinite(mean)) return null
  if (typeof m2 !== "number" || !Number.isFinite(m2)) return null
  if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) return null

  return {
    mean,
    m2,
    count: Math.trunc(count),
  }
}

export function welfordUpdate(prev: WelfordState | null, value: number): WelfordState {
  const x = value
  if (!Number.isFinite(x)) {
    return prev ?? { mean: 0, m2: 0, count: 0 }
  }

  if (!prev || prev.count <= 0) {
    return { mean: x, m2: 0, count: 1 }
  }

  const count = prev.count + 1
  const delta = x - prev.mean
  const mean = prev.mean + delta / count
  const delta2 = x - mean
  const m2 = prev.m2 + delta * delta2
  return { mean, m2, count }
}

export function welfordStdDev(state: WelfordState | null): number | null {
  if (!state || state.count <= 1) {
    return null
  }

  const denom = Math.max(1, state.count - 1)
  const variance = state.m2 / denom
  if (!Number.isFinite(variance) || variance < 0) {
    return null
  }

  return Math.sqrt(variance)
}

export function welfordZScore(state: WelfordState | null, value: number): number | null {
  if (!state || state.count <= 1) {
    return null
  }

  const std = welfordStdDev(state)
  if (std === null) return null

  if (std <= 1e-9) {
    return value === state.mean ? 0 : Number.POSITIVE_INFINITY
  }

  return (value - state.mean) / std
}

export function parseVector(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  const parsed: number[] = []
  for (const entry of value) {
    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      return null
    }
    parsed.push(entry)
  }

  return parsed.length > 0 ? parsed : null
}

export function vectorNorm(value: number[]): number {
  let sum = 0
  for (const entry of value) {
    sum += entry * entry
  }
  return Math.sqrt(sum)
}

export function normalizeVector(value: number[]): number[] | null {
  const norm = vectorNorm(value)
  if (!Number.isFinite(norm) || norm <= 1e-12) {
    return null
  }
  return value.map((entry) => entry / norm)
}

export function cosineSimilarity(a: number[], b: number[]): number | null {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return null
  }

  let dot = 0
  let normA = 0
  let normB = 0
  for (let idx = 0; idx < a.length; idx += 1) {
    dot += a[idx] * b[idx]
    normA += a[idx] * a[idx]
    normB += b[idx] * b[idx]
  }

  if (normA <= 1e-12 || normB <= 1e-12) {
    return null
  }

  return dot / Math.sqrt(normA * normB)
}

export function parseCountMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  const record = value as Record<string, unknown>
  const output: Record<string, number> = {}

  for (const [key, raw] of Object.entries(record)) {
    if (typeof key !== "string" || key.trim().length === 0) {
      continue
    }

    if (typeof raw === "number" && Number.isFinite(raw)) {
      output[key] = raw
      continue
    }

    if (typeof raw === "string") {
      const parsed = Number.parseFloat(raw)
      if (Number.isFinite(parsed)) {
        output[key] = parsed
      }
    }
  }

  return output
}

export function incrementCountMap(map: Record<string, number>, keys: string[]): Record<string, number> {
  const next: Record<string, number> = { ...map }
  for (const key of keys) {
    const normalized = key.trim()
    if (!normalized) continue
    next[normalized] = (next[normalized] ?? 0) + 1
  }
  return next
}

export function dedupeStrings(values: Array<string | null | undefined>): string[] {
  const output: string[] = []
  const seen = new Set<string>()

  for (const value of values) {
    if (typeof value !== "string") continue
    const trimmed = value.trim()
    if (!trimmed) continue
    if (seen.has(trimmed)) continue
    seen.add(trimmed)
    output.push(trimmed)
  }

  output.sort((a, b) => a.localeCompare(b))
  return output
}

