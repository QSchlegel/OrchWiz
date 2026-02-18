import crypto from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { subscribeRealtimeEvents, toSseChunk } from "@/lib/realtime/events"
import { acquireSseStreamSlot } from "@/lib/realtime/sse-limits"
import { verifySseJwt } from "@/lib/realtime/sse-jwt"
import { getNodeRuntimeMetrics } from "@/lib/runtime/node-metrics"
import { RUNTIME_NODE_METRICS_EVENT_TYPE } from "@/lib/runtime/realtime-node-metrics"
import { AccessControlError, requireAccessActor, type AccessActor } from "@/lib/security/access-control"
import { REALTIME_EVENT_TYPES } from "@/lib/types/realtime"

export const dynamic = "force-dynamic"
const NODE_RUNTIME_METRICS_INTERVAL_MS = 5_000

interface EventsStreamActor {
  userId: string
  isAdmin: boolean
  authType: "session" | "jwt"
  tokenTypes: Set<string> | null
}

export interface EventsStreamRouteDeps {
  requireAccessActor: () => Promise<AccessActor>
  subscribeRealtimeEvents: typeof subscribeRealtimeEvents
  toSseChunk: typeof toSseChunk
  getNodeRuntimeMetrics: typeof getNodeRuntimeMetrics
  verifyToken: (
    token: string,
  ) => { ok: true; actor: EventsStreamActor } | { ok: false; status: number; error: string }
  strictTypeValidation: () => boolean
  enforceCookieOrigin: () => boolean
  now: () => Date
}

const REALTIME_EVENT_TYPE_SET = new Set<string>(REALTIME_EVENT_TYPES)

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseBearerToken(headerValue: string | null): string | null {
  const raw = asNonEmptyString(headerValue)
  if (!raw) {
    return null
  }

  const match = raw.match(/^Bearer\s+(.+)$/i)
  return asNonEmptyString(match?.[1] || null)
}

