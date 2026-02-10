import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { ensureShipQuartermaster } from "@/lib/quartermaster/service"

export const dynamic = "force-dynamic"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const quartermaster = await ensureShipQuartermaster({
      userId: session.user.id,
      shipDeploymentId: id,
    })

    return NextResponse.json({
      quartermaster,
    })
  } catch (error) {
    console.error("Quartermaster provisioning failed:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
