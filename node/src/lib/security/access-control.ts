import type { UserRole } from "@/lib/user-roles"
import { getCurrentSessionUserWithRole } from "@/lib/session-user"

export interface AccessActor {
  userId: string
  email: string | null
  role: UserRole
  isAdmin: boolean
}

export class AccessControlError extends Error {
  status: number
  code: string

  constructor(message: string, status = 403, code = "FORBIDDEN") {
    super(message)
    this.name = "AccessControlError"
    this.status = status
    this.code = code
  }
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function requireAccessActor(): Promise<AccessActor> {
  const sessionUser = await getCurrentSessionUserWithRole()
  if (!sessionUser) {
    throw new AccessControlError("Unauthorized", 401, "UNAUTHORIZED")
  }

  return {
    userId: sessionUser.id,
    email: sessionUser.email,
    role: sessionUser.role,
    isAdmin: sessionUser.role === "admin",
  }
}

export function canReadOwnedResource(args: {
  actor: AccessActor
  ownerUserId: string | null | undefined
  isShared?: boolean | null
  allowSharedRead?: boolean
}): boolean {
  if (args.actor.isAdmin) {
    return true
  }

  const ownerUserId = asNonEmptyString(args.ownerUserId)
  if (!ownerUserId) {
    return false
  }

  if (ownerUserId === args.actor.userId) {
    return true
  }

  if (args.allowSharedRead && args.isShared === true) {
    return true
  }

  return false
}

export function canWriteOwnedResource(args: {
  actor: AccessActor
  ownerUserId: string | null | undefined
}): boolean {
  if (args.actor.isAdmin) {
    return true
  }

  const ownerUserId = asNonEmptyString(args.ownerUserId)
  return Boolean(ownerUserId && ownerUserId === args.actor.userId)
}

export function assertCanReadOwnedResource(args: {
  actor: AccessActor
  ownerUserId: string | null | undefined
  isShared?: boolean | null
  allowSharedRead?: boolean
  notFoundMessage?: string
}): void {
  if (
    !canReadOwnedResource({
      actor: args.actor,
      ownerUserId: args.ownerUserId,
      isShared: args.isShared,
      allowSharedRead: args.allowSharedRead,
    })
  ) {
    throw new AccessControlError(args.notFoundMessage || "Not found", 404, "NOT_FOUND")
  }
}

export function assertCanWriteOwnedResource(args: {
  actor: AccessActor
  ownerUserId: string | null | undefined
  notFoundMessage?: string
}): void {
  if (
    !canWriteOwnedResource({
      actor: args.actor,
      ownerUserId: args.ownerUserId,
    })
  ) {
    throw new AccessControlError(args.notFoundMessage || "Not found", 404, "NOT_FOUND")
  }
}

export function ownerScopedSharedReadWhere(args: {
  actor: AccessActor
  includeShared: boolean
  ownerField?: string
  sharedField?: string
}): Record<string, unknown> {
  if (args.actor.isAdmin) {
    return {}
  }

  const ownerField = args.ownerField || "ownerUserId"
  if (!args.includeShared) {
    return {
      [ownerField]: args.actor.userId,
    }
  }

  const sharedField = args.sharedField || "isShared"
  return {
    OR: [
      {
        [ownerField]: args.actor.userId,
      },
      {
        AND: [
          {
            [sharedField]: true,
          },
          {
            [ownerField]: {
              not: null,
            },
          },
        ],
      },
    ],
  }
}

export function ownerScopedWhere(args: {
  actor: AccessActor
  ownerField?: string
}): Record<string, unknown> {
  if (args.actor.isAdmin) {
    return {}
  }

  return {
    [args.ownerField || "ownerUserId"]: args.actor.userId,
  }
}