function parseTypeFilter(raw: string | null): Set<string> {
  return new Set(
    (raw || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  )
}

function intersectsFilters(queryFilter: Set<string>, tokenFilter: Set<string> | null): Set<string> {
  if (!tokenFilter || tokenFilter.size === 0) {
    return queryFilter
  }

  if (queryFilter.size === 0) {
    return new Set(tokenFilter)
  }

  const out = new Set<string>()
  for (const value of queryFilter) {
    if (tokenFilter.has(value)) {
      out.add(value)
    }
  }
  return out
}

function hasCrossSiteOrigin(request: NextRequest): boolean {
  const secFetchSite = request.headers.get("sec-fetch-site")?.toLowerCase()
  if (secFetchSite === "cross-site") {
    return true
  }

  const origin = asNonEmptyString(request.headers.get("origin"))
  if (!origin) {
    return false
  }

  try {
    return new URL(origin).origin !== request.nextUrl.origin
  } catch {
    return true
  }
}

const defaultDeps: EventsStreamRouteDeps = {
  requireAccessActor: () => requireAccessActor(),
  subscribeRealtimeEvents,
  toSseChunk,
  getNodeRuntimeMetrics: () => getNodeRuntimeMetrics(),
  verifyToken: (token) => {
    const secret = asNonEmptyString(process.env.ORCHWIZ_SSE_JWT_SECRET)
    if (!secret) {
      return {
        ok: false,
        status: 503,
        error: "SSE JWT secret is not configured.",
      }
    }

    const strictTypeValidation = process.env.ORCHWIZ_SSE_STRICT_TYPE_VALIDATION === "true"
    const verified = verifySseJwt(token, {
      secret,
      issuer: asNonEmptyString(process.env.ORCHWIZ_SSE_JWT_ISSUER) || "orchwiz",
      audience: asNonEmptyString(process.env.ORCHWIZ_SSE_JWT_AUDIENCE) || "orchwiz-sse",
      strictTypes: strictTypeValidation,
      allowedTypes: REALTIME_EVENT_TYPE_SET,
    })

    if (!verified.ok) {
      return {
        ok: false,
        status: 401,
        error: verified.error,
      }
    }

    return {
      ok: true,
      actor: {
        userId: verified.payload.sub,
        isAdmin: verified.payload.adm === true,
        authType: "jwt",
        tokenTypes:
          Array.isArray(verified.payload.types) && verified.payload.types.length > 0
            ? new Set(verified.payload.types)
            : null,
      },
    }
  },
  strictTypeValidation: () => process.env.ORCHWIZ_SSE_STRICT_TYPE_VALIDATION === "true",
  enforceCookieOrigin: () => process.env.ORCHWIZ_SSE_ENFORCE_COOKIE_ORIGIN === "true",
  now: () => new Date(),
}

export async function handleGetEventsStream(
  request: NextRequest,
  deps: EventsStreamRouteDeps = defaultDeps,
) {
  const queryTypeFilter = parseTypeFilter(request.nextUrl.searchParams.get("types"))
  if (deps.strictTypeValidation()) {
    const unsupportedTypes = Array.from(queryTypeFilter).filter((type) => !REALTIME_EVENT_TYPE_SET.has(type))
    if (unsupportedTypes.length > 0) {
      return NextResponse.json(
        { error: `Unsupported realtime event type(s): ${unsupportedTypes.join(", ")}` },
        { status: 400 },
      )
    }
  }

  const bearerToken = parseBearerToken(request.headers.get("authorization"))
  let actor: EventsStreamActor
  if (bearerToken) {
    const verifiedToken = deps.verifyToken(bearerToken)
    if (!verifiedToken.ok) {
      return NextResponse.json({ error: verifiedToken.error }, { status: verifiedToken.status })
    }
    actor = verifiedToken.actor
  } else {
    let sessionActor: AccessActor
    try {
      sessionActor = await deps.requireAccessActor()
    } catch (error) {
      if (error instanceof AccessControlError) {
        return NextResponse.json({ error: error.message }, { status: error.status })
      }
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    actor = {
      userId: sessionActor.userId,
      isAdmin: sessionActor.isAdmin,
      authType: "session",
      tokenTypes: null,
    }
  }

  if (actor.authType === "session" && deps.enforceCookieOrigin() && hasCrossSiteOrigin(request)) {
    return NextResponse.json(
      { error: "Cross-site cookie-authenticated SSE requests are not allowed." },
      { status: 403 },
    )
  }

  const effectiveTypeFilter = intersectsFilters(queryTypeFilter, actor.tokenTypes)
  const includeRuntimeNodeMetrics = effectiveTypeFilter.has(RUNTIME_NODE_METRICS_EVENT_TYPE)

  const slot = acquireSseStreamSlot({
    userId: actor.userId,
  })
  if (!slot.allowed) {
    return NextResponse.json(
      { error: "Too many SSE streams are currently open for this user." },
      {
        status: 429,
        headers: {
          "Retry-After": String(slot.retryAfterSeconds),
        },
      },
    )
  }
  if (slot.wouldExceed) {
    console.warn(
      `[sse] stream limits exceeded for user=${actor.userId} auth=${actor.authType} reason=${slot.reason} counts user=${slot.userCount} global=${slot.globalCount}`,
    )
  }

  console.info(`[sse] stream opened user=${actor.userId} auth=${actor.authType} admin=${actor.isAdmin}`)

  const encoder = new TextEncoder()
  let unsubscribe: (() => void) | null = null
  let heartbeat: ReturnType<typeof setInterval> | null = null
  let runtimeMetricsTimer: ReturnType<typeof setInterval> | null = null

  const stream = new ReadableStream({
    start(controller) {
      let releasedSlot = false

      const send = (chunk: string) => {
        controller.enqueue(encoder.encode(chunk))
      }

      const cleanup = () => {
        if (!releasedSlot) {
          releasedSlot = true
          slot.release()
          console.info(`[sse] stream closed user=${actor.userId} auth=${actor.authType}`)
        }
        if (heartbeat) {
          clearInterval(heartbeat)
          heartbeat = null
        }
        if (runtimeMetricsTimer) {
          clearInterval(runtimeMetricsTimer)
          runtimeMetricsTimer = null
        }
        if (unsubscribe) {
          unsubscribe()
          unsubscribe = null
        }
      }

      const emitRuntimeNodeMetrics = () => {
        try {
          send(
            deps.toSseChunk({
              id: crypto.randomUUID(),
              type: RUNTIME_NODE_METRICS_EVENT_TYPE,
              timestamp: deps.now().toISOString(),
              userId: actor.userId,
              payload: deps.getNodeRuntimeMetrics(),
            }),
          )
        } catch (error) {
          console.error("Failed to emit runtime node metrics event:", error)
        }
      }

      send(`event: connected\ndata: ${JSON.stringify({ timestamp: deps.now().toISOString() })}\n\n`)

      unsubscribe = deps.subscribeRealtimeEvents((event) => {
        if (effectiveTypeFilter.size > 0 && !effectiveTypeFilter.has(event.type)) {
          return
        }

        if (!actor.isAdmin && event.userId !== actor.userId) {
          return
        }

        send(deps.toSseChunk(event))
      })

      heartbeat = setInterval(() => {
        send(`event: heartbeat\ndata: ${JSON.stringify({ timestamp: deps.now().toISOString() })}\n\n`)
      }, 20000)

      if (includeRuntimeNodeMetrics) {
        emitRuntimeNodeMetrics()
        runtimeMetricsTimer = setInterval(() => {
          emitRuntimeNodeMetrics()
        }, NODE_RUNTIME_METRICS_INTERVAL_MS)
      }

      request.signal.addEventListener("abort", () => {
        cleanup()
        try {
          controller.close()
        } catch {
          // stream can already be closed
        }
      })
    },
    cancel() {
      slot.release()
      if (heartbeat) {
        clearInterval(heartbeat)
        heartbeat = null
      }
      if (runtimeMetricsTimer) {
        clearInterval(runtimeMetricsTimer)
        runtimeMetricsTimer = null
      }
      if (unsubscribe) {
        unsubscribe()
        unsubscribe = null
      }
    },
  })

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, private, no-transform",
      Pragma: "no-cache",
      Connection: "keep-alive",
      "X-Content-Type-Options": "nosniff",
      "X-Accel-Buffering": "no",
      Vary: "Authorization, Cookie, Origin",
    },
  })
}

export async function GET(request: NextRequest) {
  return handleGetEventsStream(request)
}
