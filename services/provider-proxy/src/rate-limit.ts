interface RateBucket {
  timestamps: number[]
}

interface ConcurrencyBucket {
  count: number
}

const rateBuckets = new Map<string, RateBucket>()
const concurrencyBuckets = new Map<string, ConcurrencyBucket>()
let globalConcurrentStreams = 0

export interface StreamLimitConfig {
  streamRateLimit: number
  streamRateWindowMs: number
  streamMaxConcurrent: number
  enforce: boolean
}

export interface RateLimitResult {
  allowed: boolean
  wouldExceed: boolean
  retryAfterSeconds: number
}

export interface ConcurrencyLimitResult {
  allowed: boolean
  wouldExceed: boolean
  release: () => void
  retryAfterSeconds: number
  globalConcurrentStreams: number
  keyConcurrentStreams: number
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

export function resolveStreamLimitConfig(): StreamLimitConfig {
  return {
    streamRateLimit: parsePositiveInteger(process.env.PROVIDER_PROXY_STREAM_RATE_LIMIT, 30),
    streamRateWindowMs: parsePositiveInteger(process.env.PROVIDER_PROXY_STREAM_RATE_WINDOW_MS, 60_000),
    streamMaxConcurrent: parsePositiveInteger(process.env.PROVIDER_PROXY_STREAM_MAX_CONCURRENT, 20),
    enforce: process.env.PROVIDER_PROXY_STREAM_LIMITS_ENFORCE === "true",
  }
}

export function takeStreamRateLimitToken(
  key: string,
  config: StreamLimitConfig = resolveStreamLimitConfig(),
): RateLimitResult {
  const now = Date.now()
  const bucket = rateBuckets.get(key) || { timestamps: [] }
  bucket.timestamps = bucket.timestamps.filter((timestamp) => now - timestamp < config.streamRateWindowMs)

  const nextCount = bucket.timestamps.length + 1
  const wouldExceed = nextCount > config.streamRateLimit
  if (wouldExceed && config.enforce) {
    const oldest = bucket.timestamps[0] ?? now
    const retryAfterMs = Math.max(config.streamRateWindowMs - (now - oldest), 1_000)
    rateBuckets.set(key, bucket)
    return {
      allowed: false,
      wouldExceed: true,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    }
  }

  bucket.timestamps.push(now)
  rateBuckets.set(key, bucket)
  return {
    allowed: true,
    wouldExceed,
    retryAfterSeconds: 1,
  }
}

export function acquireStreamConcurrencySlot(
  key: string,
  config: StreamLimitConfig = resolveStreamLimitConfig(),
): ConcurrencyLimitResult {
  const keyBucket = concurrencyBuckets.get(key) || { count: 0 }
  const nextKeyCount = keyBucket.count + 1
  const nextGlobalCount = globalConcurrentStreams + 1
  const wouldExceed = nextGlobalCount > config.streamMaxConcurrent

  if (wouldExceed && config.enforce) {
    return {
      allowed: false,
      wouldExceed: true,
      release: () => {
        // no-op
      },
      retryAfterSeconds: 2,
      globalConcurrentStreams,
      keyConcurrentStreams: keyBucket.count,
    }
  }

  keyBucket.count = nextKeyCount
  concurrencyBuckets.set(key, keyBucket)
  globalConcurrentStreams = nextGlobalCount

  let released = false
  const release = () => {
    if (released) {
      return
    }
    released = true

    const current = concurrencyBuckets.get(key)
    if (current) {
      current.count = Math.max(0, current.count - 1)
      if (current.count === 0) {
        concurrencyBuckets.delete(key)
      } else {
        concurrencyBuckets.set(key, current)
      }
    }

    globalConcurrentStreams = Math.max(0, globalConcurrentStreams - 1)
  }

  return {
    allowed: true,
    wouldExceed,
    release,
    retryAfterSeconds: 2,
    globalConcurrentStreams,
    keyConcurrentStreams: nextKeyCount,
  }
}

export function resetStreamLimiterState(): void {
  rateBuckets.clear()
  concurrencyBuckets.clear()
  globalConcurrentStreams = 0
}
