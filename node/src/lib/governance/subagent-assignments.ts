import { prisma } from "@/lib/prisma"
import {
  assertOwnedShipDeployment,
  assertOwnerOrXo,
  resolveGovernanceActorContext,
  type GovernanceActorContext,
} from "@/lib/governance/chain-of-command"

export interface BridgeCrewSubagentAssignmentDto {
  id: string
  ownerUserId: string
  shipDeploymentId: string
  bridgeCrewId: string
  subagentId: string
  assignedByUserId: string
  assignedByBridgeCrewId: string | null
  createdAt: string
  updatedAt: string
  bridgeCrew: {
    id: string
    role: string
    callsign: string
    name: string
  }
  subagent: {
    id: string
    name: string
    subagentType: string
  }
}

export class BridgeCrewSubagentAssignmentError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = "BridgeCrewSubagentAssignmentError"
    this.status = status
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeAssignmentsInput(value: unknown): Array<{ bridgeCrewId: string; subagentId: string }> {
  if (!Array.isArray(value)) {
    throw new BridgeCrewSubagentAssignmentError("assignments must be an array")
  }

  const deduped = new Map<string, { bridgeCrewId: string; subagentId: string }>()
  for (const entry of value) {
    const record = asRecord(entry)
    if (!record) {
      throw new BridgeCrewSubagentAssignmentError("assignment entries must be objects")
    }

    const bridgeCrewId = asNonEmptyString(record.bridgeCrewId)
    const subagentId = asNonEmptyString(record.subagentId)
    if (!bridgeCrewId || !subagentId) {
      throw new BridgeCrewSubagentAssignmentError("assignment entries require bridgeCrewId and subagentId")
    }

    deduped.set(`${bridgeCrewId}:${subagentId}`, {
      bridgeCrewId,
      subagentId,
    })
  }

  return [...deduped.values()]
}

function toDto(value: {
  id: string
  ownerUserId: string
  shipDeploymentId: string
  bridgeCrewId: string
  subagentId: string
  assignedByUserId: string
  assignedByBridgeCrewId: string | null
  createdAt: Date
  updatedAt: Date
  bridgeCrew: {
    id: string
    role: string
    callsign: string
    name: string
  }
  subagent: {
    id: string
    name: string
    subagentType: string
  }
}): BridgeCrewSubagentAssignmentDto {
  return {
    id: value.id,
    ownerUserId: value.ownerUserId,
    shipDeploymentId: value.shipDeploymentId,
    bridgeCrewId: value.bridgeCrewId,
    subagentId: value.subagentId,
    assignedByUserId: value.assignedByUserId,
    assignedByBridgeCrewId: value.assignedByBridgeCrewId,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
    bridgeCrew: value.bridgeCrew,
    subagent: value.subagent,
  }
}

async function listAssignmentsRaw(args: {
  ownerUserId: string
  shipDeploymentId: string
}) {
  return prisma.bridgeCrewSubagentAssignment.findMany({
    where: {
      ownerUserId: args.ownerUserId,
      shipDeploymentId: args.shipDeploymentId,
    },
    include: {
      bridgeCrew: {
        select: {
          id: true,
          role: true,
          callsign: true,
          name: true,
        },
      },
      subagent: {
        select: {
          id: true,
          name: true,
          subagentType: true,
        },
      },
    },
    orderBy: [
      {
        bridgeCrew: {
          role: "asc",
        },
      },
      {
        subagent: {
          name: "asc",
        },
      },
    ],
  })
}

export async function listBridgeCrewSubagentAssignmentsForShip(args: {
  ownerUserId: string
  shipDeploymentId: string
}): Promise<BridgeCrewSubagentAssignmentDto[]> {
  await assertOwnedShipDeployment({
    ownerUserId: args.ownerUserId,
    shipDeploymentId: args.shipDeploymentId,
  })

  const assignments = await listAssignmentsRaw(args)
  return assignments.map((entry) => toDto(entry))
}

async function resolveContext(args: {
  ownerUserId: string
  shipDeploymentId: string
  actingBridgeCrewId?: string | null
}): Promise<GovernanceActorContext> {
  await assertOwnedShipDeployment({
    ownerUserId: args.ownerUserId,
    shipDeploymentId: args.shipDeploymentId,
  })

  return resolveGovernanceActorContext({
    ownerUserId: args.ownerUserId,
    shipDeploymentId: args.shipDeploymentId,
    actingBridgeCrewId: args.actingBridgeCrewId,
  })
}

export async function replaceBridgeCrewSubagentAssignmentsForShip(args: {
  ownerUserId: string
  shipDeploymentId: string
  actingBridgeCrewId?: string | null
  assignedByUserId: string
  assignments: unknown
}): Promise<BridgeCrewSubagentAssignmentDto[]> {
  const context = await resolveContext({
    ownerUserId: args.ownerUserId,
    shipDeploymentId: args.shipDeploymentId,
    actingBridgeCrewId: args.actingBridgeCrewId,
  })

  assertOwnerOrXo({
    context,
    action: "Managing bridge crew subagent assignments",
  })

  const normalized = normalizeAssignmentsInput(args.assignments)
  const bridgeCrewIds = [...new Set(normalized.map((entry) => entry.bridgeCrewId))]
  const subagentIds = [...new Set(normalized.map((entry) => entry.subagentId))]

  if (bridgeCrewIds.length > 0) {
    const members = await prisma.bridgeCrew.findMany({
      where: {
        id: {
          in: bridgeCrewIds,
        },
        deploymentId: args.shipDeploymentId,
      },
      select: {
        id: true,
      },
    })

    const memberIdSet = new Set(members.map((entry) => entry.id))
    for (const bridgeCrewId of bridgeCrewIds) {
      if (!memberIdSet.has(bridgeCrewId)) {
        throw new BridgeCrewSubagentAssignmentError(
          `bridgeCrewId is not part of the selected ship: ${bridgeCrewId}`,
          400,
        )
      }
    }
  }

  if (subagentIds.length > 0) {
    const subagents = await prisma.subagent.findMany({
      where: {
        id: {
          in: subagentIds,
        },
        ownerUserId: args.ownerUserId,
      },
      select: {
        id: true,
      },
    })

    const subagentIdSet = new Set(subagents.map((entry) => entry.id))
    for (const subagentId of subagentIds) {
      if (!subagentIdSet.has(subagentId)) {
        throw new BridgeCrewSubagentAssignmentError(
          `subagentId is not owned by this user: ${subagentId}`,
          400,
        )
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.bridgeCrewSubagentAssignment.deleteMany({
      where: {
        ownerUserId: args.ownerUserId,
        shipDeploymentId: args.shipDeploymentId,
      },
    })

    if (normalized.length === 0) {
      return
    }

    await tx.bridgeCrewSubagentAssignment.createMany({
      data: normalized.map((entry) => ({
        ownerUserId: args.ownerUserId,
        shipDeploymentId: args.shipDeploymentId,
        bridgeCrewId: entry.bridgeCrewId,
        subagentId: entry.subagentId,
        assignedByUserId: args.assignedByUserId,
        assignedByBridgeCrewId: context.actingBridgeCrewId,
      })),
      skipDuplicates: true,
    })
  })

  const assignments = await listAssignmentsRaw({
    ownerUserId: args.ownerUserId,
    shipDeploymentId: args.shipDeploymentId,
  })

  return assignments.map((entry) => toDto(entry))
}
