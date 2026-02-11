import { NextRequest, NextResponse } from "next/server"
import { parseBearerToken } from "@/lib/agentsync/route-helpers"
import {
  runRuntimeIntelligenceNightlyConsolidation,
  runtimeIntelligenceNightlyCronToken,
} from "@/lib/runtime/intelligence"
import type { RuntimeIntelligenceConsolidationSummary } from "@/lib/runtime/intelligence/state"

export const dynamic = "force-dynamic"

export interface RuntimeIntelligenceNightlyRouteDeps {
  expectedToken: () => string | null
  now: () => Date
  runConsolidation: (now: Date) => Promise<RuntimeIntelligenceConsolidationSummary>
}

const defaultDeps: RuntimeIntelligenceNightlyRouteDeps = {
  expectedToken: () => runtimeIntelligenceNightlyCronToken(),
  now: () => new Date(),
  runConsolidation: (now) => runRuntimeIntelligenceNightlyConsolidation(now),
}

export async function handlePostNightly(
  request: NextRequest,
  deps: RuntimeIntelligenceNightlyRouteDeps = defaultDeps,
) {
  try {
    const expectedToken = deps.expectedToken()
    if (!expectedToken) {
      return NextResponse.json(
        { error: "RUNTIME_INTELLIGENCE_NIGHTLY_CRON_TOKEN is not configured" },
        { status: 503 },
      )
    }

    const suppliedToken = parseBearerToken(request.headers.get("authorization"))
    if (!suppliedToken || suppliedToken !== expectedToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const now = deps.now()
    const summary = await deps.runConsolidation(now)
    return NextResponse.json(summary)
  } catch (error) {
    console.error("Error running runtime intelligence nightly consolidation:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return handlePostNightly(request)
}
