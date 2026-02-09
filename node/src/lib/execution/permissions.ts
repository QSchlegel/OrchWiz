import { prisma } from "@/lib/prisma"
import type { PermissionScope, PermissionStatus } from "@prisma/client"
import { loadAssignedPolicyRulesForSubagent } from "./permission-policies"

export interface PermissionRuleLike {
  commandPattern: string
  status: PermissionStatus
  scope: PermissionScope
  subagentId?: string | null
}

export interface PolicyPermissionRuleLike {
  commandPattern: string
  status: PermissionStatus
  policyId: string
  policyName: string
}

export type PermissionMatchSource = "subagent-rule" | "policy-profile" | "fallback-rule" | "none"

export interface PermissionDecision {
  allowed: boolean
  status: PermissionStatus | "none"
  matchedSource: PermissionMatchSource
  matchedPattern?: string
  matchedScope?: PermissionScope | "none"
  matchedSubagentId?: string | null
  matchedPolicyId?: string
  matchedPolicyName?: string
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

function resolvePermissionDecision(rule: PermissionRuleLike, source: PermissionMatchSource): PermissionDecision {
  if (rule.status === "allow") {
    return {
      allowed: true,
      status: rule.status,
      matchedSource: source,
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
      matchedSource: source,
      matchedPattern: rule.commandPattern,
      matchedScope: rule.scope,
      matchedSubagentId: rule.subagentId || null,
      reason: `Matched deny rule \`${rule.commandPattern}\``,
    }
  }

  return {
    allowed: false,
    status: rule.status,
    matchedSource: source,
    matchedPattern: rule.commandPattern,
    matchedScope: rule.scope,
    matchedSubagentId: rule.subagentId || null,
    reason: `Matched ask rule \`${rule.commandPattern}\`; explicit approval flow is not implemented in API mode.`,
  }
}

function resolvePolicyPermissionDecision(
  rule: PolicyPermissionRuleLike,
  requestedSubagentId: string | null,
): PermissionDecision {
  if (rule.status === "allow") {
    return {
      allowed: true,
      status: rule.status,
      matchedSource: "policy-profile",
      matchedPattern: rule.commandPattern,
      matchedScope: "subagent",
      matchedSubagentId: requestedSubagentId,
      matchedPolicyId: rule.policyId,
      matchedPolicyName: rule.policyName,
      reason: `Matched allow rule \`${rule.commandPattern}\` from policy \`${rule.policyName}\``,
    }
  }

  if (rule.status === "deny") {
    return {
      allowed: false,
      status: rule.status,
      matchedSource: "policy-profile",
      matchedPattern: rule.commandPattern,
      matchedScope: "subagent",
      matchedSubagentId: requestedSubagentId,
      matchedPolicyId: rule.policyId,
      matchedPolicyName: rule.policyName,
      reason: `Matched deny rule \`${rule.commandPattern}\` from policy \`${rule.policyName}\``,
    }
  }

  return {
    allowed: false,
    status: rule.status,
    matchedSource: "policy-profile",
    matchedPattern: rule.commandPattern,
    matchedScope: "subagent",
    matchedSubagentId: requestedSubagentId,
    matchedPolicyId: rule.policyId,
    matchedPolicyName: rule.policyName,
    reason: `Matched ask rule \`${rule.commandPattern}\` from policy \`${rule.policyName}\`; explicit approval flow is not implemented in API mode.`,
  }
}

export function evaluateCommandPermissionFromRules(
  candidates: string[],
  rules: PermissionRuleLike[],
  options: { subagentId?: string | null; profileRules?: PolicyPermissionRuleLike[] } = {},
): PermissionDecision {
  const filteredCandidates = candidates
    .map((candidate) => candidate?.trim())
    .filter((candidate): candidate is string => Boolean(candidate))

  if (filteredCandidates.length === 0) {
    return {
      allowed: false,
      status: "none",
      matchedSource: "none",
      matchedScope: "none",
      matchedSubagentId: null,
      reason: "No executable command candidates were provided for permission evaluation.",
    }
  }

  const requestedSubagentId = normalizeSubagentId(options.subagentId)
  const scopedRules = requestedSubagentId
    ? rules.filter(
      (rule) => rule.scope === "subagent" && normalizeSubagentId(rule.subagentId) === requestedSubagentId,
    )
    : []
  const profileRules = requestedSubagentId ? options.profileRules || [] : []
  const fallbackRules = rules.filter((rule) => rule.scope !== "subagent")

  for (const rule of scopedRules) {
    const matched = filteredCandidates.some((candidate) =>
      matchesCommandPattern(rule.commandPattern, candidate)
    )

    if (!matched) {
      continue
    }

    return resolvePermissionDecision(rule, "subagent-rule")
  }

  for (const rule of profileRules) {
    const matched = filteredCandidates.some((candidate) =>
      matchesCommandPattern(rule.commandPattern, candidate)
    )

    if (!matched) {
      continue
    }

    return resolvePolicyPermissionDecision(rule, requestedSubagentId)
  }

  for (const rule of fallbackRules) {
    const matched = filteredCandidates.some((candidate) =>
      matchesCommandPattern(rule.commandPattern, candidate)
    )

    if (!matched) {
      continue
    }

    return resolvePermissionDecision(rule, "fallback-rule")
  }

  return {
    allowed: false,
    status: "none",
    matchedSource: "none",
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

  const requestedSubagentId = normalizeSubagentId(options.subagentId)
  const profileRules = requestedSubagentId
    ? await loadAssignedPolicyRulesForSubagent({
      subagentId: requestedSubagentId,
      type: "bash_command",
    })
    : []

  return evaluateCommandPermissionFromRules(candidates, permissions, {
    subagentId: requestedSubagentId,
    profileRules,
  })
}
