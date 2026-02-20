import { Prisma, type GovernanceEventType } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { isPrismaMissingColumnError } from "@/lib/prisma-errors"

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
  runtimeAdapterCatalogEntryId?: string | null
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
  const data: Prisma.GovernanceGrantEventUncheckedCreateInput = {
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
    ...(args.runtimeAdapterCatalogEntryId !== undefined
      ? {
          runtimeAdapterCatalogEntryId: args.runtimeAdapterCatalogEntryId || null,
        }
      : {}),
    ...(args.metadata
      ? {
          metadata: asInputJson(args.metadata),
        }
      : {}),
  }

  try {
    return await client.governanceGrantEvent.create({
      data,
    })
  } catch (error) {
    if (!isPrismaMissingColumnError(error, "runtimeAdapterCatalogEntryId")) {
      throw error
    }

    const { runtimeAdapterCatalogEntryId: _ignored, ...fallbackData } = data
    try {
      return await client.governanceGrantEvent.create({
        data: fallbackData as Prisma.GovernanceGrantEventUncheckedCreateInput,
      })
    } catch (retryError) {
      const message =
        retryError instanceof Error ? retryError.message : "Unknown governance event write failure."
      throw new Error(
        `Governance grant event write failed after schema-drift retry. ${message}. Run \`npm run db:migrate\` to sync local schema.`,
      )
    }
  }
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
    // Keep this projection narrow so older/local databases missing newly-added
    // governance columns can still serve ship-tools state without a 500.
    select: {
      id: true,
      eventType: true,
      toolCatalogEntryId: true,
      skillCatalogEntryId: true,
      bridgeCrewId: true,
      subagentId: true,
      actorBridgeCrewId: true,
      rationale: true,
      metadata: true,
      createdAt: true,
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
