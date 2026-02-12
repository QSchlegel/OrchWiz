import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { publishNotificationUpdated } from "@/lib/realtime/notifications"
import { deleteVaultFile, moveVaultFile, saveVaultFile, VaultRequestError } from "@/lib/vault"
import { queryVaultRag } from "@/lib/vault/rag"
import { normalizeShipKnowledgePath } from "@/lib/vault/knowledge"
import { dataCoreEnabled } from "@/lib/data-core/config"
import {
  type RagBackend,
  RagBackendUnavailableError,
  resolveRagBackend,
} from "@/lib/memory/rag-backend"
import {
  deleteVaultFileToDataCore,
  moveVaultFileToDataCore,
  saveVaultFileToDataCore,
} from "@/lib/data-core/vault-adapter"
import { getMergedMemoryRetriever } from "@/lib/data-core/merged-memory-retriever"
import { recordRagPerformanceSample } from "@/lib/performance/tracker"
import { buildShipNotFoundErrorPayload } from "@/lib/ships/errors"
import {
  parseKnowledgeBackend,
  parseKnowledgeContent,
  parseKnowledgeQueryMode,
  parseKnowledgeScope,
  parseTopK,
  resolveKnowledgeMutationPath,
} from "./route-helpers"

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

function parseDeleteMode(value: string | null | undefined): "soft" | "hard" {
  return value === "soft" ? "soft" : "hard"
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const startedAt = Date.now()
  const searchParams = request.nextUrl.searchParams
  const query = (searchParams.get("q") || "").trim()
  const mode = parseKnowledgeQueryMode(searchParams.get("mode"))
  const scope = parseKnowledgeScope(searchParams.get("scope"))
  const requestedBackend = parseKnowledgeBackend(searchParams.get("backend"))
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
      return NextResponse.json(buildShipNotFoundErrorPayload(), { status: 404 })
    }

    const k = parseTopK(searchParams.get("k"))
    const backendResolution = resolveRagBackend({
      requestedBackend,
      dataCoreEnabled: dataCoreEnabled(),
    })
    effectiveBackend = backendResolution.effectiveBackend

    if (!query) {
      const durationMs = Date.now() - startedAt
      const performance = {
        durationMs,
        resultCount: 0,
        fallbackUsed: false,
        status: "success" as const,
      }

      await recordRagPerformanceSample({
        userId,
        shipDeploymentId: id,
        route: "/api/ships/[id]/knowledge",
        operation: "search",
        requestedBackend: backendResolution.requestedBackend,
        effectiveBackend: backendResolution.effectiveBackend,
        mode,
        scope,
        status: "success",
        fallbackUsed: false,
        durationMs,
        resultCount: 0,
        query,
      })

      return NextResponse.json({
        shipDeploymentId: id,
        query,
        scope,
        mode,
        requestedBackend: backendResolution.requestedBackend,
        effectiveBackend: backendResolution.effectiveBackend,
        performance,
        fallbackUsed: false,
        results: [],
      })
    }

    const result = backendResolution.effectiveBackend === "data-core-merged"
      ? await getMergedMemoryRetriever().query({
          query,
          mode,
          scope,
          shipDeploymentId: id,
          userId: session.user.id,
          includePrivate: true,
          k,
        })
      : await queryVaultRag({
          query,
          vaultId: "joined",
          mode,
          scope,
          shipDeploymentId: id,
          k,
        })

    const durationMs = Date.now() - startedAt
    const performance = {
      durationMs,
      resultCount: result.results.length,
      fallbackUsed: result.fallbackUsed,
      status: "success" as const,
    }

    await recordRagPerformanceSample({
      userId,
      shipDeploymentId: id,
      route: "/api/ships/[id]/knowledge",
      operation: "search",
      requestedBackend: backendResolution.requestedBackend,
      effectiveBackend: backendResolution.effectiveBackend,
      mode,
      scope,
      status: "success",
      fallbackUsed: result.fallbackUsed,
      durationMs,
      resultCount: result.results.length,
      query,
    })

    return NextResponse.json({
      shipDeploymentId: id,
      query,
      scope,
      mode: result.mode,
      requestedBackend: backendResolution.requestedBackend,
      effectiveBackend: backendResolution.effectiveBackend,
      performance,
      fallbackUsed: result.fallbackUsed,
      results: result.results,
    })
  } catch (error) {
    if (error instanceof RagBackendUnavailableError) {
      const durationMs = Date.now() - startedAt

      await recordRagPerformanceSample({
        userId,
        shipDeploymentId,
        route: "/api/ships/[id]/knowledge",
        operation: "search",
        requestedBackend,
        effectiveBackend: requestedBackend,
        mode,
        scope,
        status: "backend_unavailable",
        fallbackUsed: false,
        durationMs,
        resultCount: 0,
        query,
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
      route: "/api/ships/[id]/knowledge",
      operation: "search",
      requestedBackend,
      effectiveBackend,
      mode,
      scope,
      status: "error",
      fallbackUsed: false,
      durationMs,
      resultCount: 0,
      query,
      errorCode: "INTERNAL_ERROR",
    })

    console.error("Failed to query ship knowledge:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
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
      return NextResponse.json(buildShipNotFoundErrorPayload(), { status: 404 })
    }

    const body = asRecord(await request.json().catch(() => ({})))
    const content = parseKnowledgeContent(body.content)
    if (content === null) {
      return NextResponse.json({ error: "content is required" }, { status: 400 })
    }

    let path: string
    try {
      path = resolveKnowledgeMutationPath(body, id)
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid knowledge path" },
        { status: 400 },
      )
    }

    const payload = dataCoreEnabled()
      ? await saveVaultFileToDataCore({
          vaultId: "ship",
          notePath: path,
          content,
          userId: session.user.id,
          shipDeploymentId: id,
        })
      : await saveVaultFile("ship", path, content)
    publishNotificationUpdated({
      userId: session.user.id,
      channel: "quartermaster.knowledge",
      entityId: path,
    })
    return NextResponse.json(payload, { status: 201 })
  } catch (error) {
    if (error instanceof VaultRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Failed to save ship knowledge:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(
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
      return NextResponse.json(buildShipNotFoundErrorPayload(), { status: 404 })
    }

    const body = asRecord(await request.json().catch(() => ({})))
    if (typeof body.fromPath !== "string" || typeof body.toPath !== "string") {
      return NextResponse.json({ error: "fromPath and toPath are required" }, { status: 400 })
    }

    let fromPath: string
    let toPath: string
    try {
      fromPath = normalizeShipKnowledgePath(body.fromPath, id)
      toPath = normalizeShipKnowledgePath(body.toPath, id)
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid knowledge path" },
        { status: 400 },
      )
    }

    const payload = dataCoreEnabled()
      ? await moveVaultFileToDataCore({
          vaultId: "ship",
          fromPath,
          toPath,
          userId: session.user.id,
          shipDeploymentId: id,
        })
      : await moveVaultFile("ship", fromPath, toPath)
    publishNotificationUpdated({
      userId: session.user.id,
      channel: "quartermaster.knowledge",
      entityId: `${fromPath}->${toPath}`,
    })
    return NextResponse.json(payload)
  } catch (error) {
    if (error instanceof VaultRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Failed to move ship knowledge note:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
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
      return NextResponse.json(buildShipNotFoundErrorPayload(), { status: 404 })
    }

    const searchParams = request.nextUrl.searchParams
    const body = asRecord(await request.json().catch(() => ({})))
    const pathRaw =
      (typeof body.path === "string" ? body.path : null)
      || searchParams.get("path")
    if (!pathRaw) {
      return NextResponse.json({ error: "path is required" }, { status: 400 })
    }

    let path: string
    try {
      path = normalizeShipKnowledgePath(pathRaw, id)
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid knowledge path" },
        { status: 400 },
      )
    }

    const mode = parseDeleteMode(searchParams.get("mode"))
    const payload = dataCoreEnabled()
      ? await deleteVaultFileToDataCore({
          vaultId: "ship",
          notePath: path,
          mode,
          userId: session.user.id,
          shipDeploymentId: id,
        })
      : await deleteVaultFile("ship", path, mode)
    publishNotificationUpdated({
      userId: session.user.id,
      channel: "quartermaster.knowledge",
      entityId: path,
    })
    return NextResponse.json(payload)
  } catch (error) {
    if (error instanceof VaultRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Failed to delete ship knowledge note:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
