import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { inspectLocalShipRuntime } from "@/lib/shipyard/local-runtime"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const snapshot = await inspectLocalShipRuntime()
    return NextResponse.json(snapshot)
  } catch (error) {
    console.error("Error inspecting local ship runtime:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
