import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  configuredRoleForEmail,
  normalizeUserRole,
  type UserRole,
} from "@/lib/user-roles"

export interface SessionUserWithRole {
  id: string
  email: string | null
  role: UserRole
}

export async function getCurrentSessionUserWithRole(): Promise<SessionUserWithRole | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return null
  }

  const databaseUser = await prisma.user.findUnique({
    where: {
      id: session.user.id,
    },
    select: {
      id: true,
      email: true,
      role: true,
    },
  })

  if (!databaseUser) {
    return null
  }

  const effectiveEmail = databaseUser.email || session.user.email || null
  const configuredRole = configuredRoleForEmail(effectiveEmail)

  if (configuredRole && databaseUser.role !== configuredRole) {
    const updatedUser = await prisma.user.update({
      where: {
        id: databaseUser.id,
      },
      data: {
        role: configuredRole,
      },
      select: {
        id: true,
        email: true,
        role: true,
      },
    })

    return {
      id: updatedUser.id,
      email: updatedUser.email || effectiveEmail,
      role: normalizeUserRole(updatedUser.role),
    }
  }

  return {
    id: databaseUser.id,
    email: effectiveEmail,
    role: normalizeUserRole(databaseUser.role),
  }
}
