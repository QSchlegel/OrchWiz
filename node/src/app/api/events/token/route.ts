import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { mintSseJwt } from "@/lib/realtime/sse-jwt"
import { getCurrentSessionUserWithRole } from "@/lib/session-user"
import { REALTIME_EVENT_TYPES } from "@/lib/types/realtime"
import { resolveShipyardApiActorFromRequest } from "@/lib/shipyard/api-auth"
import { AccessControlError, requireAccessActor, type AccessActor } from "@/lib/security/access-control"

export const dynamic = "force-dynamic"

interface EventsTokenRequestBody {
  userId?: unknown
  types?: unknown
  ttlSeconds?: unknown
  admin?: unknown
}

export interface EventsTokenRouteDeps {
  now: () => Date
  requireSessionActor: () => Promise<AccessActor>
  resolveMachineActor: (
    request: NextRequest,
    body: Record<string, unknown>,
  ) => Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }>
  secret: () => string | null
  issuer: () => string
  audience: () => string
  defaultTtlSeconds: () => number
  maxTtlSeconds: () => number
  strictTypeValidation: () => boolean
}

const REALTIME_EVENT_TYPE_SET = new Set<string>(REALTIME_EVENT_TYPES)

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function parseBoolean(value: unknown): boolean {
  return value === true
}

function parseTtlSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value)
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value.trim(), 10)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

function parseTypes(value: unknown): { ok: true; types: string[] } | { ok: false; error: string } {
  if (value === undefined || value === null) {
    return {
      ok: true,
      types: [],
    }
  }

  if (!Array.isArray(value)) {
    return {
      ok: false,
      error: "types must be an array of strings.",
    }
  }

  const typeSet = new Set<string>()
  for (const entry of value) {
    const normalized = asNonEmptyString(entry)
    if (!normalized) {
      continue
    }
    typeSet.add(normalized)
  }

  return {
    ok: true,
    types: Array.from(typeSet).sort(),
  }
}

function clampTtlSeconds(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

const defaultDeps: EventsTokenRouteDeps = {
  now: () => new Date(),
  requireSessionActor: () => requireAccessActor(),
  resolveMachineActor: async (request, body) => {
    const resolution = await resolveShipyardApiActorFromRequest(request, {
      shipyardApiToken: process.env.SHIPYARD_API_TOKEN,
      body,
      getSessionUserId: async () => {
        const sessionUser = await getCurrentSessionUserWithRole()
        return sessionUser?.id || null
      },
      userExists: async (userId) => {
        const user = await prisma.user.findUnique({
          where: {
            id: userId,
          },
          select: {
            id: true,
          },
        })
        return Boolean(user?.id)
      },
    })

    if (!resolution.ok) {
      return resolution
    }

    if (resolution.actor.type !== "token") {
      return {
        ok: false as const,
        status: 401,
        error: "Unauthorized",
      }
    }

    return {
      ok: true,
      userId: resolution.actor.userId,
    }
  },
  secret: () => asNonEmptyString(process.env.ORCHWIZ_SSE_JWT_SECRET),
  issuer: () => asNonEmptyString(process.env.ORCHWIZ_SSE_JWT_ISSUER) || "orchwiz",
  audience: () => asNonEmptyString(process.env.ORCHWIZ_SSE_JWT_AUDIENCE) || "orchwiz-sse",
  defaultTtlSeconds: () => {
    const parsed = parseTtlSeconds(process.env.ORCHWIZ_SSE_JWT_TTL_SECONDS)
    return parsed && parsed > 0 ? parsed : 60
  },
  maxTtlSeconds: () => {
    const parsed = parseTtlSeconds(process.env.ORCHWIZ_SSE_JWT_MAX_TTL_SECONDS)
    return parsed && parsed > 0 ? parsed : 300
  },
  strictTypeValidation: () => process.env.ORCHWIZ_SSE_STRICT_TYPE_VALIDATION === "true",
}

export async function handlePostEventsToken(
  request: NextRequest,
  deps: EventsTokenRouteDeps = defaultDeps,
) {
  const body = asRecord(await request.json().catch(() => ({}))) as EventsTokenRequestBody
  const authHeader = request.headers.get("authorization")
  const hasBearerHeader = Boolean(authHeader && authHeader.trim().toLowerCase().startsWith("bearer "))

  let requesterUserId: string
  let requesterIsAdmin = false
  let machineMode = false

  try {
    const actor = await deps.requireSessionActor()
    requesterUserId = actor.userId
    requesterIsAdmin = actor.isAdmin
  } catch (error) {
    if (hasBearerHeader) {
      const machine = await deps.resolveMachineActor(request, asRecord(body))
      if (!machine.ok) {
        return NextResponse.json({ error: machine.error }, { status: machine.status })
      }
      requesterUserId = machine.userId
      machineMode = true
    } else if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    } else {
      const maybeStatus = (error as { status?: unknown } | null)?.status
      const maybeMessage = (error as { message?: unknown } | null)?.message
      if (typeof maybeStatus === "number") {
        return NextResponse.json(
          { error: typeof maybeMessage === "string" ? maybeMessage : "Unauthorized" },
          { status: maybeStatus },
        )
      }
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  const requestedUserId = asNonEmptyString(body.userId)
  if (machineMode && !requestedUserId) {
    return NextResponse.json(
      { error: "Machine token requests must include an explicit userId in the request body." },
      { status: 400 },
    )
  }

  const tokenUserId = requestedUserId || requesterUserId
  if (!requesterIsAdmin && tokenUserId !== requesterUserId) {
    return NextResponse.json(
      { error: "Only admin users can mint SSE tokens for another user." },
      { status: 403 },
    )
  }

  const admin = parseBoolean(body.admin)
  if (admin && !requesterIsAdmin) {
    return NextResponse.json(
      { error: "Only admin users can mint admin SSE tokens." },
      { status: 403 },
    )
  }

  const typesResult = parseTypes(body.types)
  if (!typesResult.ok) {
    return NextResponse.json({ error: typesResult.error }, { status: 400 })
  }
  const types = typesResult.types

  if (deps.strictTypeValidation()) {
    const unsupported = types.filter((type) => !REALTIME_EVENT_TYPE_SET.has(type))
    if (unsupported.length > 0) {
      return NextResponse.json(
        { error: `Unsupported realtime event type(s): ${unsupported.join(", ")}` },
        { status: 400 },
      )
    }
  }

  const requestedTtl = parseTtlSeconds(body.ttlSeconds)
  const ttlSeconds = clampTtlSeconds(
    requestedTtl && requestedTtl > 0 ? requestedTtl : deps.defaultTtlSeconds(),
    1,
    deps.maxTtlSeconds(),
  )

  const secret = deps.secret()
  if (!secret) {
    return NextResponse.json(
      { error: "SSE JWT secret is not configured.", code: "SSE_JWT_SECRET_MISSING" },
      { status: 500 },
    )
  }

  const now = deps.now()
  const token = mintSseJwt({
    userId: tokenUserId,
    secret,
    issuer: deps.issuer(),
    audience: deps.audience(),
    ttlSeconds,
    types,
    admin,
    now,
  })
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString()

  return NextResponse.json({
    token,
    expiresAt,
    userId: tokenUserId,
    types,
    admin,
  })
}

export async function POST(request: NextRequest) {
  return handlePostEventsToken(request)
}
