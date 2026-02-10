import { NextRequest, NextResponse } from "next/server"
import { Prisma, type DeploymentStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { ensureShipQuartermaster } from "@/lib/quartermaster/service"
import { publishNotificationUpdatedMany } from "@/lib/realtime/notifications"
import {
  AccessControlError,
  type AccessActor,
  requireAccessActor,
} from "@/lib/security/access-control"
import { publishShipUpdated } from "@/lib/shipyard/events"

export const dynamic = "force-dynamic"

interface ShipOwnershipTransferRequest {
  shipDeploymentId: string
  targetOwnerEmail: string
}

interface TransferShipRecord {
  id: string
  name: string
  userId: string
  status: DeploymentStatus
  nodeId: string
}

interface TransferTargetUser {
  id: string
}

interface TransferOwnershipArgs {
  shipDeploymentId: string
  newOwnerUserId: string
}

interface TransferOwnershipResult {
  ship: TransferShipRecord
  reassignedApplications: number
}

export interface ShipOwnershipTransferDeps {
  requireActor: () => Promise<AccessActor>
  findShipById: (shipDeploymentId: string) => Promise<TransferShipRecord | null>
  findUserByEmail: (email: string) => Promise<TransferTargetUser | null>
  transferOwnership: (args: TransferOwnershipArgs) => Promise<TransferOwnershipResult>
  ensureQuartermaster: (args: {
    userId: string
    shipDeploymentId: string
    shipName?: string
  }) => Promise<unknown>
  publishShipUpdateEvent: typeof publishShipUpdated
  publishNotificationUpdates: typeof publishNotificationUpdatedMany
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
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

function normalizeEmail(value: unknown): string | null {
  const normalized = asNonEmptyString(value)
  if (!normalized) {
    return null
  }
  return normalized.toLowerCase()
}

function parseTransferRequest(
  payload: Record<string, unknown>,
): { ok: true; value: ShipOwnershipTransferRequest } | { ok: false; error: string } {
  const shipDeploymentId = asNonEmptyString(payload.shipDeploymentId)
  const targetOwnerEmail = normalizeEmail(payload.targetOwnerEmail)

  if (!shipDeploymentId || !targetOwnerEmail) {
    return {
      ok: false,
      error: "shipDeploymentId and targetOwnerEmail are required",
    }
  }

  return {
    ok: true,
    value: {
      shipDeploymentId,
      targetOwnerEmail,
    },
  }
}

const defaultDeps: ShipOwnershipTransferDeps = {
  requireActor: requireAccessActor,
  findShipById: async (shipDeploymentId) =>
    prisma.agentDeployment.findFirst({
      where: {
        id: shipDeploymentId,
        deploymentType: "ship",
      },
      select: {
        id: true,
        name: true,
        userId: true,
        status: true,
        nodeId: true,
      },
    }),
  findUserByEmail: async (email) =>
    prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
      },
    }),
  transferOwnership: async (args) =>
    prisma.$transaction(async (tx) => {
      const ship = await tx.agentDeployment.update({
        where: {
          id: args.shipDeploymentId,
        },
        data: {
          userId: args.newOwnerUserId,
        },
        select: {
          id: true,
          name: true,
          userId: true,
          status: true,
          nodeId: true,
        },
      })

      const applications = await tx.applicationDeployment.updateMany({
        where: {
          shipDeploymentId: args.shipDeploymentId,
        },
        data: {
          userId: args.newOwnerUserId,
        },
      })

      return {
        ship,
        reassignedApplications: applications.count,
      }
    }),
  ensureQuartermaster: ensureShipQuartermaster,
  publishShipUpdateEvent: publishShipUpdated,
  publishNotificationUpdates: publishNotificationUpdatedMany,
}

function buildSuccessPayload(args: {
  transferred: boolean
  ship: TransferShipRecord
  previousOwnerUserId: string
  reassignedApplications: number
  quartermasterProvisioned: boolean
  warnings: string[]
}) {
  return {
    success: true,
    transferred: args.transferred,
    ship: {
      id: args.ship.id,
      name: args.ship.name,
      previousOwnerUserId: args.previousOwnerUserId,
      newOwnerUserId: args.ship.userId,
    },
    applications: {
      reassignedCount: args.reassignedApplications,
    },
    quartermaster: {
      provisioned: args.quartermasterProvisioned,
    },
    warnings: args.warnings,
  }
}

export async function handlePostTransfer(
  request: NextRequest,
  deps: ShipOwnershipTransferDeps = defaultDeps,
) {
  try {
    const actor = await deps.requireActor()
    const body = asRecord(await request.json().catch(() => ({})))
    const parsed = parseTransferRequest(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const ship = await deps.findShipById(parsed.value.shipDeploymentId)
    if (!ship) {
      return NextResponse.json({ error: "Ship not found" }, { status: 404 })
    }

    if (!actor.isAdmin && ship.userId !== actor.userId) {
      return NextResponse.json({ error: "Ship not found" }, { status: 404 })
    }

    const targetOwner = await deps.findUserByEmail(parsed.value.targetOwnerEmail)
    if (!targetOwner) {
      return NextResponse.json({ error: "Target user not found" }, { status: 404 })
    }

    if (targetOwner.id === ship.userId) {
      return NextResponse.json(
        buildSuccessPayload({
          transferred: false,
          ship,
          previousOwnerUserId: ship.userId,
          reassignedApplications: 0,
          quartermasterProvisioned: false,
          warnings: [],
        }),
      )
    }

    const previousOwnerUserId = ship.userId
    const ownershipUpdate = await deps.transferOwnership({
      shipDeploymentId: ship.id,
      newOwnerUserId: targetOwner.id,
    })

    let quartermasterProvisioned = true
    const warnings: string[] = []
    try {
      await deps.ensureQuartermaster({
        userId: targetOwner.id,
        shipDeploymentId: ownershipUpdate.ship.id,
        shipName: ownershipUpdate.ship.name,
      })
    } catch (error) {
      quartermasterProvisioned = false
      warnings.push(
        "Ownership transfer succeeded, but quartermaster provisioning for the new owner failed.",
      )
      console.error("Quartermaster provisioning failed after ownership transfer:", error)
    }

    deps.publishShipUpdateEvent({
      shipId: ownershipUpdate.ship.id,
      status: ownershipUpdate.ship.status,
      nodeId: ownershipUpdate.ship.nodeId,
      userId: previousOwnerUserId,
    })

    deps.publishShipUpdateEvent({
      shipId: ownershipUpdate.ship.id,
      status: ownershipUpdate.ship.status,
      nodeId: ownershipUpdate.ship.nodeId,
      userId: ownershipUpdate.ship.userId,
    })

    deps.publishNotificationUpdates({
      userIds: [previousOwnerUserId, ownershipUpdate.ship.userId],
      channel: "ships",
    })
    deps.publishNotificationUpdates({
      userIds: [previousOwnerUserId, ownershipUpdate.ship.userId],
      channel: "applications",
    })

    return NextResponse.json(
      buildSuccessPayload({
        transferred: true,
        ship: ownershipUpdate.ship,
        previousOwnerUserId,
        reassignedApplications: ownershipUpdate.reassignedApplications,
        quartermasterProvisioned,
        warnings,
      }),
    )
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        { status: error.status },
      )
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Ship not found" }, { status: 404 })
    }

    console.error("Error transferring ship ownership:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return handlePostTransfer(request)
}
