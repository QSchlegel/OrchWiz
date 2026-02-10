import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { normalizeInfrastructureInConfig } from "@/lib/deployment/profile"
import { BRIDGE_CREW_ROLE_ORDER } from "@/lib/shipyard/bridge-crew"
import {
  estimateShipBaseRequirements,
  readBaseRequirementsEstimate,
} from "@/lib/shipyard/resource-estimation"
import {
  buildShipDeploymentOverview,
  readShipDeploymentOverview,
} from "@/lib/shipyard/deployment-overview"
import { resolveShipyardApiActorFromRequest } from "@/lib/shipyard/api-auth"

export const dynamic = "force-dynamic"

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actorResolution = await resolveShipyardApiActorFromRequest(request, {
      shipyardApiToken: process.env.SHIPYARD_API_TOKEN,
      getSessionUserId: async () => {
        const session = await auth.api.getSession({ headers: await headers() })
        return asString(session?.user?.id)
      },
      userExists: async (userId) => {
        const user = await prisma.user.findUnique({
          where: {
            id: userId,
          },
          select: {
            id: true,
          },
        })
        return Boolean(user)
      },
    })
    if (!actorResolution.ok) {
      return NextResponse.json({ error: actorResolution.error }, { status: actorResolution.status })
    }

    const { id } = await params
    const deployment = await prisma.agentDeployment.findFirst({
      where: {
        id,
        userId: actorResolution.actor.userId,
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
    })
    if (!deployment) {
      return NextResponse.json({ error: "Ship not found" }, { status: 404 })
    }

    const normalizedInfrastructure = normalizeInfrastructureInConfig(
      deployment.deploymentProfile,
      deployment.config,
    )
    const bridgeCrew = await prisma.bridgeCrew.findMany({
      where: {
        deploymentId: deployment.id,
      },
    })
    const sortedBridgeCrew = bridgeCrew.sort(
      (a, b) => BRIDGE_CREW_ROLE_ORDER.indexOf(a.role) - BRIDGE_CREW_ROLE_ORDER.indexOf(b.role),
    )
    const baseRequirementsEstimate =
      readBaseRequirementsEstimate(deployment.metadata) ||
      estimateShipBaseRequirements({
        deploymentProfile: deployment.deploymentProfile,
        crewRoles: sortedBridgeCrew.map((member) => member.role),
      })
    const persistedDeploymentOverview = readShipDeploymentOverview(deployment.metadata)
    const deploymentOverview =
      persistedDeploymentOverview ||
      buildShipDeploymentOverview({
        deploymentProfile: deployment.deploymentProfile,
        provisioningMode: deployment.provisioningMode,
        nodeType: deployment.nodeType,
        infrastructure: normalizedInfrastructure.infrastructure,
        crewRoles: sortedBridgeCrew.map((member) => member.role),
        baseRequirementsEstimate,
      })

    return NextResponse.json({
      deployment: {
        ...deployment,
        config: normalizedInfrastructure.config,
      },
      bridgeCrew: sortedBridgeCrew,
      baseRequirementsEstimate,
      deploymentOverview,
      deploymentOverviewDerived: !persistedDeploymentOverview,
    })
  } catch (error) {
    console.error("Error fetching ship yard status:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
