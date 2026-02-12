import type { SessionInteraction } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { publishNotificationUpdated } from "@/lib/realtime/notifications"
import {
  ensureShipQuartermaster,
  getShipQuartermasterState,
} from "@/lib/quartermaster/service"
import {
  QUARTERMASTER_CALLSIGN,
  QUARTERMASTER_CHANNEL,
  QUARTERMASTER_RUNTIME_PROFILE,
} from "@/lib/quartermaster/constants"
import {
  executeSessionPrompt,
  SessionPromptError,
} from "@/lib/runtime/session-prompt"
import { queryVaultRag } from "@/lib/vault/rag"
import { dataCoreEnabled } from "@/lib/data-core/config"
import { getMergedMemoryRetriever, type MergedMemoryRetriever } from "@/lib/data-core/merged-memory-retriever"
import {
  resolveRagBackend,
  type RagBackend,
  RagBackendUnavailableError,
} from "@/lib/memory/rag-backend"
import { recordRagPerformanceSample } from "@/lib/performance/tracker"
import { buildShipNotFoundErrorPayload } from "@/lib/ships/errors"

type QuartermasterState = NonNullable<Awaited<ReturnType<typeof getShipQuartermasterState>>>

const DEFAULT_PROMPT_ROUTE = "/api/ships/[id]/quartermaster"

export interface QuartermasterStateWithInteractions extends QuartermasterState {
  interactions: SessionInteraction[]
}

export interface QuartermasterKnowledgeSource {
  id: string
  path: string
  title: string
  excerpt: string
  scopeType: "ship" | "fleet" | "global"
  shipDeploymentId: string | null
}

export interface QuartermasterKnowledgePerformance {
  durationMs: number
  resultCount: number
  fallbackUsed: boolean
  status: "success" | "error" | "backend_unavailable"
}

export interface QuartermasterKnowledgeBlock {
  query: string
  mode: "hybrid" | "lexical"
  fallbackUsed: boolean
  requestedBackend: RagBackend
  effectiveBackend: RagBackend
  performance: QuartermasterKnowledgePerformance
  sources: QuartermasterKnowledgeSource[]
}

export interface ExecuteShipQuartermasterPromptArgs {
  userId: string
  shipDeploymentId: string
  prompt: string
  requestedBackend: RagBackend
  autoProvisionIfMissing: boolean
  routePath?: string
}

export interface ExecuteShipQuartermasterPromptResult {
  interaction: SessionInteraction
  responseInteraction: SessionInteraction
  provider: string
  fallbackUsed: boolean
  warnings?: string[]
  sessionId: string
  interactions: SessionInteraction[]
  knowledge: QuartermasterKnowledgeBlock
  requestedBackend: RagBackend
  effectiveBackend: RagBackend
  performance: QuartermasterKnowledgePerformance
  autoProvisioned: boolean
}

export class QuartermasterApiResponseError extends Error {
  status: number
  payload: Record<string, unknown>

  constructor(status: number, payload: Record<string, unknown>) {
    super(typeof payload.error === "string" ? payload.error : `Request failed (${status})`)
    this.name = "QuartermasterApiResponseError"
    this.status = status
    this.payload = payload
  }
}

function buildShipContext(state: QuartermasterState, crewCount: number) {
  return {
    shipDeploymentId: state.ship.id,
    shipName: state.ship.name,
    status: state.ship.status,
    nodeId: state.ship.nodeId,
    nodeType: state.ship.nodeType,
    deploymentProfile: state.ship.deploymentProfile,
    healthStatus: state.ship.healthStatus,
    lastHealthCheck: state.ship.lastHealthCheck,
    crewCount,
  }
}

async function defaultListSessionInteractions(sessionId: string): Promise<SessionInteraction[]> {
  return prisma.sessionInteraction.findMany({
    where: {
      sessionId,
    },
    orderBy: {
      timestamp: "asc",
    },
    take: 250,
  })
}

export interface QuartermasterApiDeps {
  getShipQuartermasterState: typeof getShipQuartermasterState
  ensureShipQuartermaster: typeof ensureShipQuartermaster
  listSessionInteractions: (sessionId: string) => Promise<SessionInteraction[]>
  countBridgeCrew: (shipDeploymentId: string) => Promise<number>
  dataCoreEnabled: () => boolean
  resolveRagBackend: typeof resolveRagBackend
  getMergedMemoryRetriever: () => Pick<MergedMemoryRetriever, "query">
  queryVaultRag: typeof queryVaultRag
  recordRagPerformanceSample: typeof recordRagPerformanceSample
  executeSessionPrompt: typeof executeSessionPrompt
  publishNotificationUpdated: typeof publishNotificationUpdated
}

