import type { NextRequest } from "next/server"
import { normalizeUserRole, type UserRole } from "@/lib/user-roles"

export interface BridgeChatSessionUser {
  id: string
  email?: string | null
  role?: UserRole | string | null
}

export interface BridgeChatSession {
  user: BridgeChatSessionUser
}

export type BridgeChatActor =
  | {
      type: "admin"
      userId?: string
      email?: string | null
      source: "token" | "session"
    }
  | {
      type: "user"
      role: UserRole
      userId: string
      email?: string | null
    }

export type BridgeChatActorResolution =
  | {
      ok: true
      actor: BridgeChatActor
    }
  | {
      ok: false
      status: number
      error: string
    }

interface ResolveBridgeChatActorOptions {
  adminToken?: string | null
  getSession: () => Promise<BridgeChatSession | null>
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseBearerToken(authorizationHeader: string | null): {
  present: boolean
  token: string | null
} {
  if (authorizationHeader === null) {
    return {
      present: false,
      token: null,
    }
  }

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i)
  if (!match) {
    return {
      present: true,
      token: null,
    }
  }

  return {
    present: true,
    token: nonEmptyString(match[1]),
  }
}

export async function resolveBridgeChatActorFromRequest(
  request: NextRequest,
  options: ResolveBridgeChatActorOptions,
): Promise<BridgeChatActorResolution> {
  const parsed = parseBearerToken(request.headers.get("authorization"))

  if (parsed.present) {
    const expected = nonEmptyString(options.adminToken)
    if (!expected || !parsed.token || parsed.token !== expected) {
      return {
        ok: false,
        status: 401,
        error: "Unauthorized",
      }
    }

    return {
      ok: true,
      actor: {
        type: "admin",
        source: "token",
      },
    }
  }

  const session = await options.getSession()
  const userId = nonEmptyString(session?.user?.id)
  if (!userId) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized",
    }
  }

  const role = normalizeUserRole(session?.user?.role)
  if (role === "admin") {
    return {
      ok: true,
      actor: {
        type: "admin",
        source: "session",
        userId,
        email: session?.user?.email,
      },
    }
  }

  return {
    ok: true,
    actor: {
      type: "user",
      role,
      userId,
      email: session?.user?.email,
    },
  }
}

export function readRequestedUserId(request: NextRequest, body?: Record<string, unknown>): string | null {
  const fromBody = nonEmptyString(body?.userId)
  if (fromBody) {
    return fromBody
  }

  const fromQuery = nonEmptyString(request.nextUrl.searchParams.get("userId"))
  if (fromQuery) {
    return fromQuery
  }

  return nonEmptyString(request.headers.get("x-orchwiz-user-id"))
}
