import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { resolveVaultAbsolutePath } from "@/lib/vault/config"
import { buildShipKnowledgeTree, filterShipKnowledgePaths } from "@/lib/vault/knowledge"
import { directoryExists, collectMarkdownFilePaths } from "@/lib/vault/fs"
import { getLatestVaultRagSyncRun } from "@/lib/vault/rag"
import { parseKnowledgeScope } from "../route-helpers"

export const dynamic = "force-dynamic"

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

    const scope = parseKnowledgeScope(request.nextUrl.searchParams.get("scope"))
    const shipVaultRoot = resolveVaultAbsolutePath("ship")
    if (!(await directoryExists(shipVaultRoot))) {
      return NextResponse.json({
        shipDeploymentId: id,
        scope,
        tree: [],
        noteCount: 0,
        latestSync: null,
      })
    }

    const allPaths = await collectMarkdownFilePaths(shipVaultRoot)
    const filteredPaths = filterShipKnowledgePaths({
      paths: allPaths,
      scope,
      shipDeploymentId: id,
    })

    const latestSync = await getLatestVaultRagSyncRun(
      scope === "ship"
        ? {
            scope: "ship",
            shipDeploymentId: id,
          }
        : scope === "fleet"
          ? {
              scope: "fleet",
            }
          : {},
    )

    return NextResponse.json({
      shipDeploymentId: id,
      scope,
      tree: buildShipKnowledgeTree(filteredPaths),
      noteCount: filteredPaths.length,
      latestSync,
    })
  } catch (error) {
    console.error("Failed to load ship knowledge tree:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
