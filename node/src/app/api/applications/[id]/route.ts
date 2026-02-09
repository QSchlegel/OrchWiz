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
    const application = await prisma.applicationDeployment.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    })

    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 })
    }

    return NextResponse.json(application)
  } catch (error) {
    console.error("Error fetching application:", error)
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

    const application = await prisma.applicationDeployment.update({
      where: {
        id,
        userId: session.user.id,
      },
      data: updateData,
    })

    publishRealtimeEvent({
      type: "application.updated",
      payload: {
        applicationId: application.id,
        status: application.status,
        nodeId: application.nodeId,
      },
    })

    return NextResponse.json(application)
  } catch (error) {
    console.error("Error updating application:", error)
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

    await prisma.applicationDeployment.delete({
      where: {
        id,
        userId: session.user.id,
      },
    })

    publishRealtimeEvent({
      type: "application.updated",
      payload: {
        applicationId: id,
        status: "deleted",
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting application:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
