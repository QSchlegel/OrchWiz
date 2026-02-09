import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import { publishRealtimeEvent } from "@/lib/realtime/events"

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { mode } = body

    if (!mode || !["plan", "auto_accept"].includes(mode)) {
      return NextResponse.json(
        { error: "Invalid mode. Must be 'plan' or 'auto_accept'" },
        { status: 400 }
      )
    }

    const updatedSession = await prisma.session.update({
      where: {
        id,
        userId: session.user.id,
      },
      data: {
        mode,
      },
    })

    publishRealtimeEvent({
      type: "session.prompted",
      payload: {
        sessionId: updatedSession.id,
        mode: updatedSession.mode,
      },
    })

    return NextResponse.json(updatedSession)
  } catch (error) {
    console.error("Error updating session mode:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
