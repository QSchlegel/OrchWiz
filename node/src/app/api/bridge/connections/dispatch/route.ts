import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { publishNotificationUpdated } from "@/lib/realtime/notifications"
import {
  drainBridgeDispatchQueueSafely,
  enqueueBridgeDispatchDeliveries,
} from "@/lib/bridge/connections/dispatch"
import { resolveShipNamespace } from "@/lib/bridge/openclaw-runtime"
import { BridgeDispatchRuntimeValidationError } from "@/lib/bridge/connections/dispatch-runtime"
import {
  BridgeDispatchRequestValidationError,
  parseBridgeDispatchRequestBody,
} from "./parsing"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedBody = parseBridgeDispatchRequestBody(await request.json().catch(() => ({})))

    const deployment = await prisma.agentDeployment.findFirst({
      where: {
        id: parsedBody.deploymentId,
        userId: session.user.id,
        deploymentType: "ship",
      },
      select: {
        id: true,
        deploymentProfile: true,
        config: true,
      },
    })

    if (!deployment) {
      return NextResponse.json({ error: "Deployment not found" }, { status: 404 })
    }

    const shipNamespace = resolveShipNamespace(deployment.config, deployment.deploymentProfile)

    const deliveries = await enqueueBridgeDispatchDeliveries({
      deploymentId: parsedBody.deploymentId,
      source: "manual",
      message: parsedBody.message,
      payload: {
        type: "bridge.connection.manual",
        runtime: {
          id: parsedBody.runtime,
        },
        shipContext: {
          deploymentProfile: deployment.deploymentProfile,
          ...(shipNamespace
            ? {
                namespace: shipNamespace,
              }
            : {}),
        },
        ...(parsedBody.bridgeContext
          ? {
              bridgeContext: parsedBody.bridgeContext,
            }
          : {}),
      },
      metadata: {
        requestedBy: session.user.email,
      },
      connectionIds: parsedBody.connectionIds,
      includeDisabled: false,
      autoRelayOnly: false,
    })

    await drainBridgeDispatchQueueSafely({
      deploymentId: parsedBody.deploymentId,
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
      entityId: parsedBody.deploymentId,
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
    if (error instanceof BridgeDispatchRequestValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    if (error instanceof BridgeDispatchRuntimeValidationError) {
      return NextResponse.json(
        {
          error: error.message,
          supportedRuntimeIds: error.supportedRuntimeIds,
        },
        { status: 400 },
      )
    }

    console.error("Error dispatching bridge patch-through message:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
