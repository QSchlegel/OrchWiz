export const USER_ROLES = ["captain", "admin"] as const

export type UserRole = (typeof USER_ROLES)[number]

const ROLE_PRIORITY: Record<UserRole, number> = {
  captain: 1,
  admin: 2,
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseConfiguredEmailList(value: string | undefined): Set<string> {
  if (!value) {
    return new Set()
  }

  return new Set(
    value
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0),
  )
}

export function normalizeUserRole(value: unknown, fallback: UserRole = "captain"): UserRole {
  if (value === "admin" || value === "captain") {
    return value
  }

  return fallback
}

export function hasRequiredUserRole(role: UserRole, requiredRole: UserRole): boolean {
  return ROLE_PRIORITY[role] >= ROLE_PRIORITY[requiredRole]
}

export function configuredRoleForEmail(email: string | null | undefined): UserRole | null {
  const normalizedEmail = nonEmptyString(email)?.toLowerCase()
  if (!normalizedEmail) {
    return null
  }

  const adminEmails = parseConfiguredEmailList(process.env.ORCHWIZ_ADMIN_EMAILS)
  if (adminEmails.has(normalizedEmail)) {
    return "admin"
  }

  return null
}
