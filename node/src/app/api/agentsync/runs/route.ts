import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { asRecord, parseScope, parseTake } from "@/lib/agentsync/route-helpers"
import {
  AgentSyncError,
  listAgentSyncRunsForUser,
  runAgentSyncForUser,
} from "@/lib/agentsync/run"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const subagentId = request.nextUrl.searchParams.get("subagentId")?.trim() || null
    const take = parseTake(request.nextUrl.searchParams.get("take"))

    const runs = await listAgentSyncRunsForUser({
      userId: session.user.id,
      subagentId,
      take,
    })

    return NextResponse.json(runs)
  } catch (error) {
    if (error instanceof AgentSyncError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error listing AgentSync runs:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = asRecord(await request.json().catch(() => ({})))
    const scope = parseScope(body.scope)
    const subagentId = typeof body.subagentId === "string" && body.subagentId.trim()
      ? body.subagentId.trim()
      : null

    if (scope === "selected_agent" && !subagentId) {
      return NextResponse.json({ error: "subagentId is required for selected_agent scope" }, { status: 400 })
    }

    const run = await runAgentSyncForUser({
      userId: session.user.id,
      trigger: "manual",
      scope,
      subagentId,
      metadata: {
        initiatedBy: "api",
      },
    })

    return NextResponse.json(run, { status: 201 })
  } catch (error) {
    if (error instanceof AgentSyncError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error running AgentSync manually:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
