import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { publishNotificationUpdated } from "@/lib/realtime/notifications"
import { deleteVaultFile, moveVaultFile, saveVaultFile, VaultRequestError } from "@/lib/vault"
import { queryVaultRag } from "@/lib/vault/rag"
import { normalizeShipKnowledgePath } from "@/lib/vault/knowledge"
import {
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

    const searchParams = request.nextUrl.searchParams
    const query = (searchParams.get("q") || "").trim()
    const mode = parseKnowledgeQueryMode(searchParams.get("mode"))
    const scope = parseKnowledgeScope(searchParams.get("scope"))
    const k = parseTopK(searchParams.get("k"))

    if (!query) {
      return NextResponse.json({
        shipDeploymentId: id,
        query,
        scope,
        mode,
        fallbackUsed: false,
        results: [],
      })
    }

    const result = await queryVaultRag({
      query,
      vaultId: "joined",
      mode,
      scope,
      shipDeploymentId: id,
      k,
    })

    return NextResponse.json({
      shipDeploymentId: id,
      query,
      scope,
      mode: result.mode,
      fallbackUsed: result.fallbackUsed,
      results: result.results,
    })
  } catch (error) {
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
      return NextResponse.json({ error: "Ship not found" }, { status: 404 })
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

    const payload = await saveVaultFile("ship", path, content)
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
      return NextResponse.json({ error: "Ship not found" }, { status: 404 })
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

    const payload = await moveVaultFile("ship", fromPath, toPath)
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
      return NextResponse.json({ error: "Ship not found" }, { status: 404 })
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
    const payload = await deleteVaultFile("ship", path, mode)
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
