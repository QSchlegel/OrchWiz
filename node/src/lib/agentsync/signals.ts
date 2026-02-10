import type { AgentSyncSignalSource, BridgeCrewRole, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { agentSyncEnabled, isEligibleBridgeCrewCallsign, stationKeyToBridgeCrewCallsign } from "./constants"
import {
  mapBridgeCallOutcomeToReward,
  mapCommandOutcomeToReward,
  mapVerificationOutcomeToReward,
} from "./rewards"

interface AgentSyncSignalRecordInput {
  userId: string
  subagentId: string
  source: AgentSyncSignalSource
  sourceId: string
  reward: number
  occurredAt?: Date
  details?: Record<string, unknown>
}

function asFiniteReward(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.max(-3, Math.min(3, value))
}

function sanitizeSourceId(value: string): string {
  return value.trim().slice(0, 255)
}

function toJsonDetails(value: Record<string, unknown> | undefined): Prisma.InputJsonValue {
  if (!value) {
    return {}
  }

  try {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
  } catch {
    return {}
  }
}

export function buildAgentSyncSignalDedupeRef(args: {
  source: AgentSyncSignalSource
  sourceId: string
  subagentId: string
}): string {
  return `${args.source}:${args.sourceId}:${args.subagentId}`
}

export async function recordAgentSyncSignal(input: AgentSyncSignalRecordInput) {
  if (!agentSyncEnabled()) {
    return null
  }

  if (!input.subagentId || !input.sourceId.trim()) {
    return null
  }

  const sourceId = sanitizeSourceId(input.sourceId)
  return prisma.agentSyncSignal.upsert({
    where: {
      source_sourceId_subagentId: {
        source: input.source,
        sourceId,
        subagentId: input.subagentId,
      },
    },
    create: {
      userId: input.userId,
      subagentId: input.subagentId,
      source: input.source,
      sourceId,
      reward: asFiniteReward(input.reward),
      details: toJsonDetails(input.details),
      occurredAt: input.occurredAt || new Date(),
    },
    update: {
      userId: input.userId,
      reward: asFiniteReward(input.reward),
      details: toJsonDetails(input.details),
      occurredAt: input.occurredAt || new Date(),
    },
  })
}

export async function resolveBridgeCrewSubagentByStationKey(args: {
  userId: string
  stationKey: BridgeCrewRole
}) {
  const callsign = stationKeyToBridgeCrewCallsign(args.stationKey)

  return prisma.subagent.findFirst({
    where: {
      isShared: false,
      ownerUserId: args.userId,
      name: callsign,
    },
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      id: true,
      name: true,
      isShared: true,
    },
  })
}

export function isEligibleAgentSyncSubagent(input: { name: string; isShared: boolean }): boolean {
  if (input.isShared) {
    return false
  }
  return isEligibleBridgeCrewCallsign(input.name)
}

export async function recordCommandExecutionSignal(args: {
  userId: string
  subagentId: string | null
  sourceId: string
  status: "completed" | "failed" | "blocked"
  durationMs?: number | null
  metadata?: Record<string, unknown>
}) {
  if (!args.subagentId) {
    return null
  }

  const reward = mapCommandOutcomeToReward({
    status: args.status,
    durationMs: args.durationMs,
  })

  return recordAgentSyncSignal({
    userId: args.userId,
    subagentId: args.subagentId,
    source: "command",
    sourceId: args.sourceId,
    reward,
    details: {
      status: args.status,
      durationMs: args.durationMs ?? null,
      ...(args.metadata || {}),
    },
  })
}

export async function recordVerificationSignal(args: {
  userId: string
  subagentId: string | null
  sourceId: string
  status?: string | null
  feedback?: string | null
  iterations?: number | null
  metadata?: Record<string, unknown>
}) {
  if (!args.subagentId) {
    return null
  }

  const reward = mapVerificationOutcomeToReward({
    status: args.status,
    feedback: args.feedback,
    iterations: args.iterations,
  })

  return recordAgentSyncSignal({
    userId: args.userId,
    subagentId: args.subagentId,
    source: "verification",
    sourceId: args.sourceId,
    reward,
    details: {
      status: args.status || null,
      feedback: args.feedback || null,
      iterations: args.iterations ?? null,
      ...(args.metadata || {}),
    },
  })
}

export async function recordBridgeCallSignal(args: {
  userId: string
  stationKey: BridgeCrewRole
  sourceId: string
  status: "success" | "failed" | "offline"
  attemptCount?: number | null
  wasRetried?: boolean | null
  latencyMs?: number | null
  metadata?: Record<string, unknown>
}) {
  const matchedSubagent = await resolveBridgeCrewSubagentByStationKey({
    userId: args.userId,
    stationKey: args.stationKey,
  })
  if (!matchedSubagent || !isEligibleAgentSyncSubagent(matchedSubagent)) {
    return null
  }

  const reward = mapBridgeCallOutcomeToReward({
    status: args.status,
    attemptCount: args.attemptCount,
    wasRetried: args.wasRetried,
    latencyMs: args.latencyMs,
  })

  return recordAgentSyncSignal({
    userId: args.userId,
    subagentId: matchedSubagent.id,
    source: "bridge_call",
    sourceId: args.sourceId,
    reward,
    details: {
      stationKey: args.stationKey,
      status: args.status,
      attemptCount: args.attemptCount ?? null,
      wasRetried: args.wasRetried ?? false,
      latencyMs: args.latencyMs ?? null,
      ...(args.metadata || {}),
    },
  })
}
