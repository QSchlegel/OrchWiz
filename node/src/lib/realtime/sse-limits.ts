interface UserBucket {
  count: number
}

const userBuckets = new Map<string, UserBucket>()
let globalCount = 0

export interface SseLimitConfig {
  perUserMaxStreams: number
  globalMaxStreams: number
  enforce: boolean
}

export interface AcquireSseStreamSlotResult {
  allowed: boolean
  release: () => void
  wouldExceed: boolean
  reason: "PER_USER_LIMIT" | "GLOBAL_LIMIT" | null
  userCount: number
  globalCount: number
  retryAfterSeconds: number
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

export function resolveSseLimitConfig(): SseLimitConfig {
  return {
    perUserMaxStreams: parsePositiveInteger(process.env.ORCHWIZ_SSE_PER_USER_MAX_STREAMS, 5),
    globalMaxStreams: parsePositiveInteger(process.env.ORCHWIZ_SSE_GLOBAL_MAX_STREAMS, 500),
    enforce: process.env.ORCHWIZ_SSE_LIMITS_ENFORCE === "true",
  }
}

export function acquireSseStreamSlot(args: {
  userId: string
  config?: SseLimitConfig
}): AcquireSseStreamSlotResult {
  const config = args.config || resolveSseLimitConfig()
  const userBucket = userBuckets.get(args.userId) || { count: 0 }

  const nextUserCount = userBucket.count + 1
  const nextGlobalCount = globalCount + 1

  const perUserExceeded = nextUserCount > config.perUserMaxStreams
  const globalExceeded = nextGlobalCount > config.globalMaxStreams
  const wouldExceed = perUserExceeded || globalExceeded
  const reason: AcquireSseStreamSlotResult["reason"] = globalExceeded
    ? "GLOBAL_LIMIT"
    : perUserExceeded
      ? "PER_USER_LIMIT"
      : null

  if (wouldExceed && config.enforce) {
    return {
      allowed: false,
      release: () => {
        // no-op
      },
      wouldExceed: true,
      reason,
      userCount: userBucket.count,
      globalCount,
      retryAfterSeconds: 5,
    }
  }

  userBucket.count = nextUserCount
  userBuckets.set(args.userId, userBucket)
  globalCount = nextGlobalCount

  let released = false
  const release = () => {
    if (released) {
      return
    }
    released = true

    const currentBucket = userBuckets.get(args.userId)
    if (currentBucket) {
      currentBucket.count = Math.max(0, currentBucket.count - 1)
      if (currentBucket.count === 0) {
        userBuckets.delete(args.userId)
      } else {
        userBuckets.set(args.userId, currentBucket)
      }
    }

    globalCount = Math.max(0, globalCount - 1)
  }

  return {
    allowed: true,
    release,
    wouldExceed,
    reason,
    userCount: nextUserCount,
    globalCount: nextGlobalCount,
    retryAfterSeconds: 5,
  }
}
