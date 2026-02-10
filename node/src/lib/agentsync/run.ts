import { existsSync } from "node:fs"
import { resolve } from "node:path"
import type {
  AgentSyncFileSyncStatus,
  AgentSyncScope,
  AgentSyncSuggestion,
  AgentSyncSuggestionStatus,
  AgentSyncTrigger,
  Prisma,
  Subagent,
} from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { publishRealtimeEvent } from "@/lib/realtime/events"
import {
  composeContextFilesContent,
  loadSubagentContextFiles,
  persistSubagentContextFiles,
} from "@/lib/subagents/context-files"
import {
  ELIGIBLE_BRIDGE_CREW_CALLSIGNS,
  agentSyncEnabled,
  agentSyncLookbackDays,
  agentSyncMinSignals,
  isAgentSyncManagedFile,
  isEligibleBridgeCrewCallsign,
  isLowRiskAgentSyncFileName,
  normalizeAgentSyncFileName,
} from "./constants"
import { buildAgentSyncSuggestionsForFiles } from "./context-patches"
import { aggregateAgentSyncRewards } from "./rewards"

export class AgentSyncError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = "AgentSyncError"
    this.status = status
  }
}

interface AgentSyncSummary {
  targetedSubagents: number
  processedSubagents: number
  skippedSubagents: number
  appliedSuggestions: number
  proposedSuggestions: number
  failedSubagents: number
  fileSyncFailures: number
}

interface ProcessSubagentResult {
  processed: boolean
  skipped: boolean
  appliedSuggestions: number
  proposedSuggestions: number
  failed: boolean
  fileSyncFailed: boolean
  error?: string
}

function resolveWorkspaceRoot(): string {
  const cwd = process.cwd()
  const direct = resolve(cwd, ".claude/agents")
  if (existsSync(direct)) {
    return cwd
  }

  const parent = resolve(cwd, "..")
  const parentAgentsRoot = resolve(parent, ".claude/agents")
  if (existsSync(parentAgentsRoot)) {
    return parent
  }

  return cwd
}

function isEligibleBridgeCrewSubagent(subagent: Pick<Subagent, "name" | "isShared">): boolean {
  if (subagent.isShared) {
    return false
  }

  return isEligibleBridgeCrewCallsign(subagent.name)
}

async function listEligibleBridgeCrewSubagents(userId: string): Promise<Subagent[]> {
  return prisma.subagent.findMany({
    where: {
      isShared: false,
      ownerUserId: userId,
      name: {
        in: ELIGIBLE_BRIDGE_CREW_CALLSIGNS,
      },
    },
    orderBy: {
      name: "asc",
    },
  })
}

async function resolveTargetSubagents(args: {
  userId: string
  scope: AgentSyncScope
  subagentId?: string | null
}): Promise<Subagent[]> {
  if (args.scope === "selected_agent") {
    if (!args.subagentId) {
      throw new AgentSyncError("subagentId is required for selected_agent scope", 400)
    }

    const selected = await prisma.subagent.findFirst({
      where: {
        id: args.subagentId,
        ownerUserId: args.userId,
      },
    })

    if (!selected || !isEligibleBridgeCrewSubagent(selected)) {
      throw new AgentSyncError("Selected subagent is not an eligible personal bridge crew agent", 404)
    }

    return [selected]
  }

  return listEligibleBridgeCrewSubagents(args.userId)
}

function toEditableFiles(files: Array<{ fileName: string; content: string }>): Array<{ fileName: string; content: string }> {
  const deduped = new Map<string, { fileName: string; content: string }>()

  for (const file of files) {
    deduped.set(normalizeAgentSyncFileName(file.fileName), {
      fileName: normalizeAgentSyncFileName(file.fileName),
      content: file.content,
    })
  }

  return [...deduped.values()]
}

