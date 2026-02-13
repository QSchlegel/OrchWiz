import crypto from "node:crypto"

export const ORCHWIZ_RUNTIME_JWT_COOKIE_NAME = "owz_runtime_jwt"

export interface RuntimeJwtPayload {
  sub: string
  iat: number
  exp: number
  iss?: string
  aud?: string
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  return null
}

function base64UrlEncodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url")
}

function base64UrlDecodeJson(value: string): unknown | null {
  const segment = asNonEmptyString(value)
  if (!segment) return null

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
  const aBuf = Buffer.from(a, "utf8")
  const bBuf = Buffer.from(b, "utf8")
  if (aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}

export function mintRuntimeJwt(args: {
  userId: string
  secret: string
  ttlSeconds: number
  issuer?: string
  audience?: string
  now?: Date
}): string {
  const now = args.now ?? new Date()
  const iat = Math.floor(now.getTime() / 1000)
  const ttl = Number.isFinite(args.ttlSeconds) && args.ttlSeconds > 0 ? Math.floor(args.ttlSeconds) : 600
  const exp = iat + ttl

  const header = {
    alg: "HS256",
    typ: "JWT",
  }

  const payload: RuntimeJwtPayload = {
    sub: args.userId,
    iat,
    exp,
    ...(args.issuer ? { iss: args.issuer } : {}),
    ...(args.audience ? { aud: args.audience } : {}),
  }

  const encodedHeader = base64UrlEncodeJson(header)
  const encodedPayload = base64UrlEncodeJson(payload)
  const signingInput = `${encodedHeader}.${encodedPayload}`
  const signature = hs256Signature(signingInput, args.secret)
  return `${signingInput}.${signature}`
}

export function verifyRuntimeJwt(
  token: string,
  args: {
    secret: string
    issuer?: string
    audience?: string
    now?: Date
  },
): { ok: true; payload: RuntimeJwtPayload } | { ok: false; error: string } {
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

  const alg = (header as any).alg
  if (alg !== "HS256") {
    return { ok: false, error: "Unsupported token algorithm." }
  }

  const signingInput = `${encodedHeader}.${encodedPayload}`
  const expectedSignature = hs256Signature(signingInput, args.secret)
  if (!timingSafeEqualString(encodedSignature, expectedSignature)) {
    return { ok: false, error: "Invalid token signature." }
  }

  const sub = asNonEmptyString((payload as any).sub)
  const iat = asNumber((payload as any).iat)
  const exp = asNumber((payload as any).exp)
  if (!sub || iat === null || exp === null) {
    return { ok: false, error: "Invalid token payload." }
  }

  if (args.issuer) {
    const iss = asNonEmptyString((payload as any).iss)
    if (iss !== args.issuer) {
      return { ok: false, error: "Invalid token issuer." }
    }
  }

  if (args.audience) {
    const aud = asNonEmptyString((payload as any).aud)
    if (aud !== args.audience) {
      return { ok: false, error: "Invalid token audience." }
    }
  }

  const now = args.now ?? new Date()
  const nowSeconds = Math.floor(now.getTime() / 1000)
  if (nowSeconds >= exp) {
    return { ok: false, error: "Token expired." }
  }

  // Basic clock-skew guard: reject tokens issued too far in the future.
  if (iat > nowSeconds + 60) {
    return { ok: false, error: "Token issued in the future." }
  }

  return {
    ok: true,
    payload: {
      sub,
      iat,
      exp,
      ...(typeof (payload as any).iss === "string" ? { iss: (payload as any).iss } : {}),
      ...(typeof (payload as any).aud === "string" ? { aud: (payload as any).aud } : {}),
    },
  }
}

