import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { publishNotificationUpdated } from "@/lib/realtime/notifications"
import {
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
import { getMergedMemoryRetriever } from "@/lib/data-core/merged-memory-retriever"
import {
  parseRagBackend,
  type RagBackend,
  RagBackendUnavailableError,
  resolveRagBackend,
} from "@/lib/memory/rag-backend"
import { recordRagPerformanceSample } from "@/lib/performance/tracker"

export const dynamic = "force-dynamic"

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {}
  }
  return value as Record<string, unknown>
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function buildShipContext(state: NonNullable<Awaited<ReturnType<typeof getShipQuartermasterState>>>, crewCount: number) {
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

async function listSessionInteractions(sessionId: string) {
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const state = await getShipQuartermasterState({
      userId: session.user.id,
      shipDeploymentId: id,
    })

    if (!state) {
      return NextResponse.json({ error: "Ship not found" }, { status: 404 })
    }

    const interactions = state.session
      ? await listSessionInteractions(state.session.id)
      : []

    return NextResponse.json({
      ...state,
      interactions,
    })
  } catch (error) {
    console.error("Failed to load ship quartermaster state:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const startedAt = Date.now()
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const body = asRecord(await request.json().catch(() => ({})))
    const prompt = asString(body.prompt)
    const requestedBackend = parseRagBackend(asString(body.backend))
    let effectiveBackend: RagBackend = requestedBackend

    if (!prompt) {
      return NextResponse.json({ error: "prompt required" }, { status: 400 })
    }

    const state = await getShipQuartermasterState({
      userId: session.user.id,
      shipDeploymentId: id,
    })

    if (!state) {
      return NextResponse.json({ error: "Ship not found" }, { status: 404 })
    }

    if (!state.session || !state.subagent) {
      return NextResponse.json(
        { error: "Quartermaster is not enabled for this ship." },
        { status: 409 },
      )
    }

    const crewCount = await prisma.bridgeCrew.count({
      where: {
        deploymentId: id,
      },
    })

    let knowledgeBlock: {
      query: string
      mode: "hybrid" | "lexical"
      fallbackUsed: boolean
      requestedBackend: RagBackend
      effectiveBackend: RagBackend
      performance: {
        durationMs: number
        resultCount: number
        fallbackUsed: boolean
        status: "success" | "error" | "backend_unavailable"
      }
      sources: Array<{
        id: string
        path: string
        title: string
        excerpt: string
        scopeType: "ship" | "fleet" | "global"
        shipDeploymentId: string | null
      }>
    } = {
      query: prompt,
      mode: "hybrid",
      fallbackUsed: false,
      requestedBackend,
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
      const backendResolution = resolveRagBackend({
        requestedBackend,
        dataCoreEnabled: dataCoreEnabled(),
      })
      effectiveBackend = backendResolution.effectiveBackend

      const knowledge = backendResolution.effectiveBackend === "data-core-merged"
        ? await getMergedMemoryRetriever().query({
            query: prompt,
            mode: "hybrid",
            scope: "all",
            shipDeploymentId: id,
            userId: session.user.id,
            includePrivate: true,
          })
        : await queryVaultRag({
            query: prompt,
            vaultId: "joined",
            mode: "hybrid",
            scope: "all",
            shipDeploymentId: id,
          })

      const retrievalDurationMs = Date.now() - retrievalStartedAt
      knowledgeBlock = {
        query: prompt,
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

      await recordRagPerformanceSample({
        userId: session.user.id,
        sessionId: state.session.id,
        shipDeploymentId: id,
        route: "/api/ships/[id]/quartermaster",
        operation: "chat_context_retrieval",
        requestedBackend: backendResolution.requestedBackend,
        effectiveBackend: backendResolution.effectiveBackend,
        mode: "hybrid",
        scope: "all",
        status: "success",
        fallbackUsed: knowledge.fallbackUsed,
        durationMs: retrievalDurationMs,
        resultCount: knowledge.results.length,
        query: prompt,
      })
    } catch (knowledgeError) {
      const retrievalDurationMs = Date.now() - retrievalStartedAt
      if (knowledgeError instanceof RagBackendUnavailableError) {
        await recordRagPerformanceSample({
          userId: session.user.id,
          sessionId: state.session.id,
          shipDeploymentId: id,
          route: "/api/ships/[id]/quartermaster",
          operation: "chat_context_retrieval",
          requestedBackend,
          effectiveBackend: requestedBackend,
          mode: "hybrid",
          scope: "all",
          status: "backend_unavailable",
          fallbackUsed: false,
          durationMs: retrievalDurationMs,
          resultCount: 0,
          query: prompt,
          errorCode: knowledgeError.code,
        })

        return NextResponse.json(
          {
            error: knowledgeError.message,
            code: knowledgeError.code,
            requestedBackend,
            effectiveBackend: requestedBackend,
            performance: {
              durationMs: retrievalDurationMs,
              resultCount: 0,
              fallbackUsed: false,
              status: "backend_unavailable",
            },
          },
          { status: knowledgeError.status },
        )
      }

      await recordRagPerformanceSample({
        userId: session.user.id,
        sessionId: state.session.id,
        shipDeploymentId: id,
        route: "/api/ships/[id]/quartermaster",
        operation: "chat_context_retrieval",
        requestedBackend,
        effectiveBackend,
        mode: "hybrid",
        scope: "all",
        status: "error",
        fallbackUsed: true,
        durationMs: retrievalDurationMs,
        resultCount: 0,
        query: prompt,
        errorCode: "RAG_RETRIEVAL_ERROR",
      })

      console.error("Quartermaster knowledge retrieval failed (fail-open):", knowledgeError)
      knowledgeBlock = {
        query: prompt,
        mode: "lexical",
        fallbackUsed: true,
        requestedBackend,
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

    const result = await executeSessionPrompt({
      userId: session.user.id,
      sessionId: state.session.id,
      prompt,
      metadata: {
        runtime: {
          profile: QUARTERMASTER_RUNTIME_PROFILE,
        },
        quartermaster: {
          channel: QUARTERMASTER_CHANNEL,
          callsign: QUARTERMASTER_CALLSIGN,
          subagentId: state.subagent.id,
          shipDeploymentId: id,
          knowledge: knowledgeBlock,
        },
        shipContext: buildShipContext(state, crewCount),
      },
    })

    const interactions = await listSessionInteractions(state.session.id)

    publishNotificationUpdated({
      userId: session.user.id,
      channel: "quartermaster.chat",
      entityId: state.session.id,
    })

    return NextResponse.json({
      interaction: result.interaction,
      responseInteraction: result.responseInteraction,
      provider: result.provider,
      fallbackUsed: result.fallbackUsed,
      sessionId: state.session.id,
      interactions,
      knowledge: knowledgeBlock,
      requestedBackend: knowledgeBlock.requestedBackend,
      effectiveBackend: knowledgeBlock.effectiveBackend,
      performance: knowledgeBlock.performance,
    })
  } catch (error) {
    if (error instanceof RagBackendUnavailableError) {
      const durationMs = Date.now() - startedAt
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          performance: {
            durationMs,
            resultCount: 0,
            fallbackUsed: false,
            status: "backend_unavailable",
          },
        },
        { status: error.status },
      )
    }

    if (error instanceof SessionPromptError) {
      return NextResponse.json(
        {
          error: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
        { status: error.status },
      )
    }

    console.error("Quartermaster prompt request failed:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
