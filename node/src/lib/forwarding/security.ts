import crypto from "node:crypto"

const ALLOWED_CLOCK_SKEW_MS = 5 * 60 * 1000

function safeCompareHex(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }

  const bufferA = Buffer.from(a, "hex")
  const bufferB = Buffer.from(b, "hex")
  if (bufferA.length !== bufferB.length) {
    return false
  }

  return crypto.timingSafeEqual(bufferA, bufferB)
}

export function hashApiKey(apiKey: string): string {
  return crypto.createHash("sha256").update(apiKey).digest("hex")
}

export function verifyApiKeyHash(apiKey: string, expectedHash: string): boolean {
  const actual = hashApiKey(apiKey)
  return safeCompareHex(actual, expectedHash)
}

export function signForwardingPayload(timestamp: string, nonce: string, body: string, apiKey: string): string {
  return crypto.createHmac("sha256", apiKey).update(`${timestamp}.${nonce}.${body}`).digest("hex")
}

export function verifyForwardingSignature(
  timestamp: string,
  nonce: string,
  body: string,
  signature: string,
  apiKey: string
): boolean {
  const expected = signForwardingPayload(timestamp, nonce, body, apiKey)
  return safeCompareHex(expected, signature)
}

export function isFreshTimestamp(timestamp: string): boolean {
  const numericTimestamp = Number.parseInt(timestamp, 10)
  if (!Number.isFinite(numericTimestamp)) {
    return false
  }

  const now = Date.now()
  const diff = Math.abs(now - numericTimestamp)
  return diff <= ALLOWED_CLOCK_SKEW_MS
}
