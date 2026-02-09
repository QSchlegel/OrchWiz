import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import {
  USS_K8S_COMPONENTS,
  USS_K8S_EDGES,
  SUBSYSTEM_GROUP_CONFIG,
  GROUP_ORDER,
} from "@/lib/uss-k8s/topology"

export const dynamic = "force-dynamic"

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const requestedShipDeploymentId = asString(request.nextUrl.searchParams.get("shipDeploymentId"))

    const availableShips = await prisma.agentDeployment.findMany({
      where: {
        userId: session.user.id,
        deploymentType: "ship",
      },
      select: {
        id: true,
        name: true,
        status: true,
        updatedAt: true,
        nodeId: true,
        nodeType: true,
        deploymentProfile: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
    })

    const requestedShip = requestedShipDeploymentId
      ? availableShips.find((ship) => ship.id === requestedShipDeploymentId)
      : null
    const selectedShip = requestedShip || availableShips.find((ship) => ship.status === "active") || availableShips[0] || null

    const bridgeCrew = selectedShip
      ? await prisma.bridgeCrew.findMany({
          where: {
            deploymentId: selectedShip.id,
            status: "active",
          },
          orderBy: {
            role: "asc",
          },
        })
      : []

    const agentLookup = new Map<string, (typeof bridgeCrew)[number]>()
    for (const agent of bridgeCrew) {
      agentLookup.set(agent.role, agent)
    }

    const components = USS_K8S_COMPONENTS.map((c) => {
      const agent = agentLookup.get(c.id)
      if (agent) {
        return {
          ...c,
          subagentId: agent.id,
          subagentName: agent.callsign || agent.name,
          subagentDescription: agent.description,
        }
      }
      return c
    })

    return NextResponse.json({
      components,
      edges: USS_K8S_EDGES,
      groups: SUBSYSTEM_GROUP_CONFIG,
      groupOrder: GROUP_ORDER,
      selectedShipDeploymentId: selectedShip?.id || null,
      availableShips: availableShips.map((ship) => ({
        id: ship.id,
        name: ship.name,
        status: ship.status,
        updatedAt: ship.updatedAt,
        nodeId: ship.nodeId,
        nodeType: ship.nodeType,
        deploymentProfile: ship.deploymentProfile,
      })),
    })
  } catch (error) {
    console.error("Error fetching uss-k8s topology:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
