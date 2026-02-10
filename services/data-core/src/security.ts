import crypto from "node:crypto"
import type { Request, Response } from "express"

const ALLOWED_SYNC_CLOCK_SKEW_MS = 5 * 60 * 1000

function safeCompareHex(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }

  const left = Buffer.from(a, "hex")
  const right = Buffer.from(b, "hex")
  if (left.length !== right.length) {
    return false
  }

  try {
    return crypto.timingSafeEqual(left, right)
  } catch {
    return false
  }
}

export function requireApiKey(req: Request, res: Response, expectedApiKey: string | null): boolean {
  if (!expectedApiKey) {
    return true
  }

  const provided = req.header("x-data-core-api-key")
  if (!provided || provided !== expectedApiKey) {
    res.status(401).json({ error: "Unauthorized" })
    return false
  }

  return true
}

export function signSyncPayload(timestamp: string, nonce: string, rawBody: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${nonce}.${rawBody}`).digest("hex")
}

function isFreshTimestamp(value: string): boolean {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) {
    return false
  }

  const diff = Math.abs(Date.now() - parsed)
  return diff <= ALLOWED_SYNC_CLOCK_SKEW_MS
}

export function verifySyncRequest(args: {
  timestamp: string | null
  nonce: string | null
  signature: string | null
  rawBody: string
  secret: string | null
}): { ok: boolean; reason?: string } {
  if (!args.secret) {
    return { ok: true }
  }

  if (!args.timestamp || !args.nonce || !args.signature) {
    return { ok: false, reason: "Missing sync signature headers" }
  }

  if (!isFreshTimestamp(args.timestamp)) {
    return { ok: false, reason: "Stale sync timestamp" }
  }

  const expected = signSyncPayload(args.timestamp, args.nonce, args.rawBody, args.secret)
  if (!safeCompareHex(expected, args.signature)) {
    return { ok: false, reason: "Invalid sync signature" }
  }

  return { ok: true }
}
