import { auth, createAuth } from "@/lib/auth"
import { toNextJsHandler } from "better-auth/next-js"
import { NextResponse } from "next/server"

export const dynamic = 'force-dynamic'

const defaultHandlers = toNextJsHandler(auth)
const blockedSocialSignInPath = "/api/auth/sign-in/social"
const handlersByOrigin = new Map<string, ReturnType<typeof toNextJsHandler>>()

function parseForwardedHeader(value: string | null): Record<string, string> {
  if (!value) {
    return {}
  }

  const first = value.split(",")[0]?.trim()
  if (!first) {
    return {}
  }

  const out: Record<string, string> = {}
  for (const part of first.split(";")) {
    const [rawKey, rawValue] = part.split("=")
    const key = rawKey?.trim().toLowerCase()
    if (!key) {
      continue
    }

    const nextValue = rawValue?.trim().replace(/^"|"$/gu, "")
    if (!nextValue) {
      continue
    }

    out[key] = nextValue
  }

  return out
}

function resolveRequestOrigin(request: Request): string {
  // Next.js can set `request.url` based on the server listen hostname (ex: `0.0.0.0`),
  // which breaks Better Auth passkey RP ID generation. Prefer the public-facing host.
  const forwarded = parseForwardedHeader(request.headers.get("forwarded"))
  const proto =
    request.headers.get("x-forwarded-proto")
    || forwarded.proto
    || null
  const host =
    request.headers.get("x-forwarded-host")
    || forwarded.host
    || request.headers.get("host")
    || null

  if (host) {
    if (proto === "https" || proto === "http") {
      return `${proto}://${host}`
    }
    try {
      const url = new URL(request.url)
      if (url.protocol === "https:" || url.protocol === "http:") {
        return `${url.protocol}//${host}`
      }
    } catch {
      // fall through
    }
    return `http://${host}`
  }

  try {
    return new URL(request.url).origin
  } catch {
    return "http://localhost:3000"
  }
}

function isBlockedSocialSignIn(request: Request) {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "")
  return pathname === blockedSocialSignInPath
}

function getHandlersForRequest(request: Request) {
  const requestOrigin = resolveRequestOrigin(request)
  const existingHandlers = handlersByOrigin.get(requestOrigin)
  if (existingHandlers) {
    return existingHandlers
  }

  const handlers = toNextJsHandler(createAuth(requestOrigin))
  handlersByOrigin.set(requestOrigin, handlers)
  return handlers
}

export async function GET(...args: Parameters<typeof defaultHandlers.GET>) {
  const [request] = args
  if (isBlockedSocialSignIn(request)) {
    return NextResponse.json(
      { error: "GitHub sign-in is disabled. Connect GitHub after signing in." },
      { status: 403 }
    )
  }
  try {
    const handlers = getHandlersForRequest(request)
    return handlers.GET(...args)
  } catch (error) {
    console.error("Auth GET route error:", error)
    const message =
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : error instanceof Error
          ? error.message
          : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(...args: Parameters<typeof defaultHandlers.POST>) {
  const [request] = args
  if (isBlockedSocialSignIn(request)) {
    return NextResponse.json(
      { error: "GitHub sign-in is disabled. Connect GitHub after signing in." },
      { status: 403 }
    )
  }
  try {
    const handlers = getHandlersForRequest(request)
    return handlers.POST(...args)
  } catch (error) {
    console.error("Auth POST route error:", error)
    const message =
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : error instanceof Error
          ? error.message
          : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
