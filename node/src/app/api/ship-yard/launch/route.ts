import { NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import {
  runDeploymentAdapter,
  type DeploymentAdapterResult,
} from "@/lib/deployment/adapter"
import { runShipyardLocalLaunch } from "@/lib/deployment/shipyard-local-launch"
import {
  normalizeDeploymentProfileInput,
  type InfrastructureConfig,
} from "@/lib/deployment/profile"
import { publishShipUpdated } from "@/lib/shipyard/events"
import {
  BRIDGE_CREW_ROLE_ORDER,
  bridgeCrewTemplateForRole,
  isBridgeCrewRole,
  type BridgeCrewRole,
} from "@/lib/shipyard/bridge-crew"
import { buildOpenClawBridgeCrewContextBundle } from "@/lib/deployment/openclaw-context"

export const dynamic = "force-dynamic"

function uniqueCrewRoles(input: unknown): BridgeCrewRole[] {
  if (!Array.isArray(input)) return []
  const set = new Set<BridgeCrewRole>()
  for (const entry of input) {
    if (isBridgeCrewRole(entry)) {
      set.add(entry)
    }
  }
  return BRIDGE_CREW_ROLE_ORDER.filter((role) => set.has(role))
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value !== "boolean") return null
  return value
}

type CrewOverrides = Partial<
  Record<
    BridgeCrewRole,
    {
      name?: string
      description?: string
      content?: string
    }
  >
>

