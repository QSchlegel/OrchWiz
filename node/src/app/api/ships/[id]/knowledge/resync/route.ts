import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { publishNotificationUpdated } from "@/lib/realtime/notifications"
import { runVaultRagResync } from "@/lib/vault/rag"
import { dataCoreEnabled } from "@/lib/data-core/config"
import { getDataCoreClient } from "@/lib/data-core/client"
import {
  type RagBackend,
  RagBackendUnavailableError,
  resolveRagBackend,
} from "@/lib/memory/rag-backend"
import { recordRagPerformanceSample } from "@/lib/performance/tracker"
import {
  parseKnowledgeBackend,
  parseKnowledgeQueryMode,
  parseKnowledgeResyncScope,
} from "../route-helpers"

export const dynamic = "force-dynamic"

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {}
  }
  return value as Record<string, unknown>
}

async function ensureOwnedShip(userId: string, shipDeploymentId: string): Promise<boolean> {
  const ship = await prisma.agentDeployment.findFirst({
    where: {
      id: shipDeploymentId,
      userId,
      deploymentType: "ship",
    },
    select: {
      id: true,
    },
  })

  return Boolean(ship)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const startedAt = Date.now()
  const body = asRecord(await request.json().catch(() => ({})))
  const scope = parseKnowledgeResyncScope(typeof body.scope === "string" ? body.scope : null)
  const mode = parseKnowledgeQueryMode(typeof body.mode === "string" ? body.mode : null)
  const requestedBackend = parseKnowledgeBackend(typeof body.backend === "string" ? body.backend : null)
  let effectiveBackend: RagBackend = requestedBackend
  let userId: string | null = null
  let shipDeploymentId: string | null = null

  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    userId = session.user.id

    const { id } = await params
    shipDeploymentId = id
    const owned = await ensureOwnedShip(session.user.id, id)
    if (!owned) {
      return NextResponse.json({ error: "Ship not found" }, { status: 404 })
    }

    const backendResolution = resolveRagBackend({
      requestedBackend,
      dataCoreEnabled: dataCoreEnabled(),
    })
    effectiveBackend = backendResolution.effectiveBackend

    const summary = await (backendResolution.effectiveBackend === "data-core-merged"
      ? getDataCoreClient().runSyncReconcile().then((reconcile) => ({
          runId: `data-core-${Date.now()}`,
          status: "completed" as const,
          trigger: "manual" as const,
          scope: scope === "all" ? "all" as const : scope,
          shipDeploymentId: scope === "ship" ? id : null,
          documentsScanned: Number(reconcile?.pull && typeof reconcile.pull === "object" && "pulled" in reconcile.pull ? (reconcile.pull as { pulled?: number }).pulled || 0 : 0),
          documentsUpserted: Number(reconcile?.pull && typeof reconcile.pull === "object" && "applied" in reconcile.pull ? (reconcile.pull as { applied?: number }).applied || 0 : 0),
          documentsRemoved: 0,
          chunksUpserted: 0,
          error: null as string | null,
        }))
      : runVaultRagResync({
          scope,
          shipDeploymentId: scope === "ship" ? id : undefined,
          trigger: "manual",
          initiatedByUserId: session.user.id,
          mode,
        }))

    const durationMs = Date.now() - startedAt
    const performance = {
      durationMs,
      resultCount: summary.documentsUpserted,
      fallbackUsed: false,
      status: "success" as const,
    }

    await recordRagPerformanceSample({
      userId,
      shipDeploymentId: id,
      route: "/api/ships/[id]/knowledge/resync",
      operation: "resync",
      requestedBackend: backendResolution.requestedBackend,
      effectiveBackend: backendResolution.effectiveBackend,
      mode,
      scope,
      status: "success",
      fallbackUsed: false,
      durationMs,
      resultCount: summary.documentsUpserted,
    })

    publishNotificationUpdated({
      userId: session.user.id,
      channel: "vault.graph",
      entityId: summary.runId,
    })

    return NextResponse.json({
      shipDeploymentId: id,
      requestedBackend: backendResolution.requestedBackend,
      effectiveBackend: backendResolution.effectiveBackend,
      performance,
      summary,
    })
  } catch (error) {
    if (error instanceof RagBackendUnavailableError) {
      const durationMs = Date.now() - startedAt

      await recordRagPerformanceSample({
        userId,
        shipDeploymentId,
        route: "/api/ships/[id]/knowledge/resync",
        operation: "resync",
        requestedBackend,
        effectiveBackend: requestedBackend,
        mode,
        scope,
        status: "backend_unavailable",
        fallbackUsed: false,
        durationMs,
        resultCount: 0,
        errorCode: error.code,
      })

      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          requestedBackend,
          effectiveBackend: requestedBackend,
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

    const durationMs = Date.now() - startedAt
    await recordRagPerformanceSample({
      userId,
      shipDeploymentId,
      route: "/api/ships/[id]/knowledge/resync",
      operation: "resync",
      requestedBackend,
      effectiveBackend,
      mode,
      scope,
      status: "error",
      fallbackUsed: false,
      durationMs,
      resultCount: 0,
      errorCode: "INTERNAL_ERROR",
    })

    console.error("Failed to run ship knowledge resync:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
