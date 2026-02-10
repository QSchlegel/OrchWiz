import crypto from "node:crypto"
import type { NextRequest } from "next/server"

export type ShipyardApiActor =
  | {
      type: "token"
      userId: string
    }
  | {
      type: "session"
      userId: string
    }

export type ShipyardApiActorResolution =
  | {
      ok: true
      actor: ShipyardApiActor
    }
  | {
      ok: false
      status: number
      error: string
    }

interface ResolveShipyardApiActorOptions {
  shipyardApiToken?: string | null
  body?: Record<string, unknown>
  getSessionUserId: () => Promise<string | null>
  userExists: (userId: string) => Promise<boolean>
}

function asNonEmptyString(value: unknown): string | null {
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
    token: asNonEmptyString(match[1]),
  }
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a, "utf8")
  const bBuffer = Buffer.from(b, "utf8")
  if (aBuffer.length !== bBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer)
}

export function readRequestedUserId(
  request: NextRequest,
  body?: Record<string, unknown>,
): string | null {
  const fromBody = asNonEmptyString(body?.userId)
  if (fromBody) {
    return fromBody
  }

  const fromQuery = asNonEmptyString(request.nextUrl.searchParams.get("userId"))
  if (fromQuery) {
    return fromQuery
  }

  return asNonEmptyString(request.headers.get("x-orchwiz-user-id"))
}

export async function resolveShipyardApiActorFromRequest(
  request: NextRequest,
  options: ResolveShipyardApiActorOptions,
): Promise<ShipyardApiActorResolution> {
  const parsed = parseBearerToken(request.headers.get("authorization"))

  if (parsed.present) {
    const expected = asNonEmptyString(options.shipyardApiToken)
    if (!expected || !parsed.token || !timingSafeEqualStrings(parsed.token, expected)) {
      return {
        ok: false,
        status: 401,
        error: "Unauthorized",
      }
    }

    const requestedUserId = readRequestedUserId(request, options.body)
    if (!requestedUserId) {
      return {
        ok: false,
        status: 400,
        error:
          "Token-authenticated Ship Yard requests require userId (body, query, or x-orchwiz-user-id header).",
      }
    }

    const exists = await options.userExists(requestedUserId)
    if (!exists) {
      return {
        ok: false,
        status: 404,
        error: "User not found",
      }
    }

    return {
      ok: true,
      actor: {
        type: "token",
        userId: requestedUserId,
      },
    }
  }

  const sessionUserId = asNonEmptyString(await options.getSessionUserId())
  if (!sessionUserId) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized",
    }
  }

  return {
    ok: true,
    actor: {
      type: "session",
      userId: sessionUserId,
    },
  }
}
