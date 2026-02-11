import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { AccessControlError } from "@/lib/security/access-control"
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
import { requireShipyardRequestActor } from "@/lib/shipyard/request-actor"

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireShipyardRequestActor(request, {
      allowLegacyTokenAuth: true,
    })

    const { id } = await params
    const deployment = await prisma.agentDeployment.findFirst({
      where: {
        id,
        userId: actor.userId,
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
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error("Error fetching ship yard status:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
