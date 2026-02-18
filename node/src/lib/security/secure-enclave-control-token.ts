import crypto from "node:crypto"

const DEFAULT_CONTROL_TOKEN_TTL_SECONDS = 5 * 60
const MIN_CONTROL_TOKEN_TTL_SECONDS = 30
const MAX_CONTROL_TOKEN_TTL_SECONDS = 60 * 60

export interface SecureEnclaveControlTokenPayload {
  sub: string
  iat: number
  exp: number
  iss: string
  aud: string
  jti: string
  scope: string[]
  src?: string
  stationKey?: string
  shipDeploymentId?: string
  action?: string
}

export interface SecureEnclaveControlTokenMint {
  token: string
  issuedAt: string
  expiresAt: string
  expiresInSeconds: number
  issuer: string
  audience: string
  scope: string[]
  jti: string
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value.trim(), 10)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

function normalizeScope(scope: unknown): string[] {
  if (!Array.isArray(scope)) {
    return []
  }

  const out: string[] = []
  const seen = new Set<string>()
  for (const entry of scope) {
    if (typeof entry !== "string") {
      continue
    }
    const normalized = entry.trim()
    if (!normalized || seen.has(normalized)) {
      continue
    }
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}

function normalizeTtlSeconds(value: unknown): number {
  const parsed = asFiniteNumber(value)
  if (parsed === null) {
    return DEFAULT_CONTROL_TOKEN_TTL_SECONDS
  }

  const ttl = Math.trunc(parsed)
  if (ttl < MIN_CONTROL_TOKEN_TTL_SECONDS) {
    return MIN_CONTROL_TOKEN_TTL_SECONDS
  }
  if (ttl > MAX_CONTROL_TOKEN_TTL_SECONDS) {
    return MAX_CONTROL_TOKEN_TTL_SECONDS
  }
  return ttl
}

function base64UrlEncodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url")
}