export function splitAgentSyncSuggestionsByRisk<T extends { fileName: string }>(suggestions: T[]): {
  lowRiskSuggestions: T[]
  highRiskSuggestions: T[]
} {
  const lowRiskSuggestions = suggestions.filter((suggestion) => isLowRiskAgentSyncFileName(suggestion.fileName))
  const highRiskSuggestions = suggestions.filter((suggestion) => !isLowRiskAgentSyncFileName(suggestion.fileName))

  return {
    lowRiskSuggestions,
    highRiskSuggestions,
  }
}

async function markSuggestions(
  suggestionIds: string[],
  data: {
    status?: AgentSyncSuggestionStatus
    fileSyncStatus?: AgentSyncFileSyncStatus
    appliedAt?: Date | null
    reason?: string | null
  },
): Promise<void> {
  if (suggestionIds.length === 0) {
    return
  }

  await prisma.agentSyncSuggestion.updateMany({
    where: {
      id: {
        in: suggestionIds,
      },
    },
    data,
  })
}

async function processSubagentRun(args: {
  runId: string
  userId: string
  subagent: Subagent
  repoRoot: string
  lookbackStart: Date
  minSignals: number
}): Promise<ProcessSubagentResult> {
  const signals = await prisma.agentSyncSignal.findMany({
    where: {
      userId: args.userId,
      subagentId: args.subagent.id,
      occurredAt: {
        gte: args.lookbackStart,
      },
    },
    orderBy: {
      occurredAt: "desc",
    },
  })

  const aggregate = aggregateAgentSyncRewards(
    signals.map((signal) => ({
      source: signal.source,
      reward: signal.reward,
      occurredAt: signal.occurredAt,
    })),
    {
      minSignals: args.minSignals,
    },
  )

  if (!aggregate.shouldApply) {
    return {
      processed: false,
      skipped: true,
      appliedSuggestions: 0,
      proposedSuggestions: 0,
      failed: false,
      fileSyncFailed: false,
    }
  }

  const loaded = await loadSubagentContextFiles({
    repoRoot: args.repoRoot,
    subagent: {
      name: args.subagent.name,
      path: args.subagent.path,
      content: args.subagent.content,
    },
  })

  const editableFiles = toEditableFiles(
    loaded.files.map((file) => ({
      fileName: file.fileName,
      content: file.content,
    })),
  )

  if (editableFiles.length === 0) {
    return {
      processed: false,
      skipped: true,
      appliedSuggestions: 0,
      proposedSuggestions: 0,
      failed: false,
      fileSyncFailed: false,
    }
  }

  const suggestions = buildAgentSyncSuggestionsForFiles({
    files: editableFiles,
    aggregate,
    subagentName: args.subagent.name,
  }).filter((suggestion) => {
    return isAgentSyncManagedFile(suggestion.fileName)
  })

  if (suggestions.length === 0) {
    return {
      processed: false,
      skipped: true,
      appliedSuggestions: 0,
      proposedSuggestions: 0,
      failed: false,
      fileSyncFailed: false,
    }
  }

  const created = await Promise.all(
    suggestions.map((suggestion) =>
      prisma.agentSyncSuggestion.create({
        data: {
          runId: args.runId,
          userId: args.userId,
          subagentId: args.subagent.id,
          fileName: suggestion.fileName,
          risk: suggestion.risk,
          status: "proposed",
          reason: suggestion.reason,
          existingContent: suggestion.existingContent,
          suggestedContent: suggestion.suggestedContent,
          metadata: {
            signalCount: aggregate.signalCount,
            meanReward: aggregate.meanReward,
            totalReward: aggregate.totalReward,
            trend: aggregate.trend,
          } satisfies Prisma.InputJsonValue,
        },
      }),
    ),
  )

  const { lowRiskSuggestions, highRiskSuggestions } = splitAgentSyncSuggestionsByRisk(created)

  if (lowRiskSuggestions.length === 0) {
    return {
      processed: true,
      skipped: false,
      appliedSuggestions: 0,
      proposedSuggestions: highRiskSuggestions.length,
      failed: false,
      fileSyncFailed: false,
    }
  }

  const fileByName = new Map(editableFiles.map((file) => [normalizeAgentSyncFileName(file.fileName), file.content]))
  for (const suggestion of lowRiskSuggestions) {
    fileByName.set(normalizeAgentSyncFileName(suggestion.fileName), suggestion.suggestedContent)
  }

  const nextFiles = [...fileByName.entries()].map(([fileName, content]) => ({ fileName, content }))
  const nextContent = composeContextFilesContent(nextFiles)

  await prisma.subagent.update({
    where: {
      id: args.subagent.id,
    },
    data: {
      content: nextContent,
    },
  })

  let fileSyncFailed = false
  try {
    const persisted = await persistSubagentContextFiles({
      repoRoot: args.repoRoot,
      subagent: {
        name: args.subagent.name,
        path: args.subagent.path,
      },
      files: nextFiles,
    })

    await prisma.subagent.update({
      where: {
        id: args.subagent.id,
      },
      data: {
        path: persisted.path,
        content: persisted.content,
      },
    })

    await markSuggestions(lowRiskSuggestions.map((suggestion) => suggestion.id), {
      status: "applied",
      fileSyncStatus: "synced",
      appliedAt: new Date(),
    })
  } catch (error) {
    fileSyncFailed = true
    await markSuggestions(lowRiskSuggestions.map((suggestion) => suggestion.id), {
      status: "applied",
      fileSyncStatus: "filesystem_sync_failed",
      appliedAt: new Date(),
      reason: error instanceof Error ? error.message : "Filesystem sync failed",
    })
  }

  return {
    processed: true,
    skipped: false,
    appliedSuggestions: lowRiskSuggestions.length,
    proposedSuggestions: highRiskSuggestions.length,
    failed: false,
    fileSyncFailed,
  }
}

