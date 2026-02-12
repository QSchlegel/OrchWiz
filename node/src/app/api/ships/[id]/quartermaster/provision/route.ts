import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { publishNotificationUpdated } from "@/lib/realtime/notifications"
import { ensureShipQuartermaster, getShipQuartermasterState } from "@/lib/quartermaster/service"
import { buildShipNotFoundErrorPayload } from "@/lib/ships/errors"

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
    const state = await getShipQuartermasterState({
      userId: session.user.id,
      shipDeploymentId: id,
    })
    if (!state) {
      return NextResponse.json(buildShipNotFoundErrorPayload(), { status: 404 })
    }

    const quartermaster = await ensureShipQuartermaster({
      userId: session.user.id,
      shipDeploymentId: id,
      shipName: state.ship.name,
    })

    publishNotificationUpdated({
      userId: session.user.id,
      channel: "quartermaster.chat",
      entityId: id,
    })

    return NextResponse.json({
      quartermaster,
    })
  } catch (error) {
    if (
      error instanceof Error
      && error.message.includes("Ship deployment not found for Quartermaster provisioning")
    ) {
      return NextResponse.json(buildShipNotFoundErrorPayload(), { status: 404 })
    }

    console.error("Quartermaster provisioning failed:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
