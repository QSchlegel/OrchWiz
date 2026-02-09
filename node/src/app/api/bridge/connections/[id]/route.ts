import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import {
  BridgeConnectionValidationError,
  validateBridgeConnectionConfig,
  validateBridgeConnectionCredentials,
  validateBridgeConnectionDestination,
} from "@/lib/bridge/connections/validation"
import {
  BridgeConnectionSecretsError,
  storeBridgeConnectionCredentials,
  summarizeStoredBridgeConnectionCredentials,
} from "@/lib/bridge/connections/secrets"

export const dynamic = "force-dynamic"

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asBoolean(value: unknown): boolean | null {
  if (value === true || value === false) {
    return value
  }

  return null
}

function mapConnectionForResponse(connection: {
  id: string
  deploymentId: string
  provider: string
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

async function resolveOwnedConnection(id: string, userId: string) {
  return prisma.bridgeConnection.findFirst({
    where: {
      id,
      deployment: {
        userId,
        deploymentType: "ship",
      },
    },
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const existing = await resolveOwnedConnection(id, session.user.id)
    if (!existing) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const updateData: Record<string, unknown> = {}

    if (Object.prototype.hasOwnProperty.call(body, "name")) {
      const name = asNonEmptyString(body.name)
      if (!name) {
        throw new BridgeConnectionValidationError("name must be a non-empty string.")
      }
      updateData.name = name
    }

    if (Object.prototype.hasOwnProperty.call(body, "destination")) {
      updateData.destination = validateBridgeConnectionDestination(existing.provider, body.destination)
    }

    if (Object.prototype.hasOwnProperty.call(body, "config")) {
      updateData.config = validateBridgeConnectionConfig(body.config)
    }

    if (Object.prototype.hasOwnProperty.call(body, "enabled")) {
      const enabled = asBoolean(body.enabled)
      if (enabled === null) {
        throw new BridgeConnectionValidationError("enabled must be a boolean.")
      }
      updateData.enabled = enabled
    }

    if (Object.prototype.hasOwnProperty.call(body, "autoRelay")) {
      const autoRelay = asBoolean(body.autoRelay)
      if (autoRelay === null) {
        throw new BridgeConnectionValidationError("autoRelay must be a boolean.")
      }
      updateData.autoRelay = autoRelay
    }

    if (Object.prototype.hasOwnProperty.call(body, "credentials")) {
      const validated = validateBridgeConnectionCredentials(existing.provider, body.credentials)
      updateData.credentials = await storeBridgeConnectionCredentials({
        connectionId: existing.id,
        credentials: validated,
      })
    }

    const updated = await prisma.bridgeConnection.update({
      where: {
        id: existing.id,
      },
      data: updateData,
    })

    return NextResponse.json(mapConnectionForResponse(updated))
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

    console.error("Error updating bridge connection:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const existing = await resolveOwnedConnection(id, session.user.id)
    if (!existing) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    }

    await prisma.bridgeConnection.delete({
      where: {
        id: existing.id,
      },
    })

    return NextResponse.json({ deleted: true })
  } catch (error) {
    console.error("Error deleting bridge connection:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
