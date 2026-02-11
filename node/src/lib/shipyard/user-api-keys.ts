import crypto from "node:crypto"

export const SHIPYARD_USER_API_KEY_PREFIX = "owz_shipyard_v1"

export interface ShipyardGeneratedApiKey {
  plaintextKey: string
  keyId: string
  keyHash: string
  fingerprint: string
  preview: string
}

export interface ParsedShipyardUserApiKey {
  token: string
  keyId: string
  secret: string
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function randomBase64Url(bytes: number): string {
  return crypto
    .randomBytes(bytes)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "")
}

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

export function hashShipyardUserApiKey(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex")
}

export function parseShipyardUserApiKey(value: unknown): ParsedShipyardUserApiKey | null {
  const token = asNonEmptyString(value)
  if (!token) {
    return null
  }

  const parts = token.split(".")
  if (parts.length !== 3) {
    return null
  }

  const [prefix, keyIdRaw, secretRaw] = parts
  if (prefix !== SHIPYARD_USER_API_KEY_PREFIX) {
    return null
  }

  const keyId = asNonEmptyString(keyIdRaw)
  const secret = asNonEmptyString(secretRaw)
  if (!keyId || !secret) {
    return null
  }

  return {
    token,
    keyId,
    secret,
  }
}

export function verifyShipyardUserApiKey(token: string, expectedHash: string): boolean {
  const actualHash = hashShipyardUserApiKey(token)
  return safeCompareHex(actualHash, expectedHash)
}

export function shipyardUserApiKeyFingerprintFromHash(hash: string): string {
  return hash.slice(0, 12)
}

export function shipyardUserApiKeyPreview(keyId: string): string {
  const compact = keyId.trim()
  const visible = compact.length > 8 ? `${compact.slice(0, 4)}...${compact.slice(-4)}` : compact
  return `${SHIPYARD_USER_API_KEY_PREFIX}.${visible}.********`
}

export function createShipyardUserApiKey(): ShipyardGeneratedApiKey {
  const keyId = randomBase64Url(9)
  const secret = randomBase64Url(24)
  const plaintextKey = `${SHIPYARD_USER_API_KEY_PREFIX}.${keyId}.${secret}`
  const keyHash = hashShipyardUserApiKey(plaintextKey)

  return {
    plaintextKey,
    keyId,
    keyHash,
    fingerprint: shipyardUserApiKeyFingerprintFromHash(keyHash),
    preview: shipyardUserApiKeyPreview(keyId),
  }
}
