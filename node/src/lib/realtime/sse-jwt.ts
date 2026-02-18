import crypto from "node:crypto"

export const SSE_JWT_SCOPE = "realtime:read"

export interface SseJwtPayload {
  sub: string
  iat: number
  exp: number
  scope: typeof SSE_JWT_SCOPE
  jti: string
  iss?: string
  aud?: string
  types?: string[]
  adm?: boolean
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  return null
}

function normalizeTypes(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  const set = new Set<string>()
  for (const entry of value) {
    const normalized = asNonEmptyString(entry)
    if (!normalized) {
      continue
    }
    set.add(normalized)
  }

  return Array.from(set)
}

function base64UrlEncodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url")
}

function base64UrlDecodeJson(value: string): unknown | null {
  const segment = asNonEmptyString(value)
  if (!segment) {
    return null
  }

  try {
    const decoded = Buffer.from(segment, "base64url").toString("utf8")
    return JSON.parse(decoded) as unknown
  } catch {
    return null
  }
}

function hs256Signature(signingInput: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(signingInput).digest("base64url")
}

function timingSafeEqualString(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a, "utf8")
  const bBuffer = Buffer.from(b, "utf8")
  if (aBuffer.length !== bBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer)
}

export function mintSseJwt(args: {
  userId: string
  secret: string
  ttlSeconds: number
  issuer?: string
  audience?: string
  types?: string[]
  admin?: boolean
  now?: Date
  jti?: string
}): string {
  const now = args.now ?? new Date()
  const iat = Math.floor(now.getTime() / 1000)
  const ttl = Number.isFinite(args.ttlSeconds) && args.ttlSeconds > 0 ? Math.floor(args.ttlSeconds) : 60
  const exp = iat + ttl
  const normalizedTypes =
    Array.isArray(args.types) && args.types.length > 0
      ? Array.from(new Set(args.types.map((entry) => entry.trim()).filter(Boolean)))
      : []

  const header = {
    alg: "HS256",
    typ: "JWT",
  }

  const payload: SseJwtPayload = {
    sub: args.userId,
    iat,
    exp,
    scope: SSE_JWT_SCOPE,
    jti: args.jti || crypto.randomUUID(),
    ...(args.issuer ? { iss: args.issuer } : {}),
    ...(args.audience ? { aud: args.audience } : {}),
    ...(normalizedTypes.length > 0 ? { types: normalizedTypes } : {}),
    ...(args.admin ? { adm: true } : {}),
  }

  const encodedHeader = base64UrlEncodeJson(header)
  const encodedPayload = base64UrlEncodeJson(payload)
  const signingInput = `${encodedHeader}.${encodedPayload}`
  const signature = hs256Signature(signingInput, args.secret)
  return `${signingInput}.${signature}`
}

export function verifySseJwt(
  token: string,
  args: {
    secret: string
    issuer?: string
    audience?: string
    now?: Date
    strictTypes?: boolean
    allowedTypes?: ReadonlySet<string>
  },
): { ok: true; payload: SseJwtPayload } | { ok: false; error: string } {
  const raw = asNonEmptyString(token)
  if (!raw) {
    return { ok: false, error: "Missing token." }
  }

  const parts = raw.split(".")
  if (parts.length !== 3) {
    return { ok: false, error: "Malformed token." }
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts
  const header = base64UrlDecodeJson(encodedHeader)
  const payload = base64UrlDecodeJson(encodedPayload)
  if (!header || !payload || typeof header !== "object" || typeof payload !== "object") {
    return { ok: false, error: "Malformed token." }
  }

  if ((header as Record<string, unknown>).alg !== "HS256") {
    return { ok: false, error: "Unsupported token algorithm." }
  }

  const signingInput = `${encodedHeader}.${encodedPayload}`
  const expectedSignature = hs256Signature(signingInput, args.secret)
  if (!timingSafeEqualString(encodedSignature, expectedSignature)) {
    return { ok: false, error: "Invalid token signature." }
  }

  const payloadRecord = payload as Record<string, unknown>
  const sub = asNonEmptyString(payloadRecord.sub)
  const iat = asNumber(payloadRecord.iat)
  const exp = asNumber(payloadRecord.exp)
  const scope = asNonEmptyString(payloadRecord.scope)
  const jti = asNonEmptyString(payloadRecord.jti)
  if (!sub || iat === null || exp === null || scope !== SSE_JWT_SCOPE || !jti) {
    return { ok: false, error: "Invalid token payload." }
  }

  if (args.issuer) {
    const iss = asNonEmptyString(payloadRecord.iss)
    if (iss !== args.issuer) {
      return { ok: false, error: "Invalid token issuer." }
    }
  }

  if (args.audience) {
    const aud = asNonEmptyString(payloadRecord.aud)
    if (aud !== args.audience) {
      return { ok: false, error: "Invalid token audience." }
    }
  }

  const types = normalizeTypes(payloadRecord.types)
  if (payloadRecord.types !== undefined && types === null) {
    return { ok: false, error: "Invalid token types claim." }
  }

  if (args.strictTypes && types && args.allowedTypes) {
    for (const type of types) {
      if (!args.allowedTypes.has(type)) {
        return { ok: false, error: "Invalid token types claim." }
      }
    }
  }

  const now = args.now ?? new Date()
  const nowSeconds = Math.floor(now.getTime() / 1000)
  if (nowSeconds >= exp) {
    return { ok: false, error: "Token expired." }
  }

  if (iat > nowSeconds + 60) {
    return { ok: false, error: "Token issued in the future." }
  }

  return {
    ok: true,
    payload: {
      sub,
      iat,
      exp,
      scope: SSE_JWT_SCOPE,
      jti,
      ...(typeof payloadRecord.iss === "string" ? { iss: payloadRecord.iss } : {}),
      ...(typeof payloadRecord.aud === "string" ? { aud: payloadRecord.aud } : {}),
      ...(types && types.length > 0 ? { types } : {}),
      ...(payloadRecord.adm === true ? { adm: true } : {}),
    },
  }
}