const defaultDeps: QuartermasterApiDeps = {
  getShipQuartermasterState,
  ensureShipQuartermaster,
  listSessionInteractions: defaultListSessionInteractions,
  countBridgeCrew: async (shipDeploymentId) =>
    prisma.bridgeCrew.count({
      where: {
        deploymentId: shipDeploymentId,
      },
    }),
  dataCoreEnabled,
  resolveRagBackend,
  getMergedMemoryRetriever,
  queryVaultRag,
  recordRagPerformanceSample,
  executeSessionPrompt,
  publishNotificationUpdated,
}

function shipNotFoundResponseError(): QuartermasterApiResponseError {
  return new QuartermasterApiResponseError(404, buildShipNotFoundErrorPayload())
}

function quartermasterNotEnabledResponseError(): QuartermasterApiResponseError {
  return new QuartermasterApiResponseError(409, {
    error: "Quartermaster is not enabled for this ship.",
  })
}

async function resolveQuartermasterPromptState(
  args: ExecuteShipQuartermasterPromptArgs,
  deps: QuartermasterApiDeps,
): Promise<{
  state: QuartermasterState
  autoProvisioned: boolean
}> {
  let state = await deps.getShipQuartermasterState({
    userId: args.userId,
    shipDeploymentId: args.shipDeploymentId,
  })

  if (!state) {
    throw shipNotFoundResponseError()
  }

  if (state.session && state.subagent) {
    return {
      state,
      autoProvisioned: false,
    }
  }

  if (!args.autoProvisionIfMissing) {
    throw quartermasterNotEnabledResponseError()
  }

  state = await deps.ensureShipQuartermaster({
    userId: args.userId,
    shipDeploymentId: args.shipDeploymentId,
    shipName: state.ship.name,
  })

  if (!state.session || !state.subagent) {
    throw quartermasterNotEnabledResponseError()
  }

  return {
    state,
    autoProvisioned: true,
  }
}

export async function loadShipQuartermasterStateWithInteractions(
  args: {
    userId: string
    shipDeploymentId: string
  },
  deps: QuartermasterApiDeps = defaultDeps,
): Promise<QuartermasterStateWithInteractions> {
  let state = await deps.getShipQuartermasterState(args)
  if (!state) {
    throw shipNotFoundResponseError()
  }

  if (!state.session || !state.subagent) {
    state = await deps.ensureShipQuartermaster({
      userId: args.userId,
      shipDeploymentId: args.shipDeploymentId,
      shipName: state.ship.name,
    })

    if (!state.session || !state.subagent) {
      throw quartermasterNotEnabledResponseError()
    }
  }

  const interactions = state.session
    ? await deps.listSessionInteractions(state.session.id)
    : []

  return {
    ...state,
    interactions,
  }
}

function toSessionPromptResponseError(error: SessionPromptError): QuartermasterApiResponseError {
  return new QuartermasterApiResponseError(error.status, {
    error: error.message,
    ...(error.details ? { details: error.details } : {}),
  })
}

