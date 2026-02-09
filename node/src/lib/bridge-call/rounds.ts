import type {
  BridgeCallOfficerResult,
  BridgeCallRound,
  BridgeCrewRole,
  BridgeThread,
} from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  applyForwardedBridgeStationEvents,
  buildCanonicalBridgeStations,
} from "@/lib/bridge/stations"
import { ensureStationThreadsForUser } from "@/lib/bridge-chat/sync"
import {
  executeSessionPrompt,
  SessionPromptError,
} from "@/lib/runtime/session-prompt"
import { publishRealtimeEvent } from "@/lib/realtime/events"
import type {
  BridgeCallOfficerResultStatus,
  BridgeCallRoundPostResponse,
  BridgeCallRoundSource,
  BridgeCallRoundStatus,
  BridgeCallRoundView,
  BridgeCallShipSummary,
  BridgeCallStationSummary,
} from "@/lib/bridge-call/types"
import type { BridgeStationKey } from "@/lib/bridge/stations"

export const BRIDGE_CALL_MAX_PENDING = 3
export const BRIDGE_CALL_RETRY_DELAY_MS = 700
export const BRIDGE_CALL_RETENTION_LIMIT = 200
export const BRIDGE_CALL_LEAD_ORDER: BridgeStationKey[] = ["xo", "ops", "eng", "sec", "med", "cou"]

interface QueueJob<T> {
  run: () => Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

interface ScopeQueueState {
  active: boolean
  queue: QueueJob<BridgeCallRoundView>[]
}

interface BridgeCallQueueRegistry {
  scopes: Map<string, ScopeQueueState>
}

interface BridgeCallContext {
  availableShips: BridgeCallShipSummary[]
  selectedShipDeploymentId: string | null
  stations: BridgeCallStationSummary[]
}

interface ExecuteOfficerResult {
  stationKey: BridgeStationKey
  callsign: string
  status: BridgeCallOfficerResultStatus
  wasRetried: boolean
  attemptCount: number
  error?: string | null
  summary?: string | null
  threadId?: string | null
  sessionId?: string | null
  userInteractionId?: string | null
  aiInteractionId?: string | null
  provider?: string | null
  fallbackUsed?: boolean | null
  latencyMs?: number | null
}

interface DispatchBridgeCallRoundArgs {
  userId: string
  directive: string
  source: BridgeCallRoundSource
  shipDeploymentId: string | null
  stations: BridgeCallStationSummary[]
}

declare global {
  // eslint-disable-next-line no-var
  var __orchwizBridgeCallQueues: BridgeCallQueueRegistry | undefined
}

export class BridgeCallQueueFullError extends Error {
  status = 429

  constructor(message = "Bridge call queue is full. Wait for pending directives to finish.") {
    super(message)
    this.name = "BridgeCallQueueFullError"
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {}
  }

