import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { mintRuntimeJwt, ORCHWIZ_RUNTIME_JWT_COOKIE_NAME } from "@/lib/runtime-jwt"

export const dynamic = "force-dynamic"

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value.trim(), 10)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function parseForwardedHeader(value: string | null): Record<string, string> {
  if (!value) return {}
  const first = value.split(",")[0]?.trim()
  if (!first) return {}
  const out: Record<string, string> = {}
  for (const part of first.split(";")) {
    const [rawKey, rawValue] = part.split("=")
    const key = rawKey?.trim().toLowerCase()
    if (!key) continue
    const nextValue = rawValue?.trim().replace(/^"|"$/gu, "")
    if (!nextValue) continue
    out[key] = nextValue
  }
  return out
}

function firstHeaderValue(value: string | null): string | null {
  if (!value) return null
  const first = value.split(",")[0]?.trim()
  return first && first.length > 0 ? first : null
}

function resolvePublicRequestProto(request: NextRequest): "http" | "https" {
  const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto"))
  if (forwardedProto === "https" || forwardedProto === "http") {
    return forwardedProto
  }

  const forwarded = parseForwardedHeader(request.headers.get("forwarded"))
  const forwardedProtoFromHeader = forwarded.proto?.toLowerCase()
  if (forwardedProtoFromHeader === "https" || forwardedProtoFromHeader === "http") {
    return forwardedProtoFromHeader
  }

  const cfVisitor = firstHeaderValue(request.headers.get("cf-visitor"))
  if (cfVisitor) {
    try {
      const parsed = JSON.parse(cfVisitor) as unknown
      const scheme =
        parsed && typeof parsed === "object" && "scheme" in parsed ? String((parsed as any).scheme) : ""
      if (scheme === "https" || scheme === "http") {
        return scheme
      }
    } catch {
      // ignore invalid cf-visitor
    }
  }

  return request.nextUrl.protocol === "https:" ? "https" : "http"
}

function normalizeCookieDomain(value: string | undefined): string | undefined {
  const raw = asString(value)
  if (!raw) return undefined
  // Allow leading dot for subdomain cookies (e.g. ".orchwiz.example.com").
  const normalized = raw.startsWith(".") ? raw.slice(1) : raw
  // Basic hostname safety: no spaces/semicolons.
  if (!/^[a-z0-9.-]+$/iu.test(normalized)) return undefined
  return raw
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const secret = asString(process.env.ORCHWIZ_RUNTIME_JWT_SECRET)
  if (!secret) {
    return NextResponse.json({ error: "Runtime JWT is not configured." }, { status: 500 })
  }

  const ttlSeconds = parseNumber(process.env.ORCHWIZ_RUNTIME_JWT_TTL_SECONDS) ?? 10 * 60
  const issuer = asString(process.env.ORCHWIZ_RUNTIME_JWT_ISSUER) || "orchwiz"
  const audience = asString(process.env.ORCHWIZ_RUNTIME_JWT_AUDIENCE) || "orchwiz-runtime-edge"

  const token = mintRuntimeJwt({
    userId: session.user.id,
    secret,
    ttlSeconds,
    issuer,
    audience,
  })

  const publicProto = resolvePublicRequestProto(request)
  const secure = publicProto === "https"

  const cookieDomain = normalizeCookieDomain(process.env.ORCHWIZ_RUNTIME_JWT_COOKIE_DOMAIN)
  const sameSiteEnv = asString(process.env.ORCHWIZ_RUNTIME_JWT_COOKIE_SAMESITE)?.toLowerCase()
  const sameSite =
    sameSiteEnv === "none" || sameSiteEnv === "strict" || sameSiteEnv === "lax"
      ? (sameSiteEnv as "none" | "strict" | "lax")
      : "lax"

  const response = NextResponse.json({ ok: true })
  response.cookies.set({
    name: ORCHWIZ_RUNTIME_JWT_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
    ...(cookieDomain ? { domain: cookieDomain } : {}),
    maxAge: ttlSeconds,
  })
  response.headers.set("cache-control", "no-store")
  return response
}

