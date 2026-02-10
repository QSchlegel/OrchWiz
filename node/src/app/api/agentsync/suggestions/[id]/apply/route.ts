import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { AgentSyncError, applyAgentSyncSuggestion } from "@/lib/agentsync/run"

export const dynamic = "force-dynamic"

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const suggestion = await applyAgentSyncSuggestion({
      userId: session.user.id,
      suggestionId: id,
    })

    return NextResponse.json(suggestion)
  } catch (error) {
    if (error instanceof AgentSyncError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error applying AgentSync suggestion:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
