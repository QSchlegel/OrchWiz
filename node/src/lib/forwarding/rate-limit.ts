interface RateLimiterState {
  requests: number[]
}

const state = new Map<string, RateLimiterState>()

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterMs: number
}

export function takeRateLimitToken(
  key: string,
  limit = Number.parseInt(process.env.FORWARDING_RATE_LIMIT || "60", 10),
  windowMs = Number.parseInt(process.env.FORWARDING_RATE_WINDOW_MS || "60000", 10)
): RateLimitResult {
  const now = Date.now()
  const bucket = state.get(key) || { requests: [] }
  bucket.requests = bucket.requests.filter((timestamp) => now - timestamp < windowMs)

  if (bucket.requests.length >= limit) {
    const oldest = bucket.requests[0] || now
    const retryAfterMs = Math.max(windowMs - (now - oldest), 0)
    state.set(key, bucket)
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs,
    }
  }

  bucket.requests.push(now)
  state.set(key, bucket)

  return {
    allowed: true,
    remaining: Math.max(limit - bucket.requests.length, 0),
    retryAfterMs: 0,
  }
}
