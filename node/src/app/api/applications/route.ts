import { NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import { runDeploymentAdapter } from "@/lib/deployment/adapter"
import { publishRealtimeEvent } from "@/lib/realtime/events"
import {
  normalizeDeploymentProfileInput,
  parseDeploymentProfile,
  parseProvisioningMode,
} from "@/lib/deployment/profile"

export const dynamic = 'force-dynamic'

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
      orderBy: {
        createdAt: "desc",
      },
    })

    if (!includeForwarded) {
      return NextResponse.json(applications)
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
        nodeId: String(payload.nodeId || event.sourceNode.nodeId),
        nodeType: String(payload.nodeType || event.sourceNode.nodeType || "local"),
        deploymentProfile: parseDeploymentProfile(payload.deploymentProfile),
        provisioningMode: parseProvisioningMode(payload.provisioningMode),
        nodeUrl: (payload.nodeUrl as string) || null,
        status: String(payload.status || "active"),
        config: (payload.config as Record<string, unknown>) || {},
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

    const combined = [...applications, ...forwardedApplications].sort((a: any, b: any) => {
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
      nodeId, 
      nodeType, 
      nodeUrl, 
      config, 
      metadata,
      version,
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
        nodeId,
        nodeType: normalizedProfile.nodeType,
        deploymentProfile: normalizedProfile.deploymentProfile,
        provisioningMode: normalizedProfile.provisioningMode,
        nodeUrl: nodeUrl || null,
        config: normalizedProfile.config as Prisma.InputJsonValue,
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
    })

    publishRealtimeEvent({
      type: "application.updated",
      payload: {
        applicationId: updatedApplication.id,
        status: updatedApplication.status,
        nodeId: updatedApplication.nodeId,
      },
    })

    return NextResponse.json(updatedApplication)
  } catch (error) {
    console.error("Error creating application:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
