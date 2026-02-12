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
  try {
    const userId = await deps.getSessionUserId()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const payload = deps.getMetrics()
    return NextResponse.json(payload)
  } catch (error) {
    console.error("Failed to load node runtime metrics:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return handleGetNodeRuntimeMetrics(request)
}
