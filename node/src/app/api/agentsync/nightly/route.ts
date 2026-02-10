import { NextRequest, NextResponse } from "next/server"
import { agentSyncCronToken } from "@/lib/agentsync/constants"
import { parseBearerToken } from "@/lib/agentsync/route-helpers"
import { runDueNightlyAgentSync } from "@/lib/agentsync/nightly"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const expectedToken = agentSyncCronToken()
    if (!expectedToken) {
      return NextResponse.json({ error: "AgentSync cron token is not configured" }, { status: 503 })
    }

    const suppliedToken = parseBearerToken(request.headers.get("authorization"))
    if (!suppliedToken || suppliedToken !== expectedToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const summary = await runDueNightlyAgentSync(new Date())
    return NextResponse.json(summary)
  } catch (error) {
    console.error("Error running nightly AgentSync:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
