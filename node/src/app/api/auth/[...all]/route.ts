import { auth, createAuth } from "@/lib/auth"
import { toNextJsHandler } from "better-auth/next-js"
import { NextResponse } from "next/server"

export const dynamic = 'force-dynamic'

const defaultHandlers = toNextJsHandler(auth)
const blockedSocialSignInPath = "/api/auth/sign-in/social"
const handlersByOrigin = new Map<string, ReturnType<typeof toNextJsHandler>>()

function isBlockedSocialSignIn(request: Request) {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "")
  return pathname === blockedSocialSignInPath
}

function getHandlersForRequest(request: Request) {
  const requestOrigin = new URL(request.url).origin
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
