import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import {
  USS_K8S_COMPONENTS,
  USS_K8S_COMMAND_HIERARCHY,
  USS_K8S_EDGES,
  SUBSYSTEM_GROUP_CONFIG,
  GROUP_ORDER,
} from "@/lib/uss-k8s/topology"

export const dynamic = "force-dynamic"

type KubeviewSource = "terraform_output" | "fallback" | "unavailable"

interface KubeviewPayload {
  enabled: boolean
  ingressEnabled: boolean
  url: string | null
  source: KubeviewSource
  reason: string | null
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value !== "boolean") {
    return null
  }
  return value
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function resolveShipNamespace(config: unknown, deploymentProfile: string): string {
  const infrastructure = asRecord(asRecord(config).infrastructure)
  const explicitNamespace = asString(infrastructure.namespace)
  if (explicitNamespace) {
    return explicitNamespace
  }

  if (deploymentProfile === "cloud_shipyard") {
    return "orchwiz-shipyard"
  }
  return "orchwiz-starship"
}

function resolveKubeviewPayload(
  selectedShip:
    | {
        deploymentProfile: string
        config: unknown
        metadata: unknown
      }
    | null,
): KubeviewPayload {
  if (!selectedShip) {
    return {
      enabled: false,
      ingressEnabled: false,
      url: null,
      source: "unavailable",
      reason: "Select a ship to access KubeView.",
    }
  }

  const metadata = asRecord(selectedShip.metadata)
  const kubeview = asRecord(metadata.kubeview)

  const metadataEnabled = asBoolean(kubeview.enabled)
  const metadataIngressEnabled = asBoolean(kubeview.ingressEnabled)
  const metadataUrl = asString(kubeview.url)
  const metadataSource = asString(kubeview.source)

  const enabled = metadataEnabled ?? true
  const ingressEnabled = metadataIngressEnabled ?? (selectedShip.deploymentProfile === "cloud_shipyard")
  const normalizedSource: KubeviewSource =
    metadataSource === "terraform_output" || metadataSource === "fallback"
      ? metadataSource
      : "fallback"

  if (metadataUrl) {
    return {
      enabled,
      ingressEnabled,
      url: metadataUrl,
      source: normalizedSource,
      reason: null,
    }
  }

  if (!enabled) {
    return {
      enabled: false,
      ingressEnabled,
      url: null,
      source: normalizedSource,
      reason: "KubeView is disabled for this ship.",
    }
  }

  if (!ingressEnabled) {
    return {
      enabled,
      ingressEnabled: false,
      url: null,
      source: normalizedSource,
      reason: "KubeView ingress is disabled for this ship.",
    }
  }

  if (selectedShip.deploymentProfile === "cloud_shipyard") {
    return {
      enabled,
      ingressEnabled: true,
      url: "/kubeview",
      source: "fallback",
      reason: null,
    }
  }

  const namespace = resolveShipNamespace(selectedShip.config, selectedShip.deploymentProfile)
  return {
    enabled,
    ingressEnabled: true,
    url: `http://kubeview.${namespace}.localhost/kubeview`,
    source: "fallback",
    reason: null,
  }
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
        config: true,
        metadata: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
    })

    const requestedShip = requestedShipDeploymentId
      ? availableShips.find((ship) => ship.id === requestedShipDeploymentId)
      : null
    const selectedShip = requestedShip || availableShips.find((ship) => ship.status === "active") || availableShips[0] || null
    const kubeview = resolveKubeviewPayload(selectedShip)

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
      commandHierarchy: USS_K8S_COMMAND_HIERARCHY,
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
      kubeview,
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Error fetching uss-k8s topology:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
