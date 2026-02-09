import { prisma } from "@/lib/prisma"
import type { PermissionScope, PermissionStatus } from "@prisma/client"

export interface PermissionRuleLike {
  commandPattern: string
  status: PermissionStatus
  scope: PermissionScope
  subagentId?: string | null
}

export interface PermissionDecision {
  allowed: boolean
  status: PermissionStatus | "none"
  matchedPattern?: string
  matchedScope?: PermissionScope | "none"
  matchedSubagentId?: string | null
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

function normalizeSubagentId(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function resolvePermissionDecision(rule: PermissionRuleLike): PermissionDecision {
  if (rule.status === "allow") {
    return {
      allowed: true,
      status: rule.status,
      matchedPattern: rule.commandPattern,
      matchedScope: rule.scope,
      matchedSubagentId: rule.subagentId || null,
      reason: `Matched allow rule \`${rule.commandPattern}\``,
    }
  }

  if (rule.status === "deny") {
    return {
      allowed: false,
      status: rule.status,
      matchedPattern: rule.commandPattern,
      matchedScope: rule.scope,
      matchedSubagentId: rule.subagentId || null,
      reason: `Matched deny rule \`${rule.commandPattern}\``,
    }
  }

  return {
    allowed: false,
    status: rule.status,
    matchedPattern: rule.commandPattern,
    matchedScope: rule.scope,
    matchedSubagentId: rule.subagentId || null,
    reason: `Matched ask rule \`${rule.commandPattern}\`; explicit approval flow is not implemented in API mode.`,
  }
}

export function evaluateCommandPermissionFromRules(
  candidates: string[],
  rules: PermissionRuleLike[],
  options: { subagentId?: string | null } = {},
): PermissionDecision {
  const filteredCandidates = candidates
    .map((candidate) => candidate?.trim())
    .filter((candidate): candidate is string => Boolean(candidate))

  if (filteredCandidates.length === 0) {
    return {
      allowed: false,
      status: "none",
      matchedScope: "none",
      matchedSubagentId: null,
      reason: "No executable command candidates were provided for permission evaluation.",
    }
  }

  const requestedSubagentId = normalizeSubagentId(options.subagentId)
  const scopedRules =
    requestedSubagentId
      ? rules.filter((rule) => rule.scope === "subagent" && normalizeSubagentId(rule.subagentId) === requestedSubagentId)
      : []
  const fallbackRules = rules.filter((rule) => rule.scope !== "subagent")

  for (const ruleSet of [scopedRules, fallbackRules]) {
    for (const rule of ruleSet) {
      const matched = filteredCandidates.some((candidate) =>
        matchesCommandPattern(rule.commandPattern, candidate)
      )

      if (!matched) {
        continue
      }
      return resolvePermissionDecision(rule)
    }
  }

  return {
    allowed: false,
    status: "none",
    matchedScope: "none",
    matchedSubagentId: requestedSubagentId,
    reason: "No permission rule matched. Add an allow rule to enable execution.",
  }
}

export async function evaluateCommandPermission(
  candidates: string[],
  options: { subagentId?: string | null } = {},
): Promise<PermissionDecision> {
  const permissions = await prisma.permission.findMany({
    where: {
      type: "bash_command",
    },
    orderBy: {
      createdAt: "desc",
    },
  })

  return evaluateCommandPermissionFromRules(candidates, permissions, options)
}
