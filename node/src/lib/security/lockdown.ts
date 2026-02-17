import { prisma } from "@/lib/prisma"

function envFlag(name: string, fallback = false): boolean {
  const value = process.env[name]
  if (value === undefined) {
    return fallback
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false
  }
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true
  }

  return fallback
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function getOrCreateSecurityLockdownConfig(args: { ownerUserId: string }) {
  return prisma.securityLockdownConfig.upsert({
    where: {
      ownerUserId: args.ownerUserId,
    },
    create: {
      ownerUserId: args.ownerUserId,
      enabled: false,
    },
    update: {},
  })
}

export async function isSecurityLockdownEnabled(args: { ownerUserId: string }): Promise<{
  enabled: boolean
  reason: string | null
  updatedAt: string
}> {
  if (envFlag("SECURITY_LOCKDOWN_ENABLED", false)) {
    return {
      enabled: true,
      reason: process.env.SECURITY_LOCKDOWN_REASON?.trim() || "env_override",
      updatedAt: new Date().toISOString(),
    }
  }

  const config = await getOrCreateSecurityLockdownConfig({ ownerUserId: args.ownerUserId })
  return {
    enabled: config.enabled,
    reason: config.reason || null,
    updatedAt: config.updatedAt.toISOString(),
  }
}

export async function setSecurityLockdown(args: {
  ownerUserId: string
  enabled: boolean
  reason?: string | null
}) {
  const reason = typeof args.reason === "string" ? asNonEmptyString(args.reason) : null

  const updated = await prisma.securityLockdownConfig.upsert({
    where: {
      ownerUserId: args.ownerUserId,
    },
    create: {
      ownerUserId: args.ownerUserId,
      enabled: args.enabled,
      reason,
    },
    update: {
      enabled: args.enabled,
      reason,
    },
  })

  return {
    enabled: updated.enabled,
    reason: updated.reason || null,
    updatedAt: updated.updatedAt.toISOString(),
  }
}
