import crypto from "node:crypto"
import type { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { AccessControlError, type AccessActor, requireAccessActor } from "@/lib/security/access-control"
import { readRequestedUserId } from "@/lib/shipyard/api-auth"
import { parseShipyardUserApiKey, verifyShipyardUserApiKey } from "@/lib/shipyard/user-api-keys"

export interface ShipyardRequestActor extends AccessActor {
  authType: "session" | "user_api_key" | "legacy_token"
  keyId?: string
  requestedUserId?: string
  impersonated?: boolean
}

interface ParsedBearerToken {
  present: boolean
  token: string | null
}

export interface RequireShipyardRequestActorOptions {
  allowLegacyTokenAuth?: boolean
  body?: Record<string, unknown>
}

export interface ShipyardRequestActorDeps {
  requireSessionActor: () => Promise<AccessActor>
  findApiKeyByKeyId: (keyId: string) => Promise<{
    id: string
    keyId: string
    keyHash: string
    revokedAt: Date | null
    user: {
      id: string
      email: string | null
      role: "captain" | "admin"
    }
  } | null>
  touchApiKeyLastUsedAt: (id: string) => Promise<void>
  findUserById: (userId: string) => Promise<{
    id: string
    email: string | null
    role: "captain" | "admin"
  } | null>
}

const defaultDeps: ShipyardRequestActorDeps = {
  requireSessionActor: requireAccessActor,
  findApiKeyByKeyId: async (keyId) =>
    prisma.shipyardApiKey.findUnique({
      where: {
        keyId,
      },
      select: {
        id: true,
        keyId: true,
        keyHash: true,
        revokedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
    }),
  touchApiKeyLastUsedAt: async (id) => {
    await prisma.shipyardApiKey.update({
      where: {
        id,
      },
      data: {
        lastUsedAt: new Date(),
      },
    })
  },
  findUserById: async (userId) =>
    prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        email: true,
        role: true,
      },
    }),
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseConfiguredUserIdSet(value: string | undefined): Set<string> {
  if (!value) {
    return new Set()
  }

  return new Set(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  )
}

function parseBearerToken(authorizationHeader: string | null): ParsedBearerToken {
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

async function resolveActorFromUserApiKey(
  token: string,
  deps: ShipyardRequestActorDeps,
): Promise<ShipyardRequestActor | null> {
  const parsed = parseShipyardUserApiKey(token)
  if (!parsed) {
    return null
  }

  const key = await deps.findApiKeyByKeyId(parsed.keyId)

  if (!key || key.revokedAt) {
    return null
  }

  if (!verifyShipyardUserApiKey(token, key.keyHash)) {
    return null
  }

  await deps.touchApiKeyLastUsedAt(key.id)

  return {
    userId: key.user.id,
    email: key.user.email,
    role: key.user.role,
    isAdmin: key.user.role === "admin",
    authType: "user_api_key",
    keyId: key.keyId,
  }
}

async function resolveActorFromLegacyToken(args: {
  request: NextRequest
  token: string | null
  body?: Record<string, unknown>
  deps: ShipyardRequestActorDeps
}): Promise<ShipyardRequestActor> {
  const expected = asNonEmptyString(process.env.SHIPYARD_API_TOKEN)
  if (!expected || !args.token || !timingSafeEqualStrings(args.token, expected)) {
    throw new AccessControlError("Unauthorized", 401, "UNAUTHORIZED")
  }

  const requestedUserId = readRequestedUserId(args.request, args.body)
  if (!requestedUserId) {
    throw new AccessControlError(
      "Token-authenticated Ship Yard requests require userId (body, query, or x-orchwiz-user-id header).",
      400,
      "BAD_REQUEST",
    )
  }

  const user = await args.deps.findUserById(requestedUserId)

  if (!user) {
    throw new AccessControlError("User not found", 404, "NOT_FOUND")
  }

  const enforcedUserId = asNonEmptyString(process.env.SHIPYARD_API_TOKEN_USER_ID)
  if (enforcedUserId && requestedUserId !== enforcedUserId) {
    throw new AccessControlError(
      "Token-authenticated requests are restricted to configured userId",
      403,
      "FORBIDDEN",
    )
  }

  const allowedUserIds = parseConfiguredUserIdSet(process.env.SHIPYARD_API_ALLOWED_USER_IDS)
  if (allowedUserIds.size > 0 && !allowedUserIds.has(requestedUserId)) {
    throw new AccessControlError(
      "Token-authenticated requests are restricted by allowlist",
      403,
      "FORBIDDEN",
    )
  }

  const allowImpersonation = process.env.SHIPYARD_API_ALLOW_IMPERSONATION === "true"
  if (!allowImpersonation) {
    const fallbackUserId = enforcedUserId || asNonEmptyString(process.env.SHIPYARD_API_DEFAULT_USER_ID)
    if (fallbackUserId && requestedUserId !== fallbackUserId) {
      throw new AccessControlError(
        "Token-authenticated impersonation is disabled",
        403,
        "FORBIDDEN",
      )
    }
  }

  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    isAdmin: user.role === "admin",
    authType: "legacy_token",
    requestedUserId,
    impersonated: true,
  }
}

export async function requireShipyardRequestActor(
  request: NextRequest,
  options: RequireShipyardRequestActorOptions = {},
  deps: ShipyardRequestActorDeps = defaultDeps,
): Promise<ShipyardRequestActor> {
  const parsedBearer = parseBearerToken(request.headers.get("authorization"))

  if (parsedBearer.present) {
    if (parsedBearer.token) {
      const apiKeyActor = await resolveActorFromUserApiKey(parsedBearer.token, deps)
      if (apiKeyActor) {
        return apiKeyActor
      }
    }

    if (options.allowLegacyTokenAuth) {
      return resolveActorFromLegacyToken({
        request,
        token: parsedBearer.token,
        body: options.body,
        deps,
      })
    }

    throw new AccessControlError("Unauthorized", 401, "UNAUTHORIZED")
  }

  const actor = await deps.requireSessionActor()
  return {
    ...actor,
    authType: "session",
  }
}
