import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import {
  drainBridgeDispatchQueueSafely,
  enqueueBridgeDispatchDeliveries,
} from "@/lib/bridge/connections/dispatch"

export const dynamic = "force-dynamic"

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

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
    const connection = await prisma.bridgeConnection.findFirst({
      where: {
        id,
        deployment: {
          userId: session.user.id,
          deploymentType: "ship",
        },
      },
      include: {
        deployment: {
          select: {
            id: true,
          },
        },
      },
    })

    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const message = asNonEmptyString(body?.message) || "Bridge connection test"

    const deliveries = await enqueueBridgeDispatchDeliveries({
      deploymentId: connection.deploymentId,
      source: "test",
      message,
      payload: {
        type: "bridge.connection.test",
      },
      metadata: {
        requestedBy: session.user.email,
      },
      connectionIds: [connection.id],
      includeDisabled: true,
    })

    await drainBridgeDispatchQueueSafely({
      deploymentId: connection.deploymentId,
      limit: Math.max(4, deliveries.length * 4),
      label: "bridge-connection.test",
    })

    const latest = await prisma.bridgeDispatchDelivery.findFirst({
      where: {
        deploymentId: connection.deploymentId,
        connectionId: connection.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return NextResponse.json({
      queued: deliveries.length,
      delivery: latest,
      ok: latest?.status === "completed",
    })
  } catch (error) {
    console.error("Error testing bridge connection:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
