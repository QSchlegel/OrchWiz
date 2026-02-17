import { webcrypto } from "node:crypto"
import WsWebSocket from "ws"
import { BaseApi, type GraphRagOptions, createTrustGraphSocket } from "@trustgraph/client"

const DEFAULT_GRAPH_RAG_OPTIONS: GraphRagOptions = {
  entityLimit: 40,
  tripleLimit: 120,
  maxSubgraphSize: 250,
  pathLength: 3,
}

const DEFAULT_FLOW_ID = "default"
const DEFAULT_COLLECTION = "default"
const DEFAULT_TIMEOUT_MS = 12_000

const MAX_CACHED_SOCKETS = 8
const IDLE_CLOSE_MS = 60_000

type CacheEntry = {
  api: BaseApi
  lastUsedAt: number
  idleTimer: NodeJS.Timeout | null
}

const socketCache = new Map<string, CacheEntry>()

function ensureNodeGlobals(): void {
  const globalAny = globalThis as unknown as Record<string, unknown>

  if (!globalAny.crypto || typeof (globalAny.crypto as { getRandomValues?: unknown }).getRandomValues !== "function") {
    globalAny.crypto = webcrypto as unknown as Crypto
  }

  if (!globalAny.WebSocket) {
    globalAny.WebSocket = WsWebSocket as unknown as typeof WebSocket
  }
}

function trimForPrompt(value: string, maxChars: number): string {
  const trimmed = value.trim()
  if (trimmed.length <= maxChars) {
    return trimmed
  }

  const suffix = "\n...[trimmed]"
  if (maxChars <= suffix.length + 1) {
    return trimmed.slice(0, maxChars)
  }

  return `${trimmed.slice(0, maxChars - suffix.length).trimEnd()}${suffix}`
}

function cacheKey(args: { socketUrl: string; token?: string | null; userId: string }): string {
  return [args.socketUrl.trim(), args.userId, (args.token || "").trim()].join("::")
}

function closeEntry(key: string, entry: CacheEntry): void {
  if (entry.idleTimer) {
    clearTimeout(entry.idleTimer)
  }
  socketCache.delete(key)

  try {
    entry.api.close()
  } catch {
    // Best-effort cleanup only.
  }
}

function scheduleIdleClose(key: string, entry: CacheEntry): void {
  if (entry.idleTimer) {
    clearTimeout(entry.idleTimer)
  }

  entry.idleTimer = setTimeout(() => {
    const current = socketCache.get(key)
    if (current !== entry) {
      return
    }

    closeEntry(key, entry)
  }, IDLE_CLOSE_MS)
}

function evictLeastRecentlyUsed(): void {
  let lruKey: string | null = null
  let lruEntry: CacheEntry | null = null

  for (const [key, entry] of socketCache.entries()) {
    if (!lruEntry || entry.lastUsedAt < lruEntry.lastUsedAt) {
      lruKey = key
      lruEntry = entry
    }
  }

  if (lruKey && lruEntry) {
    closeEntry(lruKey, lruEntry)
  }
}

function getOrCreateSocket(args: { userId: string; socketUrl: string; token?: string | null }): {
  key: string
  api: BaseApi
} {
  ensureNodeGlobals()
  const key = cacheKey(args)
  const existing = socketCache.get(key)
  if (existing) {
    existing.lastUsedAt = Date.now()
    scheduleIdleClose(key, existing)
    return { key, api: existing.api }
  }

  if (socketCache.size >= MAX_CACHED_SOCKETS) {
    evictLeastRecentlyUsed()
  }

  const api = createTrustGraphSocket(args.userId, args.token || undefined, args.socketUrl) as unknown as BaseApi
  const entry: CacheEntry = {
    api,
    lastUsedAt: Date.now(),
    idleTimer: null,
  }
  socketCache.set(key, entry)
  scheduleIdleClose(key, entry)

  return { key, api }
}

function shouldEvictOnError(error: Error): boolean {
  const message = error.message.toLowerCase()
  return (
    message.includes("socket closed")
    || message.includes("connection closed")
    || message.includes("econnrefused")
    || message.includes("enotfound")
    || message.includes("failed to connect")
  )
}

async function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  let timer: NodeJS.Timeout | null = null

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      try {
        onTimeout()
      } catch {
        // ignore
      }

      reject(new Error(`TrustGraph request timed out after ${ms}ms.`))
    }, ms)
  })

  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

export async function resolveTrustGraphGraphRagBlock(args: {
  userId: string
  query: string
  flowId?: string | null
  collection?: string | null
  socketUrl: string
  token?: string | null
  maxChars: number
  timeoutMs?: number
  options?: GraphRagOptions
}): Promise<string> {
  const query = args.query.trim()
  if (!query) {
    throw new Error("TrustGraph query is empty.")
  }

  const socketUrl = args.socketUrl.trim()
  if (!socketUrl) {
    throw new Error("TRUSTGRAPH_SOCKET_URL is required.")
  }

  const flowId = (args.flowId || DEFAULT_FLOW_ID).trim() || DEFAULT_FLOW_ID
  const collection = (args.collection || DEFAULT_COLLECTION).trim() || DEFAULT_COLLECTION
  const options = args.options || DEFAULT_GRAPH_RAG_OPTIONS
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxChars = Math.max(1, args.maxChars)

  const { key, api } = getOrCreateSocket({
    userId: args.userId,
    socketUrl,
    token: args.token,
  })

  try {
    const flow = api.flow(flowId)
    const result = await withTimeout(
      flow.graphRag(query, options, collection),
      timeoutMs,
      () => {
        const entry = socketCache.get(key)
        if (entry) {
          closeEntry(key, entry)
        }
      },
    )

    const lines = [
      "TrustGraph Context (GraphRAG):",
      `Flow: ${flowId}`,
      `Collection: ${collection}`,
      `Query: ${trimForPrompt(query, 240)}`,
      "Result:",
      trimForPrompt(result || "", maxChars) || "(empty)",
    ]

    return lines.join("\n")
  } catch (error) {
    const normalized = error instanceof Error ? error : new Error(String(error))

    if (shouldEvictOnError(normalized)) {
      const entry = socketCache.get(key)
      if (entry) {
        closeEntry(key, entry)
      }
    }

    throw normalized
  }
}

