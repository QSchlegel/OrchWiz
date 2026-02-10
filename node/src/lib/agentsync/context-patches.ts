import type { AgentSyncSuggestionRisk } from "@prisma/client"
import {
  AGENTSYNC_MANAGED_BLOCK_BEGIN,
  AGENTSYNC_MANAGED_BLOCK_END,
  isAgentSyncManagedFile,
  isHighRiskAgentSyncFileName,
  normalizeAgentSyncFileName,
} from "./constants"
import type { AgentSyncRewardAggregate } from "./rewards"

export interface AgentSyncFileSuggestionInput {
  fileName: string
  existingContent: string
  aggregate: AgentSyncRewardAggregate
  subagentName: string
  generatedAt?: Date
}

export interface AgentSyncFileSuggestion {
  fileName: string
  risk: AgentSyncSuggestionRisk
  reason: string
  existingContent: string
  suggestedContent: string
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function upsertManagedBlock(existingContent: string, managedBody: string): string {
  const block = `${AGENTSYNC_MANAGED_BLOCK_BEGIN}\n${managedBody.trim()}\n${AGENTSYNC_MANAGED_BLOCK_END}`
  const blockRegex = new RegExp(
    `${escapeRegExp(AGENTSYNC_MANAGED_BLOCK_BEGIN)}[\\s\\S]*?${escapeRegExp(AGENTSYNC_MANAGED_BLOCK_END)}`,
    "m",
  )

  if (blockRegex.test(existingContent)) {
    return existingContent.replace(blockRegex, block)
  }

  const trimmedExisting = existingContent.trimEnd()
  if (!trimmedExisting) {
    return `${block}\n`
  }

  return `${trimmedExisting}\n\n${block}\n`
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00"
}

function buildReinforcementLines(aggregate: AgentSyncRewardAggregate): string[] {
  const lines: string[] = []

  if (aggregate.trend === "positive") {
    lines.push("Preserve concise, action-first responses that improved recent outcomes.")
    lines.push("Continue explicit owner + next-step handoffs with clear risk signals.")
  } else if (aggregate.trend === "negative") {
    lines.push("Tighten action specificity and reduce ambiguous or speculative instructions.")
    lines.push("Prioritize safer fallbacks earlier when reliability degrades.")
  } else {
    lines.push("Maintain current response discipline while gathering more evidence.")
  }

  if (aggregate.sourceBreakdown.command.meanReward < 0) {
    lines.push("Harden command execution guidance: avoid risky command paths without explicit checks.")
  }

  if (aggregate.sourceBreakdown.verification.meanReward < 0) {
    lines.push("Increase verification readiness framing before claiming completion.")
  }

  if (aggregate.sourceBreakdown.bridge_call.meanReward < 0) {
    lines.push("Shorten bridge-call summaries and escalate blockers with named ownership.")
  }

  return lines.slice(0, 5)
}

function buildWarningLines(aggregate: AgentSyncRewardAggregate): string[] {
  const lines: string[] = []

  if (aggregate.meanReward <= -0.25) {
    lines.push("Recent outcomes indicate regression risk; prioritize conservative execution guidance.")
  }

  if (aggregate.signalCount < 6) {
    lines.push("Evidence volume is still low; avoid overfitting to short-lived fluctuations.")
  }

  if (aggregate.sourceBreakdown.command.count === 0) {
    lines.push("No command execution evidence in the current window.")
  }

  if (aggregate.sourceBreakdown.verification.count === 0) {
    lines.push("No verification evidence in the current window.")
  }

  if (aggregate.sourceBreakdown.bridge_call.count === 0) {
    lines.push("No bridge-call evidence in the current window.")
  }

  return lines.slice(0, 5)
}

function buildManagedBody(args: {
  aggregate: AgentSyncRewardAggregate
  subagentName: string
  generatedAt: Date
  risk: AgentSyncSuggestionRisk
}): string {
  const reinforcementLines = buildReinforcementLines(args.aggregate)
  const warningLines = buildWarningLines(args.aggregate)

  const lines: string[] = [
    "## AgentSync Guidance (Auto-Managed)",
    `- Agent: ${args.subagentName}`,
    `- Updated: ${args.generatedAt.toISOString()}`,
    `- Evidence: ${args.aggregate.signalCount} signals over rolling window`,
    `- Reward: total ${formatNumber(args.aggregate.totalReward)}, mean ${formatNumber(args.aggregate.meanReward)}, trend ${args.aggregate.trend}`,
    `- Source mix: command ${args.aggregate.sourceBreakdown.command.count}, verification ${args.aggregate.sourceBreakdown.verification.count}, bridge_call ${args.aggregate.sourceBreakdown.bridge_call.count}`,
    "",
    "### Reinforce",
    ...reinforcementLines.map((line) => `- ${line}`),
    "",
    "### Watchouts",
    ...(warningLines.length > 0
      ? warningLines.map((line) => `- ${line}`)
      : ["- Continue monitoring for stability; no urgent warnings detected."]
    ),
  ]

  if (args.risk === "high") {
    lines.push("", "### Review Constraint", "- High-risk file: requires manual approval before apply.")
  }

  return lines.join("\n").trim()
}

function suggestionReason(fileName: string, risk: AgentSyncSuggestionRisk): string {
  if (risk === "high") {
    return `${fileName} is classified as high-risk and requires manual review.`
  }

  return `${fileName} is classified as low-risk and can be auto-applied.`
}

export function buildAgentSyncFileSuggestion(input: AgentSyncFileSuggestionInput): AgentSyncFileSuggestion | null {
  const normalizedFileName = normalizeAgentSyncFileName(input.fileName)
  if (!isAgentSyncManagedFile(normalizedFileName)) {
    return null
  }

  const risk: AgentSyncSuggestionRisk = isHighRiskAgentSyncFileName(normalizedFileName) ? "high" : "low"
  const generatedAt = input.generatedAt || new Date()

  const managedBody = buildManagedBody({
    aggregate: input.aggregate,
    subagentName: input.subagentName,
    generatedAt,
    risk,
  })

  const suggestedContent = upsertManagedBlock(input.existingContent, managedBody)
  if (suggestedContent === input.existingContent) {
    return null
  }

  return {
    fileName: normalizedFileName,
    risk,
    reason: suggestionReason(normalizedFileName, risk),
    existingContent: input.existingContent,
    suggestedContent,
  }
}

export function buildAgentSyncSuggestionsForFiles(args: {
  files: Array<{ fileName: string; content: string }>
  aggregate: AgentSyncRewardAggregate
  subagentName: string
  generatedAt?: Date
}): AgentSyncFileSuggestion[] {
  if (args.files.length === 0) {
    return []
  }

  const suggestions: AgentSyncFileSuggestion[] = []
  const generatedAt = args.generatedAt || new Date()

  for (const file of args.files) {
    const suggestion = buildAgentSyncFileSuggestion({
      fileName: file.fileName,
      existingContent: file.content,
      aggregate: args.aggregate,
      subagentName: args.subagentName,
      generatedAt,
    })

    if (suggestion) {
      suggestions.push(suggestion)
    }
  }

  return suggestions
}
