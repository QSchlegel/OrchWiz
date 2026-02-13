import crypto from "node:crypto"
import type { Request, Response } from "express"

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function safeEqual(left: string, right: string): boolean {
  const leftBuf = Buffer.from(left, "utf8")
  const rightBuf = Buffer.from(right, "utf8")
  if (leftBuf.length !== rightBuf.length) {
    return false
  }

  return crypto.timingSafeEqual(leftBuf, rightBuf)
}

export function requireBearerApiKey(
  req: Request,
  res: Response,
  expectedApiKey: string | null,
): boolean {
  const expected = asNonEmptyString(expectedApiKey)
  if (!expected) {
    res.status(503).json({ error: "Provider proxy API key is not configured." })
    return false
  }

  const authHeader = asNonEmptyString(req.header("authorization"))
  const tokenMatch = authHeader?.match(/^Bearer\s+(.+)$/iu)
  const token = tokenMatch?.[1]?.trim()
  if (!token || !safeEqual(token, expected)) {
    res.status(401).json({ error: "Unauthorized" })
    return false
  }

  return true
}

