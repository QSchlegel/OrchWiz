import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { publishNotificationUpdated } from "@/lib/realtime/notifications"
import { runVaultRagResync } from "@/lib/vault/rag"
import { dataCoreEnabled } from "@/lib/data-core/config"
import { getDataCoreClient } from "@/lib/data-core/client"
import { parseKnowledgeQueryMode, parseKnowledgeResyncScope } from "../route-helpers"

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
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const owned = await ensureOwnedShip(session.user.id, id)
    if (!owned) {
      return NextResponse.json({ error: "Ship not found" }, { status: 404 })
    }

    const body = asRecord(await request.json().catch(() => ({})))
    const scope = parseKnowledgeResyncScope(typeof body.scope === "string" ? body.scope : null)
    const mode = parseKnowledgeQueryMode(typeof body.mode === "string" ? body.mode : null)

    const summary = await (dataCoreEnabled()
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

    publishNotificationUpdated({
      userId: session.user.id,
      channel: "vault.graph",
      entityId: summary.runId,
    })

    return NextResponse.json({
      shipDeploymentId: id,
      summary,
    })
  } catch (error) {
    console.error("Failed to run ship knowledge resync:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