function parseCrewOverrides(input: unknown): CrewOverrides {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {}
  }

  const source = input as Record<string, unknown>
  const result: CrewOverrides = {}

  for (const role of BRIDGE_CREW_ROLE_ORDER) {
    const raw = source[role]
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue
    const parsed = raw as Record<string, unknown>

    result[role] = {
      name: asString(parsed.name) || undefined,
      description: asString(parsed.description) || undefined,
      content: asString(parsed.content) || undefined,
    }
  }

  return result
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const name = asString(body?.name)
    const nodeId = asString(body?.nodeId)
    if (!name || !nodeId) {
      return NextResponse.json(
        { error: "Missing required fields: name and nodeId" },
        { status: 400 },
      )
    }

    const crewRoles = uniqueCrewRoles(body?.crewRoles)
    if (crewRoles.length === 0) {
      return NextResponse.json(
        { error: "At least one bridge crew role is required" },
        { status: 400 },
      )
    }

    const crewOverrides = parseCrewOverrides(body?.crewOverrides)

    const normalizedProfile = normalizeDeploymentProfileInput({
      deploymentProfile: body?.deploymentProfile,
      provisioningMode: body?.provisioningMode,
      nodeType: body?.nodeType,
      advancedNodeTypeOverride: body?.advancedNodeTypeOverride,
      config: body?.config,
    })
    const saneBootstrap =
      normalizedProfile.deploymentProfile === "local_starship_build"
        ? (asBoolean(body?.saneBootstrap) ?? true)
        : false

    const created = await prisma.$transaction(async (tx) => {
      const deployment = await tx.agentDeployment.create({
        data: {
          name,
          description: asString(body?.description),
          subagentId: null,
          nodeId,
          nodeType: normalizedProfile.nodeType,
          deploymentType: "ship",
          deploymentProfile: normalizedProfile.deploymentProfile,
          provisioningMode: normalizedProfile.provisioningMode,
          nodeUrl: asString(body?.nodeUrl),
          config: normalizedProfile.config as Prisma.InputJsonValue,
          metadata: {
            shipYard: true,
            bridgeCrewRoles: crewRoles,
            ...(normalizedProfile.deploymentProfile === "local_starship_build"
              ? { saneBootstrap }
              : {}),
          },
          userId: session.user.id,
          status: "pending",
        },
      })

      const bridgeCrew = await Promise.all(
        crewRoles.map((role) => {
          const template = bridgeCrewTemplateForRole(role)
          const override = crewOverrides[role]
          return tx.bridgeCrew.create({
            data: {
              deploymentId: deployment.id,
              role,
              callsign: template.callsign,
              name: override?.name || template.name,
              description: override?.description || template.description,
              content: override?.content || template.content,
              status: "active",
            },
          })
        }),
      )

      return { deployment, bridgeCrew }
    })

    await prisma.agentDeployment.update({
      where: { id: created.deployment.id },
      data: { status: "deploying" },
    })

    const bridgeCrew = created.bridgeCrew.sort(
      (a, b) => BRIDGE_CREW_ROLE_ORDER.indexOf(a.role) - BRIDGE_CREW_ROLE_ORDER.indexOf(b.role),
    )
    const openClawContextBundle = buildOpenClawBridgeCrewContextBundle({
      deploymentId: created.deployment.id,
      bridgeCrew: bridgeCrew.map((member) => ({
        role: member.role,
        callsign: member.callsign,
        name: member.name,
        content: member.content,
      })),
    })

    let adapterResult: DeploymentAdapterResult
    if (created.deployment.deploymentProfile === "local_starship_build") {
      const launchResult = await runShipyardLocalLaunch({
        provisioningMode: created.deployment.provisioningMode,
        infrastructure: normalizedProfile.infrastructure as InfrastructureConfig,
        saneBootstrap,
        openClawContextBundle,
      })

      if (!launchResult.ok) {
        const failureMetadata = {
          ...(created.deployment.metadata as Record<string, unknown> | null),
          ...(launchResult.metadata || {}),
          deploymentError: launchResult.error,
          deploymentErrorCode: launchResult.code,
          ...(launchResult.details
            ? { deploymentErrorDetails: launchResult.details as Prisma.InputJsonValue }
            : {}),
        }

        const deployment = await prisma.agentDeployment.update({
          where: { id: created.deployment.id },
          data: {
            status: "failed",
            lastHealthCheck: new Date(),
            healthStatus: "unhealthy",
            metadata: failureMetadata as Prisma.InputJsonValue,
          },
        })

        publishShipUpdated({
          shipId: deployment.id,
          status: deployment.status,
          nodeId: deployment.nodeId,
        })

        return NextResponse.json(
          {
            error: launchResult.error,
            code: launchResult.code,
            details: launchResult.details,
            deployment,
            bridgeCrew,
          },
          { status: launchResult.httpStatus },
        )
      }

      adapterResult = launchResult.adapterResult
    } else {
      adapterResult = await runDeploymentAdapter({
        kind: "agent",
        recordId: created.deployment.id,
        name: created.deployment.name,
        nodeId: created.deployment.nodeId,
        nodeType: created.deployment.nodeType,
        nodeUrl: created.deployment.nodeUrl,
        deploymentProfile: created.deployment.deploymentProfile,
        provisioningMode: created.deployment.provisioningMode,
        config: (created.deployment.config || {}) as Record<string, unknown>,
        infrastructure: (((created.deployment.config || {}) as Record<string, unknown>).infrastructure ||
          undefined) as Record<string, unknown> | undefined,
        metadata: (created.deployment.metadata || {}) as Record<string, unknown>,
      })
    }

    const successMetadata = {
      ...(created.deployment.metadata as Record<string, unknown> | null),
      ...(adapterResult.metadata || {}),
      ...(adapterResult.error ? { deploymentError: adapterResult.error } : {}),
    }

    const deployment = await prisma.agentDeployment.update({
      where: { id: created.deployment.id },
      data: {
        status: adapterResult.status,
        deployedAt: adapterResult.deployedAt || null,
        lastHealthCheck: adapterResult.lastHealthCheck || null,
        healthStatus: adapterResult.healthStatus || null,
        metadata: successMetadata as Prisma.InputJsonValue,
      },
    })

    publishShipUpdated({
      shipId: deployment.id,
      status: deployment.status,
      nodeId: deployment.nodeId,
    })

    return NextResponse.json({
      deployment,
      bridgeCrew,
    })
  } catch (error) {
    console.error("Error launching ship yard deployment:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
