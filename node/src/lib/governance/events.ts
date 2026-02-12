import { Prisma, type GovernanceEventType } from "@prisma/client"
import { prisma } from "@/lib/prisma"

function asInputJson(value: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | undefined {
  if (!value) {
    return undefined
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

type GovernanceDbClient = Prisma.TransactionClient | typeof prisma

function resolveClient(tx?: Prisma.TransactionClient): GovernanceDbClient {
  return tx || prisma
}

export async function createGovernanceSecurityReportRecord(args: {
  ownerUserId: string
  eventType: GovernanceEventType
  rationale: string
  reportPathMd: string
  reportPathJson: string
  createdByUserId: string
  createdByBridgeCrewId?: string | null
  tx?: Prisma.TransactionClient
}) {
  const client = resolveClient(args.tx)

  return client.governanceSecurityReport.create({
    data: {
      ownerUserId: args.ownerUserId,
      eventType: args.eventType,
      rationale: args.rationale,
      reportPathMd: args.reportPathMd,
      reportPathJson: args.reportPathJson,
      createdByUserId: args.createdByUserId,
      createdByBridgeCrewId: args.createdByBridgeCrewId || null,
    },
  })
}

export async function createGovernanceGrantEvent(args: {
  ownerUserId: string
  createdByUserId: string
  eventType: GovernanceEventType
  toolCatalogEntryId?: string | null
  skillCatalogEntryId?: string | null
  shipDeploymentId?: string | null
  bridgeCrewId?: string | null
  subagentId?: string | null
  actorBridgeCrewId?: string | null
  securityReportId?: string | null
  rationale?: string | null
  metadata?: Record<string, unknown> | null
  tx?: Prisma.TransactionClient
}) {
  const client = resolveClient(args.tx)

  return client.governanceGrantEvent.create({
    data: {
      ownerUserId: args.ownerUserId,
      createdByUserId: args.createdByUserId,
      eventType: args.eventType,
      toolCatalogEntryId: args.toolCatalogEntryId || null,
      skillCatalogEntryId: args.skillCatalogEntryId || null,
      shipDeploymentId: args.shipDeploymentId || null,
      bridgeCrewId: args.bridgeCrewId || null,
      subagentId: args.subagentId || null,
      actorBridgeCrewId: args.actorBridgeCrewId || null,
      securityReportId: args.securityReportId || null,
      rationale: args.rationale?.trim() || null,
      ...(args.metadata
        ? {
            metadata: asInputJson(args.metadata),
          }
        : {}),
    },
  })
}

export async function listRecentGovernanceGrantEvents(args: {
  ownerUserId: string
  shipDeploymentId?: string | null
  limit?: number
}) {
  return prisma.governanceGrantEvent.findMany({
    where: {
      ownerUserId: args.ownerUserId,
      ...(args.shipDeploymentId
        ? {
            OR: [
              { shipDeploymentId: args.shipDeploymentId },
              { shipDeploymentId: null },
            ],
          }
        : {}),
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
      actorBridgeCrew: {
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
      toolCatalogEntry: {
        select: {
          id: true,
          slug: true,
          name: true,
        },
      },
      skillCatalogEntry: {
        select: {
          id: true,
          slug: true,
          name: true,
        },
      },
      securityReport: {
        select: {
          id: true,
          reportPathMd: true,
          reportPathJson: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: Math.max(1, Math.min(100, args.limit || 20)),
  })
}