  return value as Record<string, unknown>
}

function asStationKey(value: unknown): BridgeStationKey | null {
  if (
    value === "xo" ||
    value === "ops" ||
    value === "eng" ||
    value === "sec" ||
    value === "med" ||
    value === "cou"
  ) {
    return value
  }

  return null
}

function compactSummary(value: string, maxLength = 220): string {
  const compact = value.replace(/\s+/g, " ").trim()
  if (compact.length <= maxLength) {
    return compact
  }

  return `${compact.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function getQueueRegistry(): BridgeCallQueueRegistry {
  if (!globalThis.__orchwizBridgeCallQueues) {
    globalThis.__orchwizBridgeCallQueues = {
      scopes: new Map<string, ScopeQueueState>(),
    }
  }

  return globalThis.__orchwizBridgeCallQueues
}

function queueKey(userId: string, shipDeploymentId: string | null) {
  return `${userId}:${shipDeploymentId || "default"}`
}

function getScopeQueue(scopeKey: string): ScopeQueueState {
  const registry = getQueueRegistry()
  const existing = registry.scopes.get(scopeKey)
  if (existing) {
    return existing
  }

  const created: ScopeQueueState = {
    active: false,
    queue: [],
  }
  registry.scopes.set(scopeKey, created)
  return created
}

async function processScopeQueue(scopeKey: string): Promise<void> {
  const scope = getScopeQueue(scopeKey)
  if (scope.active) {
    return
  }

  scope.active = true
  try {
    while (scope.queue.length > 0) {
      const job = scope.queue.shift()
      if (!job) {
        continue
      }

      try {
        const result = await job.run()
        job.resolve(result)
      } catch (error) {
        job.reject(error)
      }
    }
  } finally {
    scope.active = false
  }
}

async function enqueueScopedRound(args: {
  userId: string
  shipDeploymentId: string | null
  run: () => Promise<BridgeCallRoundView>
}): Promise<BridgeCallRoundView> {
  const scopeKey = queueKey(args.userId, args.shipDeploymentId)
  const scope = getScopeQueue(scopeKey)

  if (scope.queue.length >= BRIDGE_CALL_MAX_PENDING) {
    throw new BridgeCallQueueFullError()
  }

  const resultPromise = new Promise<BridgeCallRoundView>((resolve, reject) => {
    scope.queue.push({
      run: args.run,
      resolve,
      reject,
    })
  })

  void processScopeQueue(scopeKey)
  return resultPromise
}

export function getBridgeCallQueueSnapshot(args: {
  userId: string
  shipDeploymentId: string | null
}): { active: boolean; pending: number } {
  const scope = getScopeQueue(queueKey(args.userId, args.shipDeploymentId))
  return {
    active: scope.active,
    pending: scope.queue.length,
  }
}

export function selectLeadStationKey(results: Array<Pick<ExecuteOfficerResult, "stationKey" | "status">>): BridgeStationKey | null {
  const successByKey = new Set(
    results
      .filter((result) => result.status === "success")
      .map((result) => result.stationKey),
  )

  for (const stationKey of BRIDGE_CALL_LEAD_ORDER) {
    if (successByKey.has(stationKey)) {
      return stationKey
    }
  }

  return null
}

export function deriveRoundStatus(results: Array<Pick<ExecuteOfficerResult, "status">>): BridgeCallRoundStatus {
  const successCount = results.filter((result) => result.status === "success").length
  const failedCount = results.filter((result) => result.status === "failed").length

  if (successCount === 0 && failedCount > 0) {
    return "failed"
  }

  if (successCount > 0 && failedCount > 0) {
    return "partial"
  }

  return "completed"
}

export function summarizeRound(args: {
  results: Array<Pick<ExecuteOfficerResult, "status">>
  leadStationKey: BridgeStationKey | null
}): string {
  const successCount = args.results.filter((result) => result.status === "success").length
  const offlineCount = args.results.filter((result) => result.status === "offline").length
  const failedCount = args.results.filter((result) => result.status === "failed").length
  const lead = args.leadStationKey ? args.leadStationKey.toUpperCase() : "NONE"

  return `Lead ${lead}. Success ${successCount}, offline ${offlineCount}, failed ${failedCount}.`
}

function mapRoundRecord(
  round: BridgeCallRound & { officerResults: BridgeCallOfficerResult[] },
): BridgeCallRoundView {
  return {
    id: round.id,
    shipDeploymentId: round.shipDeploymentId,
    directive: round.directive,
    source: round.source,
    status: round.status,
    leadStationKey: asStationKey(round.leadStationKey),
    summary: round.summary,
    createdAt: round.createdAt.toISOString(),
    completedAt: round.completedAt ? round.completedAt.toISOString() : null,
    officerResults: round.officerResults
      .slice()
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((result) => ({
        id: result.id,
        stationKey: asStationKey(result.stationKey) || "xo",
        callsign: result.callsign,
        status: result.status,
        wasRetried: result.wasRetried,
        attemptCount: result.attemptCount,
        error: result.error,
        summary: result.summary,
        threadId: result.threadId,
        sessionId: result.sessionId,
        userInteractionId: result.userInteractionId,
        aiInteractionId: result.aiInteractionId,
        provider: result.provider,
        fallbackUsed: result.fallbackUsed,
        latencyMs: result.latencyMs,
        createdAt: result.createdAt.toISOString(),
      })),
  }
}

function normalizeStationThreadMap(threads: BridgeThread[]): Partial<Record<BridgeStationKey, { sessionId: string; threadId: string }>> {
  const byStation: Partial<Record<BridgeStationKey, { sessionId: string; threadId: string }>> = {}

  for (const thread of threads) {
    const stationKey = asStationKey(thread.stationKey)
    if (!stationKey || !thread.sessionId) {
      continue
    }

    byStation[stationKey] = {
      sessionId: thread.sessionId,
      threadId: thread.id,
    }
  }

  return byStation
}

function errorMessage(error: unknown): string {
  if (error instanceof SessionPromptError) {
    return error.message
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return "Unknown runtime error"
}

async function executeOfficerDirective(args: {
  userId: string
  roundId: string
  directive: string
  station: BridgeCallStationSummary
  allStations: BridgeCallStationSummary[]
  stationThreadMap: Partial<Record<BridgeStationKey, { sessionId: string; threadId: string }>>
}): Promise<ExecuteOfficerResult> {
  const threadRef = args.stationThreadMap[args.station.stationKey]

  if (args.station.status === "offline") {
    return {
      stationKey: args.station.stationKey,
      callsign: args.station.callsign,
      status: "offline",
      wasRetried: false,
      attemptCount: 0,
      summary: "Station offline. Directive skipped.",
      threadId: threadRef?.threadId || null,
      sessionId: threadRef?.sessionId || null,
    }
  }

  if (!threadRef?.sessionId) {
    return {
      stationKey: args.station.stationKey,
      callsign: args.station.callsign,
      status: "failed",
      wasRetried: false,
      attemptCount: 1,
      error: "No session is bound to this station.",
      threadId: threadRef?.threadId || null,
      sessionId: null,
    }
  }

  const cameoCandidates = args.allStations
    .filter((station) => station.stationKey !== args.station.stationKey && station.status !== "offline")
    .map((station) => ({
      stationKey: station.stationKey,
      callsign: station.callsign,
      role: station.role,
      name: station.name,
      focus: station.focus,
    }))

  let lastError: unknown = null

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const startedAt = Date.now()
    try {
      const result = await executeSessionPrompt({
        userId: args.userId,
        sessionId: threadRef.sessionId,
        prompt: args.directive,
        metadata: {
          bridge: {
            channel: "bridge-agent",
            roundId: args.roundId,
            stationKey: args.station.stationKey,
            callsign: args.station.callsign,
            role: args.station.role,
            name: args.station.name,
            focus: args.station.focus,
            bridgeCrewId: args.station.bridgeCrewId || args.station.subagentId,
            shipDeploymentId: args.shipDeploymentId,
            cameoCandidates,
            missionContext: {
              operator: "Bridge Call",
              stardate: new Date().toISOString(),
              workItems: args.station.queue.slice(0, 3).map((item) => ({ name: item })),
            },
          },
        },
      })

      return {
        stationKey: args.station.stationKey,
        callsign: args.station.callsign,
        status: "success",
        wasRetried: attempt > 1,
        attemptCount: attempt,
        summary: compactSummary(result.responseInteraction.content),
        threadId: threadRef.threadId,
        sessionId: threadRef.sessionId,
        userInteractionId: result.interaction.id,
        aiInteractionId: result.responseInteraction.id,
        provider: result.provider,
        fallbackUsed: result.fallbackUsed,
        latencyMs: Date.now() - startedAt,
      }
    } catch (error) {
      lastError = error
      if (attempt < 2) {
        await sleep(BRIDGE_CALL_RETRY_DELAY_MS)
      }
    }
  }

  return {
    stationKey: args.station.stationKey,
    callsign: args.station.callsign,
    status: "failed",
    wasRetried: true,
    attemptCount: 2,
    error: errorMessage(lastError),
    threadId: threadRef.threadId,
    sessionId: threadRef.sessionId,
  }
}

export async function pruneBridgeCallRounds(args: {
  userId: string
  shipDeploymentId: string | null
  keepLatest?: number
}): Promise<void> {
  const keepLatest = Math.max(1, args.keepLatest || BRIDGE_CALL_RETENTION_LIMIT)

  const staleRounds = await prisma.bridgeCallRound.findMany({
    where: {
      userId: args.userId,
      shipDeploymentId: args.shipDeploymentId,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
    },
    skip: keepLatest,
  })

  if (staleRounds.length === 0) {
    return
  }

  await prisma.bridgeCallRound.deleteMany({
    where: {
      id: {
        in: staleRounds.map((round) => round.id),
      },
    },
  })
}

export async function resolveBridgeCallContext(args: {
  userId: string
  requestedShipDeploymentId?: string | null
}): Promise<BridgeCallContext> {
  const availableShips = await prisma.agentDeployment.findMany({
    where: {
      userId: args.userId,
      deploymentType: "ship",
    },
    select: {
      id: true,
      name: true,
      status: true,
      updatedAt: true,
      nodeId: true,
      nodeType: true,
      deploymentProfile: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
  })

  const requestedShip = args.requestedShipDeploymentId
    ? availableShips.find((ship) => ship.id === args.requestedShipDeploymentId)
    : null
  const selectedShip = requestedShip || availableShips.find((ship) => ship.status === "active") || availableShips[0] || null

  const [bridgeCrew, forwardedBridgeEvents] = await Promise.all([
    selectedShip
      ? prisma.bridgeCrew.findMany({
          where: {
            deploymentId: selectedShip.id,
            status: "active",
          },
          orderBy: {
            role: "asc",
          },
        })
      : Promise.resolve([]),
    prisma.forwardingEvent.findMany({
      where: {
        eventType: "bridge_station",
      },
      orderBy: {
        occurredAt: "desc",
      },
      take: 24,
    }),
  ])

  const baseStations = buildCanonicalBridgeStations(
    bridgeCrew.map((crewMember) => ({
      id: crewMember.id,
      role: crewMember.role,
      callsign: crewMember.callsign,
      name: crewMember.name,
      description: crewMember.description,
    })),
  )

  const stations = applyForwardedBridgeStationEvents(baseStations, forwardedBridgeEvents)

  return {
    selectedShipDeploymentId: selectedShip?.id || null,
    availableShips: availableShips.map((ship) => ({
      id: ship.id,
      name: ship.name,
      status: ship.status,
      nodeId: ship.nodeId,
      nodeType: ship.nodeType,
      deploymentProfile: ship.deploymentProfile,
    })),
    stations,
  }
}

export async function listBridgeCallRounds(args: {
  userId: string
  shipDeploymentId: string | null
  take?: number
}): Promise<BridgeCallRoundView[]> {
  const rounds = await prisma.bridgeCallRound.findMany({
    where: {
      userId: args.userId,
      shipDeploymentId: args.shipDeploymentId,
    },
    include: {
      officerResults: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: args.take ?? 200,
  })

  return rounds.map(mapRoundRecord)
}

async function executeAndPersistBridgeCallRound(args: DispatchBridgeCallRoundArgs): Promise<BridgeCallRoundView> {
  const round = await prisma.bridgeCallRound.create({
    data: {
      userId: args.userId,
      shipDeploymentId: args.shipDeploymentId,
      directive: args.directive,
      source: args.source,
      status: "running",
      metadata: {
        stationCount: args.stations.length,
      },
    },
  })

  const threads = await ensureStationThreadsForUser(args.userId)
  const stationThreadMap = normalizeStationThreadMap(threads)

  const results = await Promise.all(
    args.stations.map((station) =>
      executeOfficerDirective({
        userId: args.userId,
        roundId: round.id,
        directive: args.directive,
        station,
        allStations: args.stations,
        stationThreadMap,
      }),
    ),
  )

  const leadStationKey = selectLeadStationKey(results)
  const status = deriveRoundStatus(results)
  const summary = summarizeRound({
    results,
    leadStationKey,
  })

  const updated = await prisma.$transaction(async (tx) => {
    for (const result of results) {
      await tx.bridgeCallOfficerResult.create({
        data: {
          roundId: round.id,
          stationKey: result.stationKey as BridgeCrewRole,
          callsign: result.callsign,
          status: result.status,
          wasRetried: result.wasRetried,
          attemptCount: result.attemptCount,
          error: result.error || null,
          summary: result.summary || null,
          threadId: result.threadId || null,
          sessionId: result.sessionId || null,
          userInteractionId: result.userInteractionId || null,
          aiInteractionId: result.aiInteractionId || null,
          provider: result.provider || null,
          fallbackUsed: result.fallbackUsed ?? null,
          latencyMs: result.latencyMs ?? null,
        },
      })
    }

    return tx.bridgeCallRound.update({
      where: {
        id: round.id,
      },
      data: {
        status,
        leadStationKey: leadStationKey as BridgeCrewRole | null,
        summary,
        completedAt: new Date(),
      },
      include: {
        officerResults: true,
      },
    })
  })

  await pruneBridgeCallRounds({
    userId: args.userId,
    shipDeploymentId: args.shipDeploymentId,
  })

  const view = mapRoundRecord(updated)

  publishRealtimeEvent({
    type: "bridge-call.round.updated",
    payload: {
      roundId: view.id,
      userId: args.userId,
      shipDeploymentId: args.shipDeploymentId,
      status: view.status,
    },
  })

  return view
}

export async function dispatchBridgeCallRound(args: DispatchBridgeCallRoundArgs): Promise<BridgeCallRoundPostResponse> {
  const round = await enqueueScopedRound({
    userId: args.userId,
    shipDeploymentId: args.shipDeploymentId,
    run: () => executeAndPersistBridgeCallRound(args),
  })

  return {
    round,
    queue: getBridgeCallQueueSnapshot({
      userId: args.userId,
      shipDeploymentId: args.shipDeploymentId,
    }),
  }
}

export function parseDirective(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  return compactSummary(trimmed, 1200)
}

export function parseRequestedShipDeploymentId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed || null
}

export function parseRoundsQueryShipDeploymentId(value: string | null): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed || null
}

export function parseRoundsQueryTake(value: string | null, fallback = 120): number {
  const raw = Number.parseInt(value || "", 10)
  if (!Number.isFinite(raw)) {
    return fallback
  }

  return Math.max(1, Math.min(200, raw))
}

export function parseRoundSource(value: unknown): BridgeCallRoundSource {
  return value === "system" ? "system" : "operator"
}

export function stationStatusForRound(station: BridgeCallStationSummary): "eligible" | "offline" {
  return station.status === "offline" ? "offline" : "eligible"
}

export function stationCueFromResult(result: ExecuteOfficerResult): string {
  if (result.status === "offline") {
    return `${result.callsign} offline`
  }

  if (result.status === "failed") {
    return `${result.callsign} failed`
  }

  return `${result.callsign} acknowledged`
}

export function toRoundMetadata(value: unknown): Record<string, unknown> {
  return asRecord(value)
}