function emptySummary(targetedSubagents: number): AgentSyncSummary {
  return {
    targetedSubagents,
    processedSubagents: 0,
    skippedSubagents: 0,
    appliedSuggestions: 0,
    proposedSuggestions: 0,
    failedSubagents: 0,
    fileSyncFailures: 0,
  }
}

export async function runAgentSyncForUser(args: {
  userId: string
  trigger: AgentSyncTrigger
  scope: AgentSyncScope
  subagentId?: string | null
  metadata?: Record<string, unknown>
}) {
  if (!agentSyncEnabled()) {
    throw new AgentSyncError("AgentSync is disabled by configuration", 503)
  }

  const targets = await resolveTargetSubagents({
    userId: args.userId,
    scope: args.scope,
    subagentId: args.subagentId || null,
  })

  const now = new Date()
  const run = await prisma.agentSyncRun.create({
    data: {
      userId: args.userId,
      subagentId: args.scope === "selected_agent" ? args.subagentId || null : null,
      trigger: args.trigger,
      scope: args.scope,
      status: "running",
      metadata: (args.metadata || {}) as Prisma.InputJsonValue,
      startedAt: now,
      fileSyncStatus: "skipped",
    },
  })

  publishRealtimeEvent({
    type: "agentsync.updated",
    userId: args.userId,
    payload: {
      kind: "run",
      runId: run.id,
      status: run.status,
      trigger: run.trigger,
      scope: run.scope,
    },
  })

  const summary = emptySummary(targets.length)
  const lookbackStart = new Date(now.getTime() - agentSyncLookbackDays() * 24 * 60 * 60 * 1000)
  const repoRoot = resolveWorkspaceRoot()

  for (const subagent of targets) {
    try {
      const result = await processSubagentRun({
        runId: run.id,
        userId: args.userId,
        subagent,
        repoRoot,
        lookbackStart,
        minSignals: agentSyncMinSignals(),
      })

      if (result.processed) {
        summary.processedSubagents += 1
      }
      if (result.skipped) {
        summary.skippedSubagents += 1
      }
      summary.appliedSuggestions += result.appliedSuggestions
      summary.proposedSuggestions += result.proposedSuggestions
      if (result.failed) {
        summary.failedSubagents += 1
      }
      if (result.fileSyncFailed) {
        summary.fileSyncFailures += 1
      }
    } catch (error) {
      summary.failedSubagents += 1
      console.error("AgentSync subagent processing failed:", {
        runId: run.id,
        subagentId: subagent.id,
        error: error instanceof Error ? error.message : "Unknown AgentSync subagent failure",
      })
    }
  }

  const status = summary.failedSubagents > 0 && summary.processedSubagents === 0
    ? "failed"
    : "completed"
  const summaryMetadata: Prisma.InputJsonObject = {
    targetedSubagents: summary.targetedSubagents,
    processedSubagents: summary.processedSubagents,
    skippedSubagents: summary.skippedSubagents,
    appliedSuggestions: summary.appliedSuggestions,
    proposedSuggestions: summary.proposedSuggestions,
    failedSubagents: summary.failedSubagents,
    fileSyncFailures: summary.fileSyncFailures,
  }

  const updatedRun = await prisma.agentSyncRun.update({
    where: {
      id: run.id,
    },
    data: {
      status,
      completedAt: new Date(),
      summary: `Processed ${summary.processedSubagents}/${summary.targetedSubagents} targets, applied ${summary.appliedSuggestions}, proposed ${summary.proposedSuggestions}.`,
      metadata: summaryMetadata,
      fileSyncStatus: summary.fileSyncFailures > 0 ? "filesystem_sync_failed" : "synced",
    },
    include: {
      suggestions: {
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  })

  publishRealtimeEvent({
    type: "agentsync.updated",
    userId: args.userId,
    payload: {
      kind: "run",
      runId: updatedRun.id,
      status: updatedRun.status,
      trigger: updatedRun.trigger,
      scope: updatedRun.scope,
      summary,
    },
  })

  return updatedRun
}

export async function listAgentSyncRunsForUser(args: {
  userId: string
  subagentId?: string | null
  take?: number
}) {
  const take = Math.max(1, Math.min(100, args.take ?? 40))

  return prisma.agentSyncRun.findMany({
    where: {
      userId: args.userId,
      ...(args.subagentId ? { subagentId: args.subagentId } : {}),
    },
    include: {
      suggestions: {
        orderBy: {
          createdAt: "desc",
        },
      },
      subagent: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take,
  })
}

export async function getAgentSyncRunForUser(args: {
  userId: string
  runId: string
}) {
  return prisma.agentSyncRun.findFirst({
    where: {
      id: args.runId,
      userId: args.userId,
    },
    include: {
      suggestions: {
        orderBy: {
          createdAt: "desc",
        },
      },
      subagent: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  })
}

async function applySuggestionContent(args: {
  suggestion: AgentSyncSuggestion
  subagent: Subagent
}): Promise<{ fileSyncStatus: AgentSyncFileSyncStatus }> {
  const repoRoot = resolveWorkspaceRoot()
  const loaded = await loadSubagentContextFiles({
    repoRoot,
    subagent: {
      name: args.subagent.name,
      path: args.subagent.path,
      content: args.subagent.content,
    },
  })

  const editableFiles = toEditableFiles(
    loaded.files.map((file) => ({
      fileName: file.fileName,
      content: file.content,
    })),
  )

  const normalizedTargetFile = normalizeAgentSyncFileName(args.suggestion.fileName)
  const fileByName = new Map(editableFiles.map((file) => [normalizeAgentSyncFileName(file.fileName), file.content]))
  fileByName.set(normalizedTargetFile, args.suggestion.suggestedContent)

  const nextFiles = [...fileByName.entries()].map(([fileName, content]) => ({ fileName, content }))
  const nextContent = composeContextFilesContent(nextFiles)

  await prisma.subagent.update({
    where: {
      id: args.subagent.id,
    },
    data: {
      content: nextContent,
    },
  })

  try {
    const persisted = await persistSubagentContextFiles({
      repoRoot,
      subagent: {
        name: args.subagent.name,
        path: args.subagent.path,
      },
      files: nextFiles,
    })

    await prisma.subagent.update({
      where: {
        id: args.subagent.id,
      },
      data: {
        path: persisted.path,
        content: persisted.content,
      },
    })

    return {
      fileSyncStatus: "synced",
    }
  } catch (error) {
    console.error("AgentSync suggestion filesystem sync failed:", {
      suggestionId: args.suggestion.id,
      subagentId: args.subagent.id,
      error: error instanceof Error ? error.message : "Unknown filesystem sync error",
    })
    return {
      fileSyncStatus: "filesystem_sync_failed",
    }
  }
}

export async function applyAgentSyncSuggestion(args: {
  userId: string
  suggestionId: string
}) {
  const suggestion = await prisma.agentSyncSuggestion.findFirst({
    where: {
      id: args.suggestionId,
      userId: args.userId,
    },
    include: {
      subagent: true,
      run: true,
    },
  })

  if (!suggestion) {
    throw new AgentSyncError("Suggestion not found", 404)
  }

  if (suggestion.status !== "proposed") {
    throw new AgentSyncError("Suggestion is not in proposed state", 409)
  }

  if (suggestion.risk !== "high") {
    throw new AgentSyncError("Only high-risk suggestions require manual apply", 400)
  }

  if (!isEligibleBridgeCrewSubagent(suggestion.subagent)) {
    throw new AgentSyncError("Suggestion subagent is not eligible for AgentSync", 403)
  }

  let fileSyncStatus: AgentSyncFileSyncStatus = "skipped"
  try {
    const result = await applySuggestionContent({
      suggestion,
      subagent: suggestion.subagent,
    })
    fileSyncStatus = result.fileSyncStatus

    const updated = await prisma.agentSyncSuggestion.update({
      where: {
        id: suggestion.id,
      },
      data: {
        status: "applied",
        fileSyncStatus,
        appliedAt: new Date(),
      },
    })

    if (fileSyncStatus === "filesystem_sync_failed") {
      await prisma.agentSyncRun.update({
        where: {
          id: suggestion.runId,
        },
        data: {
          fileSyncStatus: "filesystem_sync_failed",
        },
      })
    }

    publishRealtimeEvent({
      type: "agentsync.updated",
      userId: args.userId,
      payload: {
        kind: "suggestion",
        suggestionId: updated.id,
        runId: updated.runId,
        status: updated.status,
      },
    })

    return updated
  } catch (error) {
    const updated = await prisma.agentSyncSuggestion.update({
      where: {
        id: suggestion.id,
      },
      data: {
        status: "failed",
        fileSyncStatus,
        reason: error instanceof Error ? error.message : "Failed to apply suggestion",
      },
    })

    publishRealtimeEvent({
      type: "agentsync.updated",
      userId: args.userId,
      payload: {
        kind: "suggestion",
        suggestionId: updated.id,
        runId: updated.runId,
        status: updated.status,
      },
    })

    throw error
  }
}

export async function rejectAgentSyncSuggestion(args: {
  userId: string
  suggestionId: string
}) {
  const suggestion = await prisma.agentSyncSuggestion.findFirst({
    where: {
      id: args.suggestionId,
      userId: args.userId,
    },
  })

  if (!suggestion) {
    throw new AgentSyncError("Suggestion not found", 404)
  }

  if (suggestion.status !== "proposed") {
    throw new AgentSyncError("Only proposed suggestions can be rejected", 409)
  }

  const updated = await prisma.agentSyncSuggestion.update({
    where: {
      id: suggestion.id,
    },
    data: {
      status: "rejected",
    },
  })

  publishRealtimeEvent({
    type: "agentsync.updated",
    userId: args.userId,
    payload: {
      kind: "suggestion",
      suggestionId: updated.id,
      runId: updated.runId,
      status: updated.status,
    },
  })

  return updated
}
