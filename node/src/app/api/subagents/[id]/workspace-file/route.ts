import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  AccessControlError,
  assertCanWriteOwnedResource,
  requireAccessActor,
} from "@/lib/security/access-control"
import { normalizeSubagentSettings } from "@/lib/subagents/settings"
import {
  readSubagentWorkspaceFile,
  resolveSubagentWorkingDirectoryRoot,
  WorkspaceInspectorError,
} from "@/lib/subagents/workspace-inspector"

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireAccessActor()
    const { id } = await params
    const path = request.nextUrl.searchParams.get("path")

    if (!path || !path.trim()) {
      return NextResponse.json({ error: "path query parameter is required" }, { status: 400 })
    }

    const subagent = await prisma.subagent.findUnique({
      where: { id },
      select: {
        id: true,
        ownerUserId: true,
        settings: true,
      },
    })

    if (!subagent) {
      return NextResponse.json({ error: "Subagent not found" }, { status: 404 })
    }

    assertCanWriteOwnedResource({
      actor,
      ownerUserId: subagent.ownerUserId,
      notFoundMessage: "Subagent not found",
    })

    const settings = normalizeSubagentSettings(subagent.settings)
    const rootPath = resolveSubagentWorkingDirectoryRoot(settings.workspace.workingDirectory)
    const payload = await readSubagentWorkspaceFile({
      rootPath,
      pathInput: path,
    })

    return NextResponse.json({
      subagentId: subagent.id,
      ...payload,
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    if (error instanceof WorkspaceInspectorError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error loading subagent workspace file:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