export async function executeShipQuartermasterPrompt(
  args: ExecuteShipQuartermasterPromptArgs,
  deps: QuartermasterApiDeps = defaultDeps,
): Promise<ExecuteShipQuartermasterPromptResult> {
  const routePath = args.routePath || DEFAULT_PROMPT_ROUTE
  const { state, autoProvisioned } = await resolveQuartermasterPromptState(args, deps)

  if (!state.session || !state.subagent) {
    throw quartermasterNotEnabledResponseError()
  }

  const crewCount = await deps.countBridgeCrew(args.shipDeploymentId)
  let effectiveBackend: RagBackend = args.requestedBackend
  let knowledgeBlock: QuartermasterKnowledgeBlock = {
    query: args.prompt,
    mode: "hybrid",
    fallbackUsed: false,
    requestedBackend: args.requestedBackend,
    effectiveBackend,
    performance: {
      durationMs: 0,
      resultCount: 0,
      fallbackUsed: false,
      status: "success",
    },
    sources: [],
  }

  const retrievalStartedAt = Date.now()
  try {
    const backendResolution = deps.resolveRagBackend({
      requestedBackend: args.requestedBackend,
      dataCoreEnabled: deps.dataCoreEnabled(),
    })
    effectiveBackend = backendResolution.effectiveBackend

    const knowledge = backendResolution.effectiveBackend === "data-core-merged"
      ? await deps.getMergedMemoryRetriever().query({
          query: args.prompt,
          mode: "hybrid",
          scope: "all",
          shipDeploymentId: args.shipDeploymentId,
          userId: args.userId,
          includePrivate: true,
        })
      : await deps.queryVaultRag({
          query: args.prompt,
          vaultId: "joined",
          mode: "hybrid",
          scope: "all",
          shipDeploymentId: args.shipDeploymentId,
        })

    const retrievalDurationMs = Date.now() - retrievalStartedAt
    knowledgeBlock = {
      query: args.prompt,
      mode: knowledge.mode,
      fallbackUsed: knowledge.fallbackUsed,
      requestedBackend: backendResolution.requestedBackend,
      effectiveBackend: backendResolution.effectiveBackend,
      performance: {
        durationMs: retrievalDurationMs,
        resultCount: knowledge.results.length,
        fallbackUsed: knowledge.fallbackUsed,
        status: "success",
      },
      sources: knowledge.results.map((result) => ({
        id: result.id,
        path: result.path,
        title: result.title,
        excerpt: result.excerpt,
        scopeType: result.scopeType,
        shipDeploymentId: result.shipDeploymentId,
      })),
    }

    await deps.recordRagPerformanceSample({
      userId: args.userId,
      sessionId: state.session.id,
      shipDeploymentId: args.shipDeploymentId,
      route: routePath,
      operation: "chat_context_retrieval",
      requestedBackend: backendResolution.requestedBackend,
      effectiveBackend: backendResolution.effectiveBackend,
      mode: "hybrid",
      scope: "all",
      status: "success",
      fallbackUsed: knowledge.fallbackUsed,
      durationMs: retrievalDurationMs,
      resultCount: knowledge.results.length,
      query: args.prompt,
    })
  } catch (error) {
    const retrievalDurationMs = Date.now() - retrievalStartedAt
    if (error instanceof RagBackendUnavailableError) {
      await deps.recordRagPerformanceSample({
        userId: args.userId,
        sessionId: state.session.id,
        shipDeploymentId: args.shipDeploymentId,
        route: routePath,
        operation: "chat_context_retrieval",
        requestedBackend: args.requestedBackend,
        effectiveBackend: args.requestedBackend,
        mode: "hybrid",
        scope: "all",
        status: "backend_unavailable",
        fallbackUsed: false,
        durationMs: retrievalDurationMs,
        resultCount: 0,
        query: args.prompt,
        errorCode: error.code,
      })

      throw new QuartermasterApiResponseError(error.status, {
        error: error.message,
        code: error.code,
        requestedBackend: args.requestedBackend,
        effectiveBackend: args.requestedBackend,
        performance: {
          durationMs: retrievalDurationMs,
          resultCount: 0,
          fallbackUsed: false,
          status: "backend_unavailable",
        },
      })
    }

    await deps.recordRagPerformanceSample({
      userId: args.userId,
      sessionId: state.session.id,
      shipDeploymentId: args.shipDeploymentId,
      route: routePath,
      operation: "chat_context_retrieval",
      requestedBackend: args.requestedBackend,
      effectiveBackend,
      mode: "hybrid",
      scope: "all",
      status: "error",
      fallbackUsed: true,
      durationMs: retrievalDurationMs,
      resultCount: 0,
      query: args.prompt,
      errorCode: "RAG_RETRIEVAL_ERROR",
    })

    console.error("Quartermaster knowledge retrieval failed (fail-open):", error)
    knowledgeBlock = {
      query: args.prompt,
      mode: "lexical",
      fallbackUsed: true,
      requestedBackend: args.requestedBackend,
      effectiveBackend,
      performance: {
        durationMs: retrievalDurationMs,
        resultCount: 0,
        fallbackUsed: true,
        status: "error",
      },
      sources: [],
    }
  }

  const runtimeMetadata = {
    runtime: {
      profile: QUARTERMASTER_RUNTIME_PROFILE,
      executionKind: "human_chat",
    },
    quartermaster: {
      channel: QUARTERMASTER_CHANNEL,
      callsign: QUARTERMASTER_CALLSIGN,
      subagentId: state.subagent.id,
      shipDeploymentId: args.shipDeploymentId,
      knowledge: knowledgeBlock,
    },
    shipContext: buildShipContext(state, crewCount),
  }

  let promptResult: Awaited<ReturnType<typeof executeSessionPrompt>>
  try {
    promptResult = await deps.executeSessionPrompt({
      userId: args.userId,
      sessionId: state.session.id,
      prompt: args.prompt,
      metadata: runtimeMetadata as Record<string, unknown>,
    })
  } catch (error) {
    if (error instanceof SessionPromptError) {
      throw toSessionPromptResponseError(error)
    }
    throw error
  }

  const interactions = await deps.listSessionInteractions(state.session.id)
  deps.publishNotificationUpdated({
    userId: args.userId,
    channel: "quartermaster.chat",
    entityId: state.session.id,
  })

  return {
    interaction: promptResult.interaction,
    responseInteraction: promptResult.responseInteraction,
    provider: promptResult.provider,
    fallbackUsed: promptResult.fallbackUsed,
    ...(promptResult.warnings && promptResult.warnings.length > 0
      ? { warnings: promptResult.warnings }
      : {}),
    sessionId: state.session.id,
    interactions,
    knowledge: knowledgeBlock,
    requestedBackend: knowledgeBlock.requestedBackend,
    effectiveBackend: knowledgeBlock.effectiveBackend,
    performance: knowledgeBlock.performance,
    autoProvisioned,
  }
}
