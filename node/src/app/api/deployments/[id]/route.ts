import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import { publishRealtimeEvent } from "@/lib/realtime/events"
import { publishShipUpdated } from "@/lib/shipyard/events"
import {
  normalizeDeploymentProfileInput,
  normalizeInfrastructureInConfig,
  parseDeploymentType,
} from "@/lib/deployment/profile"

export const dynamic = 'force-dynamic'
// Deprecated alias route: prefer /api/ships/[id] for ship operations.

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
    const deployment = await prisma.agentDeployment.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      include: {
        subagent: true,
      },
    })

    if (!deployment) {
      return NextResponse.json({ error: "Deployment not found" }, { status: 404 })
    }

    const normalizedInfrastructure = normalizeInfrastructureInConfig(
      deployment.deploymentProfile,
      deployment.config,
    )

    return NextResponse.json({
      ...deployment,
      config: normalizedInfrastructure.config,
    })
  } catch (error) {
    console.error("Error fetching deployment:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
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
    const body = await request.json()
    const updateData: Record<string, any> = {
      ...body,
      updatedAt: new Date(),
    }

    const shouldNormalizeProfileInput =
      "deploymentProfile" in body ||
      "provisioningMode" in body ||
      "nodeType" in body ||
      "advancedNodeTypeOverride" in body ||
      "config" in body

    if (shouldNormalizeProfileInput) {
      const existingDeployment = await prisma.agentDeployment.findFirst({
        where: {
          id,
          userId: session.user.id,
        },
        select: {
          deploymentProfile: true,
          provisioningMode: true,
          nodeType: true,
          config: true,
        },
      })

      if (!existingDeployment) {
        return NextResponse.json({ error: "Deployment not found" }, { status: 404 })
      }

      const normalizedProfile = normalizeDeploymentProfileInput({
        deploymentProfile: body.deploymentProfile ?? existingDeployment.deploymentProfile,
        provisioningMode: body.provisioningMode ?? existingDeployment.provisioningMode,
        nodeType: body.nodeType ?? existingDeployment.nodeType,
        advancedNodeTypeOverride: body.advancedNodeTypeOverride,
        config: body.config ?? existingDeployment.config,
      })

      updateData.deploymentProfile = normalizedProfile.deploymentProfile
      updateData.provisioningMode = normalizedProfile.provisioningMode
      updateData.nodeType = normalizedProfile.nodeType
      updateData.config = normalizedProfile.config
    }

    if (body.deploymentType === "agent" || body.deploymentType === "ship") {
      updateData.deploymentType = parseDeploymentType(body.deploymentType)
    }

    delete updateData.advancedNodeTypeOverride

    const deployment = await prisma.agentDeployment.update({
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

    if (deployment.deploymentType === "ship") {
      publishShipUpdated({
        shipId: deployment.id,
        status: deployment.status,
        nodeId: deployment.nodeId,
      })
    } else {
      publishRealtimeEvent({
        type: "deployment.updated",
        payload: {
          deploymentId: deployment.id,
          status: deployment.status,
          nodeId: deployment.nodeId,
        },
      })
    }

    return NextResponse.json(deployment)
  } catch (error) {
    console.error("Error updating deployment:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
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

    const existingDeployment = await prisma.agentDeployment.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      select: {
        id: true,
        nodeId: true,
        deploymentType: true,
      },
    })

    if (!existingDeployment) {
      return NextResponse.json({ error: "Deployment not found" }, { status: 404 })
    }

    await prisma.agentDeployment.delete({
      where: {
        id,
        userId: session.user.id,
      },
    })

    if (existingDeployment.deploymentType === "ship") {
      publishShipUpdated({
        shipId: existingDeployment.id,
        status: "deleted",
        nodeId: existingDeployment.nodeId,
      })
    } else {
      publishRealtimeEvent({
        type: "deployment.updated",
        payload: {
          deploymentId: id,
          status: "deleted",
        },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting deployment:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
