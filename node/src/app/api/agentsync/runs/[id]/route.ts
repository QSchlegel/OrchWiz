import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { AgentSyncError, getAgentSyncRunForUser } from "@/lib/agentsync/run"

export const dynamic = "force-dynamic"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const run = await getAgentSyncRunForUser({
      userId: session.user.id,
      runId: id,
    })

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 })
    }

    return NextResponse.json(run)
  } catch (error) {
    if (error instanceof AgentSyncError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error loading AgentSync run:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
