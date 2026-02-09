import { NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import { runDeploymentAdapter } from "@/lib/deployment/adapter"
import {
  normalizeInfrastructureInConfig,
  parseDeploymentProfile,
  parseProvisioningMode,
} from "@/lib/deployment/profile"
import {
  buildApplicationTargetFromShip,
  resolveShipForApplication,
  withApplicationShipSummary,
} from "@/lib/shipyard/application-target"
import { publishShipApplicationUpdated } from "@/lib/shipyard/events"

export const dynamic = "force-dynamic"

function parseNodeType(value: unknown): "local" | "cloud" | "hybrid" {
  if (value === "local" || value === "cloud" || value === "hybrid") {
    return value
  }
  return "local"
}

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

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const includeForwarded = request.nextUrl.searchParams.get("includeForwarded") === "true"
    const sourceNodeId = request.nextUrl.searchParams.get("sourceNodeId")

    const applications = await prisma.applicationDeployment.findMany({
      where: {
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
      orderBy: {
        createdAt: "desc",
      },
    })

    const normalizedApplications = applications.map((application) => {
      const normalizedInfrastructure = normalizeInfrastructureInConfig(
        application.deploymentProfile,
        application.config,
      )
      return withApplicationShipSummary({
        ...application,
        config: normalizedInfrastructure.config,
      })
    })

    if (!includeForwarded) {
      return NextResponse.json(normalizedApplications)
    }

    const forwardedEvents = await prisma.forwardingEvent.findMany({
      where: {
        eventType: "application",
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

    const forwardedApplications = forwardedEvents.map((event) => {
      const payload = (event.payload || {}) as Record<string, unknown>
      const deploymentProfile = parseDeploymentProfile(payload.deploymentProfile)
      const normalizedInfrastructure = normalizeInfrastructureInConfig(
        deploymentProfile,
        payload.config,
      )

      const shipDeploymentId =
        typeof payload.shipDeploymentId === "string" ? payload.shipDeploymentId : null
      const shipName = typeof payload.shipName === "string" ? payload.shipName : null

      const ship = shipDeploymentId || shipName
        ? {
            id: shipDeploymentId || `forwarded-ship-${event.id}`,
            name:
              shipName ||
              `Forwarded ship ${String(payload.nodeId || event.sourceNode.nodeId || "unknown")}`,
            status: String(payload.shipStatus || payload.status || "active"),
            nodeId: String(payload.nodeId || event.sourceNode.nodeId),
            nodeType: parseNodeType(payload.nodeType || event.sourceNode.nodeType || "local"),
            deploymentProfile,
          }
        : null

      return {
        id: `forwarded-${event.id}`,
        name: String(payload.name || "Forwarded application"),
        description: (payload.description as string) || null,
        applicationType: String(payload.applicationType || "custom"),
        image: (payload.image as string) || null,
        repository: (payload.repository as string) || null,
        branch: (payload.branch as string) || null,
        buildCommand: (payload.buildCommand as string) || null,
        startCommand: (payload.startCommand as string) || null,
        port: typeof payload.port === "number" ? payload.port : null,
        environment: (payload.environment as Record<string, unknown>) || {},
        shipDeploymentId,
        ship,
        nodeId: String(payload.nodeId || event.sourceNode.nodeId),
        nodeType: parseNodeType(payload.nodeType || event.sourceNode.nodeType || "local"),
        deploymentProfile,
        provisioningMode: parseProvisioningMode(payload.provisioningMode),
        nodeUrl: (payload.nodeUrl as string) || null,
        status: String(payload.status || "active"),
        config: normalizedInfrastructure.config,
        metadata: {
          ...((payload.metadata as Record<string, unknown>) || {}),
          isForwarded: true,
          sourceNodeId: event.sourceNode.nodeId,
          sourceNodeName: event.sourceNode.name,
          forwardingEventId: event.id,
        },
        deployedAt: (payload.deployedAt as string) || null,
        lastHealthCheck: (payload.lastHealthCheck as string) || null,
        healthStatus: (payload.healthStatus as string) || null,
        version: (payload.version as string) || null,
        createdAt: (payload.createdAt as string) || event.occurredAt.toISOString(),
      }
    })

    const combined = [...normalizedApplications, ...forwardedApplications].sort((a: any, b: any) => {
      const aDate = new Date(a.createdAt || 0).getTime()
      const bDate = new Date(b.createdAt || 0).getTime()
      return bDate - aDate
    })

    return NextResponse.json(combined)
  } catch (error) {
    console.error("Error fetching applications:", error)
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
      applicationType,
      image,
      repository,
      branch,
      buildCommand,
      startCommand,
      port,
      environment,
      config,
      metadata,
      version,
      shipDeploymentId,
      nodeId,
      nodeType,
      nodeUrl,
      deploymentProfile,
      provisioningMode,
      advancedNodeTypeOverride,
    } = body

    const ship = await resolveShipForApplication({
      userId: session.user.id,
      appName: name,
      shipDeploymentId,
      nodeId,
      nodeType,
      nodeUrl,
      deploymentProfile,
      provisioningMode,
      advancedNodeTypeOverride,
      config,
    })

    const target = buildApplicationTargetFromShip(ship, {
      config,
    })

    const application = await prisma.applicationDeployment.create({
      data: {
        name,
        description,
        applicationType,
        image: image || null,
        repository: repository || null,
        branch: branch || null,
        buildCommand: buildCommand || null,
        startCommand: startCommand || null,
        port: port || null,
        environment: environment || {},
        shipDeploymentId: target.shipDeploymentId,
        nodeId: target.nodeId,
        nodeType: target.nodeType,
        deploymentProfile: target.deploymentProfile,
        provisioningMode: target.provisioningMode,
        nodeUrl: target.nodeUrl,
        config: target.config as Prisma.InputJsonValue,
        metadata: metadata || {},
        version: version || null,
        userId: session.user.id,
        status: "pending",
      },
    })

    await prisma.applicationDeployment.update({
      where: { id: application.id },
      data: {
        status: "deploying",
      },
    })

    const adapterResult = await runDeploymentAdapter({
      kind: "application",
      recordId: application.id,
      name: application.name,
      nodeId: application.nodeId,
      nodeType: application.nodeType,
      nodeUrl: application.nodeUrl,
      deploymentProfile: application.deploymentProfile,
      provisioningMode: application.provisioningMode,
      config: (application.config || {}) as Record<string, unknown>,
      infrastructure: (((application.config || {}) as Record<string, unknown>).infrastructure ||
        undefined) as Record<string, unknown> | undefined,
      metadata: (application.metadata || {}) as Record<string, unknown>,
    })

    const updatedApplication = await prisma.applicationDeployment.update({
      where: { id: application.id },
      data: {
        status: adapterResult.status,
        deployedAt: adapterResult.deployedAt || null,
        lastHealthCheck: adapterResult.lastHealthCheck || null,
        healthStatus: adapterResult.healthStatus || null,
        metadata: {
          ...(application.metadata as Record<string, unknown> | null),
          ...(adapterResult.metadata || {}),
          ...(adapterResult.error ? { deploymentError: adapterResult.error } : {}),
        },
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

    publishShipApplicationUpdated({
      applicationId: updatedApplication.id,
      status: updatedApplication.status,
      nodeId: updatedApplication.nodeId,
      shipDeploymentId: updatedApplication.shipDeploymentId,
    })

    const normalizedInfrastructure = normalizeInfrastructureInConfig(
      updatedApplication.deploymentProfile,
      updatedApplication.config,
    )

    return NextResponse.json(
      withApplicationShipSummary({
        ...updatedApplication,
        config: normalizedInfrastructure.config,
      }),
    )
  } catch (error) {
    const shipErrorResponse = resolveShipError(error)
    if (shipErrorResponse) {
      return shipErrorResponse
    }

    console.error("Error creating application:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
