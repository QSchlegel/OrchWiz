import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getNodeRuntimeMetrics, type NodeRuntimeMetrics } from "@/lib/runtime/node-metrics"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export interface RuntimeNodeMetricsRouteDeps {
  getSessionUserId: () => Promise<string | null>
  getMetrics: () => NodeRuntimeMetrics
}

const defaultDeps: RuntimeNodeMetricsRouteDeps = {
  getSessionUserId: async () => {
    const session = await auth.api.getSession({ headers: await headers() })
    return session?.user?.id || null
  },
  getMetrics: () => getNodeRuntimeMetrics(),
}

export async function handleGetNodeRuntimeMetrics(
  _request: NextRequest,
  deps: RuntimeNodeMetricsRouteDeps = defaultDeps,
) {
  let userId: string | null
  try {
    userId = await deps.getSessionUserId()
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    console.error("[node/metrics] getSessionUserId failed:", err.message)
    if (process.env.NODE_ENV !== "production" && err.stack) {
      console.error(err.stack)
    }
    return NextResponse.json(
      { error: "Service unavailable", code: "AUTH_UNAVAILABLE" },
      { status: 503, headers: { "Retry-After": "5" } },
    )
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const payload = deps.getMetrics()
    return NextResponse.json(payload)
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    console.error("[node/metrics] getMetrics failed:", err.message)
    if (process.env.NODE_ENV !== "production" && err.stack) {
      console.error(err.stack)
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return handleGetNodeRuntimeMetrics(request)
}
