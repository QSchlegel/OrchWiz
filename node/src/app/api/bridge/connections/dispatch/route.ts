import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { publishNotificationUpdated } from "@/lib/realtime/notifications"
import {
  drainBridgeDispatchQueueSafely,
  enqueueBridgeDispatchDeliveries,
} from "@/lib/bridge/connections/dispatch"
import { isBridgeConnectionIdList } from "@/lib/bridge/connections/validation"

export const dynamic = "force-dynamic"

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = asRecord(await request.json().catch(() => ({})))
    const deploymentId = asNonEmptyString(body.deploymentId)
    const message = asNonEmptyString(body.message)

    if (!deploymentId || !message) {
      return NextResponse.json(
        { error: "deploymentId and message are required." },
        { status: 400 },
      )
    }

    const deployment = await prisma.agentDeployment.findFirst({
      where: {
        id: deploymentId,
        userId: session.user.id,
        deploymentType: "ship",
      },
      select: {
        id: true,
      },
    })

    if (!deployment) {
      return NextResponse.json({ error: "Deployment not found" }, { status: 404 })
    }

    const connectionIds = isBridgeConnectionIdList(body.connectionIds)
      ? body.connectionIds
      : undefined

    const deliveries = await enqueueBridgeDispatchDeliveries({
      deploymentId,
      source: "manual",
      message,
      payload: {
        type: "bridge.connection.manual",
      },
      metadata: {
        requestedBy: session.user.email,
      },
      connectionIds,
      includeDisabled: false,
      autoRelayOnly: false,
    })

    await drainBridgeDispatchQueueSafely({
      deploymentId,
      limit: Math.max(8, deliveries.length * 4),
      label: "bridge-connection.manual-dispatch",
    })

    const latest = await prisma.bridgeDispatchDelivery.findMany({
      where: {
        id: {
          in: deliveries.map((entry) => entry.id),
        },
      },
      include: {
        connection: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    publishNotificationUpdated({
      userId: session.user.id,
      channel: "bridge-connections",
      entityId: deploymentId,
    })

    return NextResponse.json({
      queued: deliveries.length,
      deliveries: latest.map((delivery) => ({
        id: delivery.id,
        connectionId: delivery.connectionId,
        connectionName: delivery.connection.name,
        provider: delivery.connection.provider,
        destination: delivery.connection.destination,
        status: delivery.status,
        attempts: delivery.attempts,
        nextAttemptAt: delivery.nextAttemptAt,
        providerMessageId: delivery.providerMessageId,
        lastError: delivery.lastError,
        deliveredAt: delivery.deliveredAt,
        createdAt: delivery.createdAt,
      })),
    })
  } catch (error) {
    console.error("Error dispatching bridge patch-through message:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
