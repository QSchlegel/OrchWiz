import type { BridgeCrewRole } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export interface GovernanceActorContext {
  ownerUserId: string
  actingBridgeCrewId: string | null
  actingBridgeCrewRole: BridgeCrewRole | null
  actingBridgeCrewCallsign: string | null
  shipDeploymentId: string | null
}

export class GovernanceAccessError extends Error {
  status: number
  code: string

  constructor(message: string, status = 403, code = "FORBIDDEN") {
    super(message)
    this.name = "GovernanceAccessError"
    this.status = status
    this.code = code
  }
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function resolveGovernanceActorContext(args: {
  ownerUserId: string
  actingBridgeCrewId?: string | null
  shipDeploymentId?: string | null
}): Promise<GovernanceActorContext> {
  const actingBridgeCrewId = asNonEmptyString(args.actingBridgeCrewId)
  const shipDeploymentId = asNonEmptyString(args.shipDeploymentId)

  if (!actingBridgeCrewId) {
    return {
      ownerUserId: args.ownerUserId,
      actingBridgeCrewId: null,
      actingBridgeCrewRole: null,
      actingBridgeCrewCallsign: null,
      shipDeploymentId,
    }
  }

  const bridgeCrew = await prisma.bridgeCrew.findFirst({
    where: {
      id: actingBridgeCrewId,
      status: "active",
      deployment: {
        userId: args.ownerUserId,
        deploymentType: "ship",
        ...(shipDeploymentId
          ? {
              id: shipDeploymentId,
            }
          : {}),
      },
    },
    select: {
      id: true,
      role: true,
      callsign: true,
      deploymentId: true,
    },
  })

  if (!bridgeCrew) {
    throw new GovernanceAccessError(
      "actingBridgeCrewId is not an active bridge crew member for this owner/ship",
      403,
      "ACTING_BRIDGE_CREW_FORBIDDEN",
    )
  }

  return {
    ownerUserId: args.ownerUserId,
    actingBridgeCrewId: bridgeCrew.id,
    actingBridgeCrewRole: bridgeCrew.role,
    actingBridgeCrewCallsign: bridgeCrew.callsign,
    shipDeploymentId: shipDeploymentId || bridgeCrew.deploymentId,
  }
}

export async function assertOwnedShipDeployment(args: {
  ownerUserId: string
  shipDeploymentId: string
}): Promise<{ id: string; name: string; userId: string }> {
  const ship = await prisma.agentDeployment.findFirst({
    where: {
      id: args.shipDeploymentId,
      userId: args.ownerUserId,
      deploymentType: "ship",
    },
    select: {
      id: true,
      name: true,
      userId: true,
    },
  })

  if (!ship) {
    throw new GovernanceAccessError("Ship not found", 404, "SHIP_NOT_FOUND")
  }

  return ship
}

export function isOwnerActingDirectly(context: GovernanceActorContext): boolean {
  return !context.actingBridgeCrewRole
}

export function isActingAsXo(context: GovernanceActorContext): boolean {
  return context.actingBridgeCrewRole === "xo"
}

export function assertOwnerOrXo(args: {
  context: GovernanceActorContext
  action: string
}): void {
  if (isOwnerActingDirectly(args.context) || isActingAsXo(args.context)) {
    return
  }

  throw new GovernanceAccessError(
    `${args.action} requires owner authority or acting XO authority`,
    403,
    "CHAIN_OF_COMMAND_FORBIDDEN",
  )
}

export async function assertCanManageSubagentGrant(args: {
  context: GovernanceActorContext
  subagentId: string
  shipDeploymentId: string
}): Promise<void> {
  if (isOwnerActingDirectly(args.context) || isActingAsXo(args.context)) {
    return
  }

  const actingBridgeCrewId = asNonEmptyString(args.context.actingBridgeCrewId)
  if (!actingBridgeCrewId) {
    throw new GovernanceAccessError("actingBridgeCrewId is required", 400, "ACTING_BRIDGE_CREW_REQUIRED")
  }

  const assignment = await prisma.bridgeCrewSubagentAssignment.findFirst({
    where: {
      ownerUserId: args.context.ownerUserId,
      shipDeploymentId: args.shipDeploymentId,
      bridgeCrewId: actingBridgeCrewId,
      subagentId: args.subagentId,
    },
    select: {
      id: true,
    },
  })

  if (!assignment) {
    throw new GovernanceAccessError(
      "Acting bridge crew member is not assigned to this subagent",
      403,
      "SUBAGENT_ASSIGNMENT_REQUIRED",
    )
  }
}

export function actingIdentityMetadata(context: GovernanceActorContext): {
  actingBridgeCrewId: string | null
  actingBridgeCrewRole: BridgeCrewRole | null
  actingBridgeCrewCallsign: string | null
  shipDeploymentId: string | null
} {
  return {
    actingBridgeCrewId: context.actingBridgeCrewId,
    actingBridgeCrewRole: context.actingBridgeCrewRole,
    actingBridgeCrewCallsign: context.actingBridgeCrewCallsign,
    shipDeploymentId: context.shipDeploymentId,
  }
}
