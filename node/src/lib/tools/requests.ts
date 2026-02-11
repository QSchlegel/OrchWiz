import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type {
  ShipToolAccessRequestDto,
  ShipToolBridgeCrewOptionDto,
  ShipToolGrantDto,
  ShipToolsStateDto,
  ToolCatalogEntryDto,
} from "@/lib/tools/types"

export class ShipToolsError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = "ShipToolsError"
    this.status = status
  }
}

function asObjectJson(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function scopeKeyForGrant(args: {
  scope: "ship" | "bridge_crew"
  bridgeCrewId?: string | null
}): string {
  if (args.scope === "ship") {
    return "ship"
  }

  if (!args.bridgeCrewId) {
    throw new ShipToolsError("bridgeCrewId is required for bridge_crew scope")
  }

  return `bridge_crew:${args.bridgeCrewId}`
}

function toToolCatalogEntryDto(entry: {
  id: string
  slug: string
  name: string
  description: string | null
  source: "curated" | "custom_github" | "local" | "system"
  sourceKey: string
  repo: string | null
  sourcePath: string | null
  sourceRef: string | null
  sourceUrl: string | null
  isInstalled: boolean
  isSystem: boolean
  installedPath: string | null
  metadata: Prisma.JsonValue | null
  ownerUserId: string
  lastSyncedAt: Date
  createdAt: Date
  updatedAt: Date
}): ToolCatalogEntryDto {
  return {
    id: entry.id,
    slug: entry.slug,
    name: entry.name,
    description: entry.description,
    source: entry.source,
    sourceKey: entry.sourceKey,
    repo: entry.repo,
    sourcePath: entry.sourcePath,
    sourceRef: entry.sourceRef,
    sourceUrl: entry.sourceUrl,
    isInstalled: entry.isInstalled,
    isSystem: entry.isSystem,
    installedPath: entry.installedPath,
    metadata: asObjectJson(entry.metadata),
    ownerUserId: entry.ownerUserId,
    lastSyncedAt: entry.lastSyncedAt.toISOString(),
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  }
}

function toShipToolGrantDto(grant: {
  id: string
  ownerUserId: string
  shipDeploymentId: string
  catalogEntryId: string
  scope: "ship" | "bridge_crew"
  scopeKey: string
  bridgeCrewId: string | null
  grantedByUserId: string | null
  createdAt: Date
  updatedAt: Date
  catalogEntry: {
    id: string
    slug: string
    name: string
    description: string | null
    source: "curated" | "custom_github" | "local" | "system"
    sourceKey: string
    repo: string | null
    sourcePath: string | null
    sourceRef: string | null
    sourceUrl: string | null
    isInstalled: boolean
    isSystem: boolean
    installedPath: string | null
    metadata: Prisma.JsonValue | null
    ownerUserId: string
    lastSyncedAt: Date
    createdAt: Date
    updatedAt: Date
  }
  bridgeCrew: {
    id: string
    role: string
    callsign: string
    name: string
  } | null
}): ShipToolGrantDto {
  return {
    id: grant.id,
    ownerUserId: grant.ownerUserId,
    shipDeploymentId: grant.shipDeploymentId,
    catalogEntryId: grant.catalogEntryId,
    scope: grant.scope,
    scopeKey: grant.scopeKey,
    bridgeCrewId: grant.bridgeCrewId,
    grantedByUserId: grant.grantedByUserId,
    createdAt: grant.createdAt.toISOString(),
    updatedAt: grant.updatedAt.toISOString(),
    catalogEntry: toToolCatalogEntryDto(grant.catalogEntry),
    bridgeCrew: grant.bridgeCrew
      ? {
          id: grant.bridgeCrew.id,
          role: grant.bridgeCrew.role,
          callsign: grant.bridgeCrew.callsign,
          name: grant.bridgeCrew.name,
        }
      : null,
  }
}

function toShipToolAccessRequestDto(request: {
  id: string
  ownerUserId: string
  shipDeploymentId: string
  catalogEntryId: string
  requesterBridgeCrewId: string | null
  requestedByUserId: string
  scopePreference: "requester_only" | "ship"
  status: "pending" | "approved" | "denied"
  rationale: string | null
  metadata: Prisma.JsonValue | null
  approvedGrantId: string | null
  reviewedByUserId: string | null
  reviewedAt: Date | null
  createdAt: Date
  updatedAt: Date
  catalogEntry: {
    id: string
    slug: string
    name: string
    description: string | null
    source: "curated" | "custom_github" | "local" | "system"
    sourceKey: string
    repo: string | null
    sourcePath: string | null
    sourceRef: string | null
    sourceUrl: string | null
    isInstalled: boolean
    isSystem: boolean
    installedPath: string | null
    metadata: Prisma.JsonValue | null
    ownerUserId: string
    lastSyncedAt: Date
    createdAt: Date
    updatedAt: Date
  }
  requesterBridgeCrew: {
    id: string
    role: string
    callsign: string
    name: string
  } | null
}): ShipToolAccessRequestDto {
  return {
    id: request.id,
    ownerUserId: request.ownerUserId,
    shipDeploymentId: request.shipDeploymentId,
    catalogEntryId: request.catalogEntryId,
    requesterBridgeCrewId: request.requesterBridgeCrewId,
    requestedByUserId: request.requestedByUserId,
    scopePreference: request.scopePreference,
    status: request.status,
    rationale: request.rationale,
    metadata: asObjectJson(request.metadata),
    approvedGrantId: request.approvedGrantId,
    reviewedByUserId: request.reviewedByUserId,
    reviewedAt: request.reviewedAt ? request.reviewedAt.toISOString() : null,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    catalogEntry: toToolCatalogEntryDto(request.catalogEntry),
    requesterBridgeCrew: request.requesterBridgeCrew
      ? {
          id: request.requesterBridgeCrew.id,
          role: request.requesterBridgeCrew.role,
          callsign: request.requesterBridgeCrew.callsign,
          name: request.requesterBridgeCrew.name,
        }
      : null,
  }
}

async function requireOwnedShip(args: {
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
    throw new ShipToolsError("Ship not found", 404)
  }

  return ship
}

async function requireOwnedCatalogEntry(args: {
  ownerUserId: string
  catalogEntryId: string
  requireInstalled?: boolean
}) {
  const entry = await prisma.toolCatalogEntry.findFirst({
    where: {
      id: args.catalogEntryId,
      ownerUserId: args.ownerUserId,
    },
  })

  if (!entry) {
    throw new ShipToolsError("Tool catalog entry not found", 404)
  }

  if (args.requireInstalled && !entry.isInstalled) {
    throw new ShipToolsError("Tool must be installed before requesting access", 400)
  }

  return entry
}

async function requireShipBridgeCrew(args: {
  shipDeploymentId: string
  bridgeCrewId: string
}) {
  const bridgeCrew = await prisma.bridgeCrew.findFirst({
    where: {
      id: args.bridgeCrewId,
      deploymentId: args.shipDeploymentId,
    },
    select: {
      id: true,
      role: true,
      callsign: true,
      name: true,
      status: true,
    },
  })

  if (!bridgeCrew) {
    throw new ShipToolsError("bridgeCrewId is not part of the selected ship", 400)
  }

  return bridgeCrew
}

export async function getShipToolsStateForOwner(args: {
  ownerUserId: string
  shipDeploymentId: string
}): Promise<ShipToolsStateDto> {
  const ship = await requireOwnedShip(args)

  const [catalog, grants, requests, bridgeCrew] = await Promise.all([
    prisma.toolCatalogEntry.findMany({
      where: {
        ownerUserId: args.ownerUserId,
      },
      orderBy: {
        name: "asc",
      },
    }),
    prisma.shipToolGrant.findMany({
      where: {
        ownerUserId: args.ownerUserId,
        shipDeploymentId: args.shipDeploymentId,
      },
      include: {
        catalogEntry: true,
        bridgeCrew: {
          select: {
            id: true,
            role: true,
            callsign: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
    prisma.shipToolAccessRequest.findMany({
      where: {
        ownerUserId: args.ownerUserId,
        shipDeploymentId: args.shipDeploymentId,
        status: "pending",
      },
      include: {
        catalogEntry: true,
        requesterBridgeCrew: {
          select: {
            id: true,
            role: true,
            callsign: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
    prisma.bridgeCrew.findMany({
      where: {
        deploymentId: args.shipDeploymentId,
      },
      select: {
        id: true,
        role: true,
        callsign: true,
        name: true,
        status: true,
      },
      orderBy: {
        role: "asc",
      },
    }),
  ])

  const bridgeCrewDtos: ShipToolBridgeCrewOptionDto[] = bridgeCrew.map((member) => ({
    id: member.id,
    role: member.role,
    callsign: member.callsign,
    name: member.name,
    status: member.status,
  }))

  return {
    ship,
    catalog: catalog.map(toToolCatalogEntryDto),
    grants: grants.map(toShipToolGrantDto),
    requests: requests.map(toShipToolAccessRequestDto),
    bridgeCrew: bridgeCrewDtos,
  }
}

export async function createShipToolAccessRequestForOwner(args: {
  ownerUserId: string
  shipDeploymentId: string
  catalogEntryId: string
  requesterBridgeCrewId?: string | null
  scopePreference?: "requester_only" | "ship"
  rationale?: string | null
  requestedByUserId: string
  metadata?: Record<string, unknown> | null
}): Promise<ShipToolAccessRequestDto> {
  await requireOwnedShip(args)
  const entry = await requireOwnedCatalogEntry({
    ownerUserId: args.ownerUserId,
    catalogEntryId: args.catalogEntryId,
    requireInstalled: true,
  })

  let requesterBridgeCrewId: string | null = null
  if (args.requesterBridgeCrewId) {
    const bridgeCrew = await requireShipBridgeCrew({
      shipDeploymentId: args.shipDeploymentId,
      bridgeCrewId: args.requesterBridgeCrewId,
    })
    requesterBridgeCrewId = bridgeCrew.id
  }

  const created = await prisma.shipToolAccessRequest.create({
    data: {
      ownerUserId: args.ownerUserId,
      shipDeploymentId: args.shipDeploymentId,
      catalogEntryId: entry.id,
      requesterBridgeCrewId,
      requestedByUserId: args.requestedByUserId,
      scopePreference: args.scopePreference || "requester_only",
      status: "pending",
      rationale: args.rationale?.trim() || null,
      ...(args.metadata
        ? {
            metadata: args.metadata as Prisma.InputJsonValue,
          }
        : {}),
    },
    include: {
      catalogEntry: true,
      requesterBridgeCrew: {
        select: {
          id: true,
          role: true,
          callsign: true,
          name: true,
        },
      },
    },
  })

  return toShipToolAccessRequestDto(created)
}

async function upsertShipToolGrant(args: {
  ownerUserId: string
  shipDeploymentId: string
  catalogEntryId: string
  scope: "ship" | "bridge_crew"
  bridgeCrewId?: string | null
  grantedByUserId: string
}, shipToolGrantDelegate = prisma.shipToolGrant) {
  const scopeKey = scopeKeyForGrant({
    scope: args.scope,
    bridgeCrewId: args.bridgeCrewId,
  })

  return shipToolGrantDelegate.upsert({
    where: {
      shipDeploymentId_catalogEntryId_scopeKey: {
        shipDeploymentId: args.shipDeploymentId,
        catalogEntryId: args.catalogEntryId,
        scopeKey,
      },
    },
    create: {
      ownerUserId: args.ownerUserId,
      shipDeploymentId: args.shipDeploymentId,
      catalogEntryId: args.catalogEntryId,
      scope: args.scope,
      scopeKey,
      bridgeCrewId: args.bridgeCrewId || null,
      grantedByUserId: args.grantedByUserId,
    },
    update: {
      grantedByUserId: args.grantedByUserId,
      bridgeCrewId: args.bridgeCrewId || null,
      scope: args.scope,
      scopeKey,
    },
    include: {
      catalogEntry: true,
      bridgeCrew: {
        select: {
          id: true,
          role: true,
          callsign: true,
          name: true,
        },
      },
    },
  })
}

export async function reviewShipToolAccessRequestForOwner(args: {
  ownerUserId: string
  shipDeploymentId: string
  requestId: string
  decision: "approve" | "deny"
  grantMode?: "requester_only" | "ship"
  reviewedByUserId: string
  reviewNote?: string | null
}): Promise<{ request: ShipToolAccessRequestDto; grant: ShipToolGrantDto | null }> {
  await requireOwnedShip(args)

  const request = await prisma.shipToolAccessRequest.findFirst({
    where: {
      id: args.requestId,
      ownerUserId: args.ownerUserId,
      shipDeploymentId: args.shipDeploymentId,
    },
    include: {
      catalogEntry: true,
      requesterBridgeCrew: {
        select: {
          id: true,
          role: true,
          callsign: true,
          name: true,
        },
      },
    },
  })

  if (!request) {
    throw new ShipToolsError("Tool access request not found", 404)
  }

  if (request.status !== "pending") {
    throw new ShipToolsError("Only pending requests can be reviewed", 409)
  }

  if (args.decision === "deny") {
    const denied = await prisma.shipToolAccessRequest.update({
      where: {
        id: request.id,
      },
      data: {
        status: "denied",
        reviewedByUserId: args.reviewedByUserId,
        reviewedAt: new Date(),
        metadata: {
          ...(asObjectJson(request.metadata) || {}),
          ...(args.reviewNote?.trim()
            ? {
                reviewNote: args.reviewNote.trim(),
              }
            : {}),
        } as Prisma.InputJsonValue,
      },
      include: {
        catalogEntry: true,
        requesterBridgeCrew: {
          select: {
            id: true,
            role: true,
            callsign: true,
            name: true,
          },
        },
      },
    })

    return {
      request: toShipToolAccessRequestDto(denied),
      grant: null,
    }
  }

  const grantMode = args.grantMode
  if (!grantMode) {
    throw new ShipToolsError("grantMode is required for approval", 400)
  }

  let scope: "ship" | "bridge_crew" = "ship"
  let bridgeCrewId: string | null = null

  if (grantMode === "requester_only") {
    if (!request.requesterBridgeCrewId) {
      throw new ShipToolsError("requester_only approvals require requesterBridgeCrewId", 400)
    }
    await requireShipBridgeCrew({
      shipDeploymentId: args.shipDeploymentId,
      bridgeCrewId: request.requesterBridgeCrewId,
    })
    scope = "bridge_crew"
    bridgeCrewId = request.requesterBridgeCrewId
  }

  const [approvedRequest, approvedGrant] = await prisma.$transaction(async (tx) => {
    const grant = await upsertShipToolGrant({
      ownerUserId: args.ownerUserId,
      shipDeploymentId: args.shipDeploymentId,
      catalogEntryId: request.catalogEntryId,
      scope,
      bridgeCrewId,
      grantedByUserId: args.reviewedByUserId,
    }, tx.shipToolGrant)

    const nextMetadata = {
      ...(asObjectJson(request.metadata) || {}),
      grantMode,
      ...(args.reviewNote?.trim()
        ? {
            reviewNote: args.reviewNote.trim(),
          }
        : {}),
    }

    const updatedRequest = await tx.shipToolAccessRequest.update({
      where: {
        id: request.id,
      },
      data: {
        status: "approved",
        approvedGrantId: grant.id,
        reviewedByUserId: args.reviewedByUserId,
        reviewedAt: new Date(),
        metadata: nextMetadata as Prisma.InputJsonValue,
      },
      include: {
        catalogEntry: true,
        requesterBridgeCrew: {
          select: {
            id: true,
            role: true,
            callsign: true,
            name: true,
          },
        },
      },
    })

    return [updatedRequest, grant] as const
  })

  return {
    request: toShipToolAccessRequestDto(approvedRequest),
    grant: toShipToolGrantDto(approvedGrant),
  }
}

export async function revokeShipToolGrantForOwner(args: {
  ownerUserId: string
  shipDeploymentId: string
  grantId: string
}): Promise<void> {
  await requireOwnedShip(args)

  const grant = await prisma.shipToolGrant.findFirst({
    where: {
      id: args.grantId,
      ownerUserId: args.ownerUserId,
      shipDeploymentId: args.shipDeploymentId,
    },
    select: {
      id: true,
    },
  })

  if (!grant) {
    throw new ShipToolsError("Tool grant not found", 404)
  }

  await prisma.shipToolGrant.delete({
    where: {
      id: grant.id,
    },
  })
}

export interface ShipToolRuntimeToolItem {
  slug: string
  name: string
  description: string | null
  scope: "ship" | "bridge_crew"
  bridgeCrewCallsign?: string
}

export interface ShipToolRuntimeContext {
  shipName: string
  grantedTools: ShipToolRuntimeToolItem[]
  requestableTools: Array<{
    slug: string
    name: string
    description: string | null
  }>
}

export async function getShipToolRuntimeContext(args: {
  ownerUserId: string
  shipDeploymentId: string
  bridgeCrewId?: string | null
}): Promise<ShipToolRuntimeContext | null> {
  const ship = await prisma.agentDeployment.findFirst({
    where: {
      id: args.shipDeploymentId,
      userId: args.ownerUserId,
      deploymentType: "ship",
    },
    select: {
      id: true,
      name: true,
    },
  })

  if (!ship) {
    return null
  }

  const [catalogEntries, grants] = await Promise.all([
    prisma.toolCatalogEntry.findMany({
      where: {
        ownerUserId: args.ownerUserId,
        isInstalled: true,
      },
      orderBy: {
        slug: "asc",
      },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
      },
    }),
    prisma.shipToolGrant.findMany({
      where: {
        ownerUserId: args.ownerUserId,
        shipDeploymentId: args.shipDeploymentId,
      },
      include: {
        catalogEntry: {
          select: {
            id: true,
            slug: true,
            name: true,
            description: true,
          },
        },
        bridgeCrew: {
          select: {
            id: true,
            callsign: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    }),
  ])

  const bridgeCrewId = args.bridgeCrewId?.trim() || null
  const visibleGrants = bridgeCrewId
    ? grants.filter((grant) => grant.scope === "ship" || grant.bridgeCrewId === bridgeCrewId)
    : grants

  const hiddenGrantEntryIds = bridgeCrewId
    ? new Set(visibleGrants.map((grant) => grant.catalogEntryId))
    : new Set(grants.map((grant) => grant.catalogEntryId))

  const grantedTools = visibleGrants
    .map((grant) => ({
      slug: grant.catalogEntry.slug,
      name: grant.catalogEntry.name,
      description: grant.catalogEntry.description,
      scope: grant.scope,
      bridgeCrewCallsign: grant.bridgeCrew?.callsign,
    }))
    .sort((left, right) => left.slug.localeCompare(right.slug))

  const requestableTools = catalogEntries
    .filter((entry) => !hiddenGrantEntryIds.has(entry.id))
    .map((entry) => ({
      slug: entry.slug,
      name: entry.name,
      description: entry.description,
    }))
    .sort((left, right) => left.slug.localeCompare(right.slug))

  return {
    shipName: ship.name,
    grantedTools,
    requestableTools,
  }
}
