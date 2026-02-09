import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import { publishRealtimeEvent } from "@/lib/realtime/events"
import { normalizeDeploymentProfileInput } from "@/lib/deployment/profile"

export const dynamic = 'force-dynamic'

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

    return NextResponse.json(deployment)
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
    const updateData = {
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
      const normalizedProfile = normalizeDeploymentProfileInput({
        deploymentProfile: body.deploymentProfile,
        provisioningMode: body.provisioningMode,
        nodeType: body.nodeType,
        advancedNodeTypeOverride: body.advancedNodeTypeOverride,
        config: body.config,
      })

      updateData.deploymentProfile = normalizedProfile.deploymentProfile
      updateData.provisioningMode = normalizedProfile.provisioningMode
      updateData.nodeType = normalizedProfile.nodeType
      updateData.config = normalizedProfile.config
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

    publishRealtimeEvent({
      type: "deployment.updated",
      payload: {
        deploymentId: deployment.id,
        status: deployment.status,
        nodeId: deployment.nodeId,
      },
    })

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

    await prisma.agentDeployment.delete({
      where: {
        id,
        userId: session.user.id,
      },
    })

    publishRealtimeEvent({
      type: "deployment.updated",
      payload: {
        deploymentId: id,
        status: "deleted",
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting deployment:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
