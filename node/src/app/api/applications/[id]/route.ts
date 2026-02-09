import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import { normalizeInfrastructureInConfig } from "@/lib/deployment/profile"
import {
  buildApplicationTargetFromShip,
  resolveShipForApplication,
  withApplicationShipSummary,
} from "@/lib/shipyard/application-target"
import { publishShipApplicationUpdated } from "@/lib/shipyard/events"

export const dynamic = "force-dynamic"

function resolveShipError(error: unknown): NextResponse | null {
  if (!(error instanceof Error)) {
    return null
  }
  if (error.message === "Ship not found") {
    return NextResponse.json({ error: "Ship not found" }, { status: 404 })
  }
  if (error.message === "shipDeploymentId or nodeId is required") {
    return NextResponse.json(
      { error: "shipDeploymentId is required (or provide legacy nodeId for compatibility)" },
      { status: 400 },
    )
  }
  return null
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
    const application = await prisma.applicationDeployment.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      include: {
        shipDeployment: {
          select: {
            id: true,
            name: true,
            status: true,
            nodeId: true,
            nodeType: true,
            deploymentProfile: true,
          },
        },
      },
    })

    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 })
    }

    const normalizedInfrastructure = normalizeInfrastructureInConfig(
      application.deploymentProfile,
      application.config,
    )

    return NextResponse.json(
      withApplicationShipSummary({
        ...application,
        config: normalizedInfrastructure.config,
      }),
    )
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

    const existingApplication = await prisma.applicationDeployment.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      select: {
        id: true,
        name: true,
        shipDeploymentId: true,
        nodeId: true,
        nodeType: true,
        nodeUrl: true,
        deploymentProfile: true,
        provisioningMode: true,
        config: true,
      },
    })

    if (!existingApplication) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 })
    }

    const updateData: Record<string, any> = {
      ...body,
      updatedAt: new Date(),
    }

    const shouldResolveShip =
      "shipDeploymentId" in body ||
      "nodeId" in body ||
      "nodeType" in body ||
      "nodeUrl" in body ||
      "deploymentProfile" in body ||
      "provisioningMode" in body ||
      "advancedNodeTypeOverride" in body ||
      "config" in body

    if (shouldResolveShip) {
      const ship = await resolveShipForApplication({
        userId: session.user.id,
        appName: body.name ?? existingApplication.name,
        shipDeploymentId: body.shipDeploymentId ?? existingApplication.shipDeploymentId,
        nodeId: body.nodeId ?? existingApplication.nodeId,
        nodeType: body.nodeType ?? existingApplication.nodeType,
        nodeUrl: body.nodeUrl ?? existingApplication.nodeUrl,
        deploymentProfile: body.deploymentProfile ?? existingApplication.deploymentProfile,
        provisioningMode: body.provisioningMode ?? existingApplication.provisioningMode,
        advancedNodeTypeOverride: body.advancedNodeTypeOverride,
        config: body.config ?? existingApplication.config,
      })

      const target = buildApplicationTargetFromShip(ship, {
        config: body.config ?? existingApplication.config,
      })

      updateData.shipDeploymentId = target.shipDeploymentId
      updateData.nodeId = target.nodeId
      updateData.nodeType = target.nodeType
      updateData.nodeUrl = target.nodeUrl
      updateData.deploymentProfile = target.deploymentProfile
      updateData.provisioningMode = target.provisioningMode
      updateData.config = target.config
    }

    delete updateData.advancedNodeTypeOverride

    const application = await prisma.applicationDeployment.update({
      where: {
        id,
        userId: session.user.id,
      },
      data: updateData,
      include: {
        shipDeployment: {
          select: {
            id: true,
            name: true,
            status: true,
            nodeId: true,
            nodeType: true,
            deploymentProfile: true,
          },
        },
      },
    })

    publishShipApplicationUpdated({
      applicationId: application.id,
      status: application.status,
      nodeId: application.nodeId,
      shipDeploymentId: application.shipDeploymentId,
    })

    const normalizedInfrastructure = normalizeInfrastructureInConfig(
      application.deploymentProfile,
      application.config,
    )

    return NextResponse.json(
      withApplicationShipSummary({
        ...application,
        config: normalizedInfrastructure.config,
      }),
    )
  } catch (error) {
    const shipErrorResponse = resolveShipError(error)
    if (shipErrorResponse) {
      return shipErrorResponse
    }

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

    const existingApplication = await prisma.applicationDeployment.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      select: {
        id: true,
        nodeId: true,
        shipDeploymentId: true,
      },
    })

    if (!existingApplication) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 })
    }

    await prisma.applicationDeployment.delete({
      where: {
        id,
        userId: session.user.id,
      },
    })

    publishShipApplicationUpdated({
      applicationId: existingApplication.id,
      status: "deleted",
      nodeId: existingApplication.nodeId,
      shipDeploymentId: existingApplication.shipDeploymentId,
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
