import { NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import { runDeploymentAdapter } from "@/lib/deployment/adapter"
import { publishRealtimeEvent } from "@/lib/realtime/events"
import { mapForwardedDeployment } from "@/lib/forwarding/projections"
import { publishShipUpdated } from "@/lib/shipyard/events"
import {
  normalizeDeploymentProfileInput,
  normalizeInfrastructureInConfig,
  parseDeploymentType,
} from "@/lib/deployment/profile"
import { SHIP_BASELINE_VERSION, SHIP_LATEST_VERSION } from "@/lib/shipyard/versions"

export const dynamic = 'force-dynamic'
// Deprecated alias route: prefer /api/ships for ship operations.

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const includeForwarded = request.nextUrl.searchParams.get("includeForwarded") === "true"
    const sourceNodeId = request.nextUrl.searchParams.get("sourceNodeId")
    const deploymentTypeQuery = request.nextUrl.searchParams.get("deploymentType")
    const deploymentType =
      deploymentTypeQuery === null
        ? "ship"
        : deploymentTypeQuery === "agent" || deploymentTypeQuery === "ship"
          ? parseDeploymentType(deploymentTypeQuery)
          : "ship"

    const deployments = await prisma.agentDeployment.findMany({
      where: {
        userId: session.user.id,
        deploymentType,
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
    const normalizedDeployments = deployments.map((deployment) => {
      const normalizedInfrastructure = normalizeInfrastructureInConfig(
        deployment.deploymentProfile,
        deployment.config,
      )
      return {
        ...deployment,
        config: normalizedInfrastructure.config,
      }
    })

    if (!includeForwarded) {
      return NextResponse.json(normalizedDeployments)
    }

    const forwardedEvents = await prisma.forwardingEvent.findMany({
      where: {
        eventType: "deployment",
        sourceNode: {
          ownerUserId: session.user.id,
        },
        ...(sourceNodeId
          ? {
              sourceNode: {
                ownerUserId: session.user.id,
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

    const forwardedDeployments = forwardedEvents
      .map(mapForwardedDeployment)
      .filter((deployment) => deployment.deploymentType === deploymentType)
    const combined = [...normalizedDeployments, ...forwardedDeployments].sort((a: any, b: any) => {
      const aDate = new Date(a.createdAt || a.forwardingOccurredAt || 0).getTime()
      const bDate = new Date(b.createdAt || b.forwardingOccurredAt || 0).getTime()
      return bDate - aDate
    })

    return NextResponse.json(combined)
  } catch (error) {
    console.error("Error fetching deployments:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
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
      deploymentType,
    } = body
    const resolvedDeploymentType =
      deploymentType === "agent" || deploymentType === "ship" ? deploymentType : "ship"
    const nextShipVersion =
      resolvedDeploymentType === "ship" ? SHIP_LATEST_VERSION : SHIP_BASELINE_VERSION
    const nextShipVersionUpdatedAt =
      resolvedDeploymentType === "ship" ? new Date() : null

    const normalizedProfile = normalizeDeploymentProfileInput({
      deploymentProfile,
      provisioningMode,
      nodeType,
      advancedNodeTypeOverride,
      config,
    })

    const deployment = await prisma.agentDeployment.create({
      data: {
        name,
        description,
        subagentId: subagentId || null,
        nodeId,
        nodeType: normalizedProfile.nodeType,
        deploymentType: parseDeploymentType(resolvedDeploymentType),
        deploymentProfile: normalizedProfile.deploymentProfile,
        provisioningMode: normalizedProfile.provisioningMode,
        nodeUrl: nodeUrl || null,
        shipVersion: nextShipVersion,
        shipVersionUpdatedAt: nextShipVersionUpdatedAt,
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
      where: { id: deployment.id },
      data: {
        status: "deploying",
      },
    })

    const adapterResult = await runDeploymentAdapter({
      kind: "agent",
      recordId: deployment.id,
      name: deployment.name,
      nodeId: deployment.nodeId,
      nodeType: deployment.nodeType,
      nodeUrl: deployment.nodeUrl,
      deploymentProfile: deployment.deploymentProfile,
      provisioningMode: deployment.provisioningMode,
      config: (deployment.config || {}) as Record<string, unknown>,
      infrastructure: (((deployment.config || {}) as Record<string, unknown>).infrastructure ||
        undefined) as Record<string, unknown> | undefined,
      metadata: (deployment.metadata || {}) as Record<string, unknown>,
    })

    const updatedDeployment = await prisma.agentDeployment.update({
      where: { id: deployment.id },
      data: {
        status: adapterResult.status,
        deployedAt: adapterResult.deployedAt || null,
        lastHealthCheck: adapterResult.lastHealthCheck || null,
        healthStatus: adapterResult.healthStatus || null,
        metadata: {
          ...(deployment.metadata as Record<string, unknown> | null),
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

    if (updatedDeployment.deploymentType === "ship") {
      publishShipUpdated({
        shipId: updatedDeployment.id,
        status: updatedDeployment.status,
        nodeId: updatedDeployment.nodeId,
        userId: updatedDeployment.userId,
      })
    } else {
      publishRealtimeEvent({
        type: "deployment.updated",
        userId: updatedDeployment.userId,
        payload: {
          deploymentId: updatedDeployment.id,
          status: updatedDeployment.status,
          nodeId: updatedDeployment.nodeId,
        },
      })
    }

    return NextResponse.json(updatedDeployment)
  } catch (error) {
    console.error("Error creating deployment:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