function base64UrlDecodeJson(value: string): unknown | null {
  const raw = asNonEmptyString(value)
  if (!raw) {
    return null
  }

  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8")
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

function defaultIssuer(): string {
  return asNonEmptyString(process.env.SECURE_ENCLAVE_CONTROL_TOKEN_ISSUER) || "orchwiz"
}

function defaultAudience(): string {
  return asNonEmptyString(process.env.SECURE_ENCLAVE_CONTROL_TOKEN_AUDIENCE) || "secure-enclave-control"
}

function defaultTtlSeconds(): number {
  return normalizeTtlSeconds(process.env.SECURE_ENCLAVE_CONTROL_TOKEN_TTL_SECONDS)
}

export function resolveSecureEnclaveControlTokenSecret(): string | null {
  return (
    asNonEmptyString(process.env.SECURE_ENCLAVE_CONTROL_TOKEN_SECRET)
    || asNonEmptyString(process.env.WALLET_ENCLAVE_SHARED_SECRET)
  )
}

export function mintSecureEnclaveControlToken(args: {
  subject: string
  secret: string
  ttlSeconds?: number
  issuer?: string
  audience?: string
  scope?: string[]
  source?: string
  stationKey?: string
  shipDeploymentId?: string
  action?: string
  now?: Date
}): SecureEnclaveControlTokenMint {
  const subject = asNonEmptyString(args.subject)
  if (!subject) {
    throw new Error("subject is required to mint secure enclave control token.")
  }

  const secret = asNonEmptyString(args.secret)
  if (!secret) {
    throw new Error("secret is required to mint secure enclave control token.")
  }

  const now = args.now || new Date()
  const iat = Math.floor(now.getTime() / 1000)
  const ttlSeconds = normalizeTtlSeconds(args.ttlSeconds ?? defaultTtlSeconds())
  const exp = iat + ttlSeconds
  const issuer = asNonEmptyString(args.issuer) || defaultIssuer()
  const audience = asNonEmptyString(args.audience) || defaultAudience()
  const scope = normalizeScope(args.scope)
  const source = asNonEmptyString(args.source)
  const stationKey = asNonEmptyString(args.stationKey)
  const shipDeploymentId = asNonEmptyString(args.shipDeploymentId)
  const action = asNonEmptyString(args.action)
  const jti = crypto.randomUUID()

  const header = {
    alg: "HS256",
    typ: "JWT",
  }

  const payload: SecureEnclaveControlTokenPayload = {
    sub: subject,
    iat,
    exp,
    iss: issuer,
    aud: audience,
    jti,
    scope,
    ...(source ? { src: source } : {}),
    ...(stationKey ? { stationKey } : {}),
    ...(shipDeploymentId ? { shipDeploymentId } : {}),
    ...(action ? { action } : {}),
  }

  const encodedHeader = base64UrlEncodeJson(header)
  const encodedPayload = base64UrlEncodeJson(payload)
  const signingInput = `${encodedHeader}.${encodedPayload}`
  const signature = hs256Signature(signingInput, secret)
  const token = `${signingInput}.${signature}`

  return {
    token,
    issuedAt: new Date(iat * 1000).toISOString(),
    expiresAt: new Date(exp * 1000).toISOString(),
    expiresInSeconds: ttlSeconds,
    issuer,
    audience,
    scope,
    jti,
  }
}

export function verifySecureEnclaveControlToken(
  token: string,
  args: {
    secret: string
    issuer?: string
    audience?: string
    now?: Date
  },
): { ok: true; payload: SecureEnclaveControlTokenPayload } | { ok: false; error: string } {
  const raw = asNonEmptyString(token)
  if (!raw) {
    return { ok: false, error: "Missing token." }
  }

  const secret = asNonEmptyString(args.secret)
  if (!secret) {
    return { ok: false, error: "Missing secret." }
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

  const alg = (header as { alg?: unknown }).alg
  if (alg !== "HS256") {
    return { ok: false, error: "Unsupported token algorithm." }
  }

  const signingInput = `${encodedHeader}.${encodedPayload}`
  const expectedSignature = hs256Signature(signingInput, secret)
  if (!timingSafeEqualString(encodedSignature, expectedSignature)) {
    return { ok: false, error: "Invalid token signature." }
  }

  const subject = asNonEmptyString((payload as { sub?: unknown }).sub)
  const issuer = asNonEmptyString((payload as { iss?: unknown }).iss)
  const audience = asNonEmptyString((payload as { aud?: unknown }).aud)
  const jti = asNonEmptyString((payload as { jti?: unknown }).jti)
  const iat = asFiniteNumber((payload as { iat?: unknown }).iat)
  const exp = asFiniteNumber((payload as { exp?: unknown }).exp)
  const scope = normalizeScope((payload as { scope?: unknown }).scope)

  if (!subject || !issuer || !audience || !jti || iat === null || exp === null) {
    return { ok: false, error: "Invalid token payload." }
  }

  if (args.issuer) {
    const expectedIssuer = asNonEmptyString(args.issuer)
    if (!expectedIssuer || issuer !== expectedIssuer) {
      return { ok: false, error: "Invalid token issuer." }
    }
  }

  if (args.audience) {
    const expectedAudience = asNonEmptyString(args.audience)
    if (!expectedAudience || audience !== expectedAudience) {
      return { ok: false, error: "Invalid token audience." }
    }
  }

  const now = args.now || new Date()
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
      sub: subject,
      iat,
      exp,
      iss: issuer,
      aud: audience,
      jti,
      scope,
      ...(asNonEmptyString((payload as { src?: unknown }).src)
        ? { src: asNonEmptyString((payload as { src?: unknown }).src) || undefined }
        : {}),
      ...(asNonEmptyString((payload as { stationKey?: unknown }).stationKey)
        ? { stationKey: asNonEmptyString((payload as { stationKey?: unknown }).stationKey) || undefined }
        : {}),
      ...(asNonEmptyString((payload as { shipDeploymentId?: unknown }).shipDeploymentId)
        ? { shipDeploymentId: asNonEmptyString((payload as { shipDeploymentId?: unknown }).shipDeploymentId) || undefined }
        : {}),
      ...(asNonEmptyString((payload as { action?: unknown }).action)
        ? { action: asNonEmptyString((payload as { action?: unknown }).action) || undefined }
        : {}),
    },
  }
}
