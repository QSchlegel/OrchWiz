import crypto from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { listBridgeDispatchDeliveries } from "@/lib/bridge/connections/dispatch"
import {
  BridgeConnectionValidationError,
  parseBridgeConnectionCreateInput,
} from "@/lib/bridge/connections/validation"
import {
  BridgeConnectionSecretsError,
  storeBridgeConnectionCredentials,
  summarizeStoredBridgeConnectionCredentials,
} from "@/lib/bridge/connections/secrets"
import type { BridgeConnectionProvider } from "@prisma/client"

export const dynamic = "force-dynamic"

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseTake(value: string | null, fallback = 20): number {
  const parsed = Number.parseInt(value || "", 10)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.max(1, Math.min(100, parsed))
}

function mapConnectionForResponse(connection: {
  id: string
  deploymentId: string
  provider: BridgeConnectionProvider
  name: string
  destination: string
  enabled: boolean
  autoRelay: boolean
  config: unknown
  credentials: unknown
  lastDeliveryAt: Date | null
  lastDeliveryStatus: string | null
  lastError: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: connection.id,
    deploymentId: connection.deploymentId,
    provider: connection.provider,
    name: connection.name,
    destination: connection.destination,
    enabled: connection.enabled,
    autoRelay: connection.autoRelay,
    config: connection.config || {},
    credentials: summarizeStoredBridgeConnectionCredentials(connection.credentials),
    lastDeliveryAt: connection.lastDeliveryAt,
    lastDeliveryStatus: connection.lastDeliveryStatus,
    lastError: connection.lastError,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const deploymentId = asNonEmptyString(request.nextUrl.searchParams.get("deploymentId"))
    if (!deploymentId) {
      return NextResponse.json({ error: "deploymentId is required" }, { status: 400 })
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

    const deliveriesTake = parseTake(request.nextUrl.searchParams.get("deliveriesTake"), 20)

    const [connections, deliveries] = await Promise.all([
      prisma.bridgeConnection.findMany({
        where: {
          deploymentId,
        },
        orderBy: {
          updatedAt: "desc",
        },
      }),
      listBridgeDispatchDeliveries({
        deploymentId,
        take: deliveriesTake,
      }),
    ])

    const providerSummary = {
      telegram: { total: 0, enabled: 0 },
      discord: { total: 0, enabled: 0 },
      whatsapp: { total: 0, enabled: 0 },
    }

    for (const connection of connections) {
      providerSummary[connection.provider].total += 1
      if (connection.enabled) {
        providerSummary[connection.provider].enabled += 1
      }
    }

    return NextResponse.json({
      deploymentId,
      connections: connections.map(mapConnectionForResponse),
      summary: {
        total: connections.length,
        enabled: connections.filter((entry) => entry.enabled).length,
        autoRelay: connections.filter((entry) => entry.enabled && entry.autoRelay).length,
        providers: providerSummary,
        lastDeliveryAt: deliveries[0]?.createdAt || null,
        lastDeliveryStatus: deliveries[0]?.status || null,
      },
      deliveries: deliveries.map((delivery) => ({
        id: delivery.id,
        deploymentId: delivery.deploymentId,
        connectionId: delivery.connectionId,
        connectionName: delivery.connection.name,
        provider: delivery.connection.provider,
        destination: delivery.connection.destination,
        source: delivery.source,
        status: delivery.status,
        message: delivery.message,
        attempts: delivery.attempts,
        nextAttemptAt: delivery.nextAttemptAt,
        providerMessageId: delivery.providerMessageId,
        lastError: delivery.lastError,
        deliveredAt: delivery.deliveredAt,
        createdAt: delivery.createdAt,
        updatedAt: delivery.updatedAt,
      })),
    })
  } catch (error) {
    console.error("Error loading bridge connections:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const deploymentId = asNonEmptyString(body?.deploymentId)
    if (!deploymentId) {
      return NextResponse.json({ error: "deploymentId is required" }, { status: 400 })
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

    const parsed = parseBridgeConnectionCreateInput(body)
    const connectionId = crypto.randomUUID()
    const storedCredentials = await storeBridgeConnectionCredentials({
      connectionId,
      credentials: parsed.credentials,
    })

    const connection = await prisma.bridgeConnection.create({
      data: {
        id: connectionId,
        deploymentId,
        provider: parsed.provider,
        name: parsed.name,
        destination: parsed.destination,
        enabled: parsed.enabled,
        autoRelay: parsed.autoRelay,
        config: parsed.config,
        credentials: storedCredentials,
      },
    })

    return NextResponse.json(mapConnectionForResponse(connection), { status: 201 })
  } catch (error) {
    if (error instanceof BridgeConnectionValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    if (error instanceof BridgeConnectionSecretsError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        { status: error.status },
      )
    }

    console.error("Error creating bridge connection:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
