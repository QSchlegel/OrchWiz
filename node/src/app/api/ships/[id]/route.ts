import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import { publishShipUpdated } from "@/lib/shipyard/events"
import {
  normalizeDeploymentProfileInput,
  normalizeInfrastructureInConfig,
} from "@/lib/deployment/profile"
import { publishNotificationUpdated } from "@/lib/realtime/notifications"

export const dynamic = "force-dynamic"

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

export function mergeShipConfig(existingConfig: unknown, incomingConfig: unknown): Record<string, unknown> {
  const existing = asRecord(existingConfig)
  const incoming = asRecord(incomingConfig)

  const hasIncomingInfrastructure = Object.prototype.hasOwnProperty.call(incoming, "infrastructure")
  const hasIncomingCloudProvider = Object.prototype.hasOwnProperty.call(incoming, "cloudProvider")
  const hasIncomingMonitoring = Object.prototype.hasOwnProperty.call(incoming, "monitoring")

  return {
    ...existing,
    ...incoming,
    ...(hasIncomingInfrastructure
      ? {
          infrastructure: {
            ...asRecord(existing.infrastructure),
            ...asRecord(incoming.infrastructure),
          },
        }
      : {}),
    ...(hasIncomingCloudProvider
      ? {
          cloudProvider: {
            ...asRecord(existing.cloudProvider),
            ...asRecord(incoming.cloudProvider),
          },
        }
      : {}),
    ...(hasIncomingMonitoring
      ? {
          monitoring: {
            ...asRecord(existing.monitoring),
            ...asRecord(incoming.monitoring),
          },
        }
      : {}),
  }
}

export function sanitizeShipUpdateData(body: Record<string, unknown>): Record<string, unknown> {
  const updateData: Record<string, unknown> = {
    ...body,
    deploymentType: "ship",
    updatedAt: new Date(),
  }

  delete updateData.userId
  delete updateData.advancedNodeTypeOverride
  delete updateData.shipVersion
  delete updateData.shipVersionUpdatedAt

  return updateData
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const ship = await prisma.agentDeployment.findFirst({
      where: {
        id,
        userId: session.user.id,
        deploymentType: "ship",
      },
      include: {
        subagent: true,
      },
    })

    if (!ship) {
      return NextResponse.json({ error: "Ship not found" }, { status: 404 })
    }

    const normalizedInfrastructure = normalizeInfrastructureInConfig(
      ship.deploymentProfile,
      ship.config,
    )

    return NextResponse.json({
      ...ship,
      config: normalizedInfrastructure.config,
    })
  } catch (error) {
    console.error("Error fetching ship:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const body = asRecord(await request.json().catch(() => ({})))
    const updateData = sanitizeShipUpdateData(body) as Record<string, any>

    const shouldNormalizeProfileInput =
      "deploymentProfile" in body ||
      "provisioningMode" in body ||
      "nodeType" in body ||
      "advancedNodeTypeOverride" in body ||
      "config" in body

    if (shouldNormalizeProfileInput) {
      const existingShip = await prisma.agentDeployment.findFirst({
        where: {
          id,
          userId: session.user.id,
          deploymentType: "ship",
        },
        select: {
          deploymentProfile: true,
          provisioningMode: true,
          nodeType: true,
          config: true,
        },
      })

      if (!existingShip) {
        return NextResponse.json({ error: "Ship not found" }, { status: 404 })
      }

      const mergedConfig =
        "config" in body
          ? mergeShipConfig(existingShip.config, body.config)
          : existingShip.config

      const normalizedProfile = normalizeDeploymentProfileInput({
        deploymentProfile: body.deploymentProfile ?? existingShip.deploymentProfile,
        provisioningMode: body.provisioningMode ?? existingShip.provisioningMode,
        nodeType: body.nodeType ?? existingShip.nodeType,
        advancedNodeTypeOverride: body.advancedNodeTypeOverride,
        config: mergedConfig,
      })

      updateData.deploymentProfile = normalizedProfile.deploymentProfile
      updateData.provisioningMode = normalizedProfile.provisioningMode
      updateData.nodeType = normalizedProfile.nodeType
      updateData.config = normalizedProfile.config
    }

    const ship = await prisma.agentDeployment.update({
      where: {
        id,
        userId: session.user.id,
      },
      data: updateData,
      include: {
        subagent: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
    })

    publishShipUpdated({
      shipId: ship.id,
      status: ship.status,
      nodeId: ship.nodeId,
    })

    publishNotificationUpdated({
      userId: session.user.id,
      channel: "ships",
      entityId: ship.id,
    })

    return NextResponse.json(ship)
  } catch (error) {
    console.error("Error updating ship:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    const ship = await prisma.agentDeployment.findFirst({
      where: {
        id,
        userId: session.user.id,
        deploymentType: "ship",
      },
      select: {
        id: true,
        nodeId: true,
      },
    })

    if (!ship) {
      return NextResponse.json({ error: "Ship not found" }, { status: 404 })
    }

    await prisma.agentDeployment.delete({
      where: {
        id: ship.id,
        userId: session.user.id,
      },
    })

    publishShipUpdated({
      shipId: ship.id,
      status: "deleted",
      nodeId: ship.nodeId,
    })

    publishNotificationUpdated({
      userId: session.user.id,
      channel: "ships",
      entityId: ship.id,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting ship:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
