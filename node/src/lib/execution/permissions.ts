import { prisma } from "@/lib/prisma"
import type { PermissionStatus } from "@prisma/client"

export interface PermissionDecision {
  allowed: boolean
  status: PermissionStatus | "none"
  matchedPattern?: string
  reason: string
}

function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".")
  return new RegExp(`^${escaped}$`, "i")
}

export function matchesCommandPattern(pattern: string, candidate: string): boolean {
  const normalized = candidate.trim()
  if (!normalized) {
    return false
  }

  try {
    return wildcardToRegExp(pattern).test(normalized)
  } catch {
    return pattern.toLowerCase() === normalized.toLowerCase()
  }
}

export async function evaluateCommandPermission(candidates: string[]): Promise<PermissionDecision> {
  const filteredCandidates = candidates
    .map((candidate) => candidate?.trim())
    .filter((candidate): candidate is string => Boolean(candidate))

  if (filteredCandidates.length === 0) {
    return {
      allowed: false,
      status: "none",
      reason: "No executable command candidates were provided for permission evaluation.",
    }
  }

  const permissions = await prisma.permission.findMany({
    where: {
      type: "bash_command",
    },
    orderBy: {
      createdAt: "desc",
    },
  })

  for (const permission of permissions) {
    const matched = filteredCandidates.some((candidate) =>
      matchesCommandPattern(permission.commandPattern, candidate)
    )

    if (!matched) {
      continue
    }

    if (permission.status === "allow") {
      return {
        allowed: true,
        status: permission.status,
        matchedPattern: permission.commandPattern,
        reason: `Matched allow rule \`${permission.commandPattern}\``,
      }
    }

    if (permission.status === "deny") {
      return {
        allowed: false,
        status: permission.status,
        matchedPattern: permission.commandPattern,
        reason: `Matched deny rule \`${permission.commandPattern}\``,
      }
    }

    return {
      allowed: false,
      status: permission.status,
      matchedPattern: permission.commandPattern,
      reason: `Matched ask rule \`${permission.commandPattern}\`; explicit approval flow is not implemented in API mode.`,
    }
  }

  return {
    allowed: false,
    status: "none",
    reason: "No permission rule matched. Add an allow rule to enable execution.",
  }
}
