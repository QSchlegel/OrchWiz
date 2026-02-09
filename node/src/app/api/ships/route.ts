import { NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import { runDeploymentAdapter } from "@/lib/deployment/adapter"
import { mapForwardedDeployment } from "@/lib/forwarding/projections"
import { publishShipUpdated } from "@/lib/shipyard/events"
import {
  normalizeDeploymentProfileInput,
  normalizeInfrastructureInConfig,
} from "@/lib/deployment/profile"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const includeForwarded = request.nextUrl.searchParams.get("includeForwarded") === "true"
    const sourceNodeId = request.nextUrl.searchParams.get("sourceNodeId")

    const ships = await prisma.agentDeployment.findMany({
      where: {
        userId: session.user.id,
        deploymentType: "ship",
      },
      include: {
        subagent: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    const normalizedShips = ships.map((ship) => {
      const normalizedInfrastructure = normalizeInfrastructureInConfig(
        ship.deploymentProfile,
        ship.config,
      )
      return {
        ...ship,
        config: normalizedInfrastructure.config,
      }
    })

    if (!includeForwarded) {
      return NextResponse.json(normalizedShips)
    }

    const forwardedEvents = await prisma.forwardingEvent.findMany({
      where: {
        eventType: "deployment",
        ...(sourceNodeId
          ? {
              sourceNode: {
                nodeId: sourceNodeId,
              },
            }
          : {}),
      },
      include: {
        sourceNode: true,
      },
      orderBy: {
        occurredAt: "desc",
      },
      take: 100,
    })

    const forwardedShips = forwardedEvents
      .map(mapForwardedDeployment)
      .filter((deployment) => deployment.deploymentType === "ship")

    const combined = [...normalizedShips, ...forwardedShips].sort((a: any, b: any) => {
      const aDate = new Date(a.createdAt || a.forwardingOccurredAt || 0).getTime()
      const bDate = new Date(b.createdAt || b.forwardingOccurredAt || 0).getTime()
      return bDate - aDate
    })

    return NextResponse.json(combined)
  } catch (error) {
    console.error("Error fetching ships:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const {
      name,
      description,
      subagentId,
      nodeId,
      nodeType,
      nodeUrl,
      config,
      metadata,
      deploymentProfile,
      provisioningMode,
      advancedNodeTypeOverride,
    } = body

    const normalizedProfile = normalizeDeploymentProfileInput({
      deploymentProfile,
      provisioningMode,
      nodeType,
      advancedNodeTypeOverride,
      config,
    })

    const ship = await prisma.agentDeployment.create({
      data: {
        name,
        description,
        subagentId: subagentId || null,
        nodeId,
        nodeType: normalizedProfile.nodeType,
        deploymentType: "ship",
        deploymentProfile: normalizedProfile.deploymentProfile,
        provisioningMode: normalizedProfile.provisioningMode,
        nodeUrl: nodeUrl || null,
        config: normalizedProfile.config as Prisma.InputJsonValue,
        metadata: metadata || {},
        userId: session.user.id,
        status: "pending",
      },
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

    await prisma.agentDeployment.update({
      where: { id: ship.id },
      data: {
        status: "deploying",
      },
    })

    const adapterResult = await runDeploymentAdapter({
      kind: "agent",
      recordId: ship.id,
      name: ship.name,
      nodeId: ship.nodeId,
      nodeType: ship.nodeType,
      nodeUrl: ship.nodeUrl,
      deploymentProfile: ship.deploymentProfile,
      provisioningMode: ship.provisioningMode,
      config: (ship.config || {}) as Record<string, unknown>,
      infrastructure: (((ship.config || {}) as Record<string, unknown>).infrastructure ||
        undefined) as Record<string, unknown> | undefined,
      metadata: (ship.metadata || {}) as Record<string, unknown>,
    })

    const updatedShip = await prisma.agentDeployment.update({
      where: { id: ship.id },
      data: {
        status: adapterResult.status,
        deployedAt: adapterResult.deployedAt || null,
        lastHealthCheck: adapterResult.lastHealthCheck || null,
        healthStatus: adapterResult.healthStatus || null,
        metadata: {
          ...(ship.metadata as Record<string, unknown> | null),
          ...(adapterResult.metadata || {}),
          ...(adapterResult.error ? { deploymentError: adapterResult.error } : {}),
        },
      },
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
      shipId: updatedShip.id,
      status: updatedShip.status,
      nodeId: updatedShip.nodeId,
    })

    return NextResponse.json(updatedShip)
  } catch (error) {
    console.error("Error creating ship:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
