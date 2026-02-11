import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  AccessControlError,
  assertCanWriteOwnedResource,
  requireAccessActor,
} from "@/lib/security/access-control"
import { normalizeSubagentSettings } from "@/lib/subagents/settings"
import {
  listSubagentWorkspaceDirectory,
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
    const payload = await listSubagentWorkspaceDirectory({
      rootPath,
      pathInput: request.nextUrl.searchParams.get("path"),
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

    console.error("Error loading subagent workspace tree:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
