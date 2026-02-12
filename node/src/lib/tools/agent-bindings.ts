import { prisma } from "@/lib/prisma"
import {
  assertCanManageSubagentGrant,
  isActingAsXo,
  isOwnerActingDirectly,
  resolveGovernanceActorContext,
} from "@/lib/governance/chain-of-command"
import {
  createGovernanceGrantEvent,
  createGovernanceSecurityReportRecord,
} from "@/lib/governance/events"
import { writeGovernanceSecurityReport } from "@/lib/governance/reports"

export interface SubagentToolBindingCatalogEntry {
  id: string
  slug: string
  name: string
  description: string | null
  source: "curated" | "custom_github" | "local" | "system"
  isInstalled: boolean
  isSystem: boolean
  activationStatus: "pending" | "approved" | "denied"
  activationRationale: string | null
  activatedAt: string | null
  activatedByUserId: string | null
  activatedByBridgeCrewId: string | null
  activationSecurityReportId: string | null
  sourceUrl: string | null
  metadata: Record<string, unknown> | null
}

export interface SubagentToolBindingDto {
  id: string
  subagentId: string
  toolCatalogEntryId: string
  enabled: boolean
  createdAt: string
  updatedAt: string
  catalogEntry: SubagentToolBindingCatalogEntry
}

interface NormalizedToolBindingInput {
  toolCatalogEntryId: string
  enabled: boolean
}

export class SubagentToolBindingError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = "SubagentToolBindingError"
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

function normalizeBindingEntry(value: unknown): NormalizedToolBindingInput {
  const record = asRecord(value)
  if (!record) {
    throw new SubagentToolBindingError("bindings entries must be objects")
  }

  const rawId = record.toolCatalogEntryId
  if (typeof rawId !== "string" || !rawId.trim()) {
    throw new SubagentToolBindingError("bindings entries must include toolCatalogEntryId")
  }

  return {
    toolCatalogEntryId: rawId.trim(),
    enabled: record.enabled === false ? false : true,
  }
}

function normalizeBindingsInput(value: unknown): NormalizedToolBindingInput[] {
  if (!Array.isArray(value)) {
    throw new SubagentToolBindingError("bindings must be an array")
  }

  const deduped = new Map<string, NormalizedToolBindingInput>()
  for (const entry of value) {
    const normalized = normalizeBindingEntry(entry)
    deduped.set(normalized.toolCatalogEntryId, normalized)
  }

  return [...deduped.values()]
}

function normalizeCatalogMetadata(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function toSubagentToolBindingDto(value: {
  id: string
  subagentId: string
  toolCatalogEntryId: string
  enabled: boolean
  createdAt: Date
  updatedAt: Date
  toolCatalogEntry: {
    id: string
    slug: string
    name: string
    description: string | null
    source: "curated" | "custom_github" | "local" | "system"
    isInstalled: boolean
    isSystem: boolean
    activationStatus: "pending" | "approved" | "denied"
    activationRationale: string | null
    activatedAt: Date | null
    activatedByUserId: string | null
    activatedByBridgeCrewId: string | null
    activationSecurityReportId: string | null
    sourceUrl: string | null
    metadata: unknown
  }
}): SubagentToolBindingDto {
  return {
    id: value.id,
    subagentId: value.subagentId,
    toolCatalogEntryId: value.toolCatalogEntryId,
    enabled: value.enabled,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
    catalogEntry: {
      id: value.toolCatalogEntry.id,
      slug: value.toolCatalogEntry.slug,
      name: value.toolCatalogEntry.name,
      description: value.toolCatalogEntry.description,
      source: value.toolCatalogEntry.source,
      isInstalled: value.toolCatalogEntry.isInstalled,
      isSystem: value.toolCatalogEntry.isSystem,
      activationStatus: value.toolCatalogEntry.activationStatus,
      activationRationale: value.toolCatalogEntry.activationRationale,
      activatedAt: value.toolCatalogEntry.activatedAt ? value.toolCatalogEntry.activatedAt.toISOString() : null,
      activatedByUserId: value.toolCatalogEntry.activatedByUserId,
      activatedByBridgeCrewId: value.toolCatalogEntry.activatedByBridgeCrewId,
      activationSecurityReportId: value.toolCatalogEntry.activationSecurityReportId,
      sourceUrl: value.toolCatalogEntry.sourceUrl,
      metadata: normalizeCatalogMetadata(value.toolCatalogEntry.metadata),
    },
  }
}

export async function listSubagentToolBindings(subagentId: string): Promise<SubagentToolBindingDto[]> {
  const rows = await (prisma as unknown as {
    subagentToolBinding: {
      findMany: (args: unknown) => Promise<Array<{
        id: string
        subagentId: string
        toolCatalogEntryId: string
        enabled: boolean
        createdAt: Date
        updatedAt: Date
        toolCatalogEntry: {
          id: string
          slug: string
          name: string
          description: string | null
          source: "curated" | "custom_github" | "local" | "system"
          isInstalled: boolean
          isSystem: boolean
          activationStatus: "pending" | "approved" | "denied"
          activationRationale: string | null
          activatedAt: Date | null
          activatedByUserId: string | null
          activatedByBridgeCrewId: string | null
          activationSecurityReportId: string | null
          sourceUrl: string | null
          metadata: unknown
        }
      }>>
    }
  }).subagentToolBinding.findMany({
    where: {
      subagentId,
    },
    include: {
      toolCatalogEntry: {
        select: {
          id: true,
          slug: true,
          name: true,
          description: true,
          source: true,
          isInstalled: true,
          isSystem: true,
          activationStatus: true,
          activationRationale: true,
          activatedAt: true,
          activatedByUserId: true,
          activatedByBridgeCrewId: true,
          activationSecurityReportId: true,
          sourceUrl: true,
          metadata: true,
        },
      },
    },
    orderBy: [
      {
        createdAt: "asc",
      },
      {
        id: "asc",
      },
    ],
  })

  return rows.map((row) => toSubagentToolBindingDto(row))
}

export async function replaceSubagentToolBindings(args: {
  subagentId: string
  ownerUserId: string
  bindings: unknown
  shipDeploymentId?: string | null
  actingBridgeCrewId?: string | null
  grantRationale?: string | null
  revokeReason?: string | null
  changedByUserId: string
}): Promise<SubagentToolBindingDto[]> {
  const normalized = normalizeBindingsInput(args.bindings)

  const subagent = await prisma.subagent.findFirst({
    where: {
      id: args.subagentId,
      ownerUserId: args.ownerUserId,
    },
    select: {
      id: true,
      ownerUserId: true,
    },
  })

  if (!subagent) {
    throw new SubagentToolBindingError("Subagent not found", 404)
  }

  const actingBridgeCrewId = asNonEmptyString(args.actingBridgeCrewId)
  const shipDeploymentId = asNonEmptyString(args.shipDeploymentId)

  const governanceContext = await resolveGovernanceActorContext({
    ownerUserId: args.ownerUserId,
    actingBridgeCrewId,
    shipDeploymentId,
  })

  if (actingBridgeCrewId && !shipDeploymentId) {
    throw new SubagentToolBindingError("shipDeploymentId is required when actingBridgeCrewId is provided", 400)
  }

  if (shipDeploymentId) {
    await assertCanManageSubagentGrant({
      context: governanceContext,
      subagentId: subagent.id,
      shipDeploymentId,
    })
  }

  const existingBindings = await prisma.subagentToolBinding.findMany({
    where: {
      subagentId: args.subagentId,
    },
    include: {
      toolCatalogEntry: {
        select: {
          id: true,
          slug: true,
          name: true,
        },
      },
    },
  })

  const requestedEntryIds = normalized.map((entry) => entry.toolCatalogEntryId)
  let catalogById = new Map<string, {
    id: string
    slug: string
    name: string
    activationStatus: "pending" | "approved" | "denied"
  }>()

  if (requestedEntryIds.length > 0) {
    const catalogEntries = await prisma.toolCatalogEntry.findMany({
      where: {
        id: {
          in: requestedEntryIds,
        },
        ownerUserId: args.ownerUserId,
        isInstalled: true,
      },
      select: {
        id: true,
        slug: true,
        name: true,
        activationStatus: true,
      },
    })

    catalogById = new Map(catalogEntries.map((entry) => [entry.id, entry]))

    for (const entryId of requestedEntryIds) {
      const entry = catalogById.get(entryId)
      if (!entry) {
        throw new SubagentToolBindingError(
          `toolCatalogEntryId is not imported or not owned: ${entryId}`,
          404,
        )
      }

      if (entry.activationStatus !== "approved") {
        throw new SubagentToolBindingError(
          `toolCatalogEntryId is not activation-approved: ${entryId}`,
          403,
        )
      }
    }
  }

  const existingEnabled = new Set(
    existingBindings
      .filter((entry) => entry.enabled)
      .map((entry) => entry.toolCatalogEntryId),
  )
  const nextEnabled = new Set(
    normalized
      .filter((entry) => entry.enabled)
      .map((entry) => entry.toolCatalogEntryId),
  )

  const newlyEnabledIds = [...nextEnabled].filter((entryId) => !existingEnabled.has(entryId))
  const revokedIds = [...existingEnabled].filter((entryId) => !nextEnabled.has(entryId))

  if (
    revokedIds.length > 0
    && !isOwnerActingDirectly(governanceContext)
    && !isActingAsXo(governanceContext)
  ) {
    const latestGrantEvents = await prisma.governanceGrantEvent.findMany({
      where: {
        ownerUserId: args.ownerUserId,
        subagentId: args.subagentId,
        eventType: "subagent_tool_granted",
        toolCatalogEntryId: {
          in: revokedIds,
        },
      },
      select: {
        toolCatalogEntryId: true,
        actorBridgeCrewId: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    const latestGrantByToolId = new Map<string, { actorBridgeCrewId: string | null }>()
    for (const event of latestGrantEvents) {
      if (!event.toolCatalogEntryId || latestGrantByToolId.has(event.toolCatalogEntryId)) {
        continue
      }

      latestGrantByToolId.set(event.toolCatalogEntryId, {
        actorBridgeCrewId: event.actorBridgeCrewId,
      })
    }

    for (const entryId of revokedIds) {
      const latestGrant = latestGrantByToolId.get(entryId)
      if (!latestGrant || latestGrant.actorBridgeCrewId !== governanceContext.actingBridgeCrewId) {
        throw new SubagentToolBindingError(
          "Revoking this subagent tool grant requires owner/XO authority or the same acting bridge crew grantor",
          403,
        )
      }
    }
  }

  const grantRationale = args.grantRationale?.trim() || ""
  if (newlyEnabledIds.length > 0 && !grantRationale) {
    throw new SubagentToolBindingError("grantRationale is required when granting new subagent tool access", 400)
  }

  const grantReportArtifacts = await Promise.all(
    newlyEnabledIds.map(async (entryId) => {
      const catalogEntry = catalogById.get(entryId)
      if (!catalogEntry) {
        throw new SubagentToolBindingError(`toolCatalogEntryId lookup failed for report generation: ${entryId}`, 500)
      }

      const artifact = await writeGovernanceSecurityReport({
        ownerUserId: args.ownerUserId,
        eventType: "subagent_tool_granted",
        rationale: grantRationale,
        actor: {
          userId: args.changedByUserId,
          actingBridgeCrewId: governanceContext.actingBridgeCrewId,
          actingBridgeCrewRole: governanceContext.actingBridgeCrewRole,
          actingBridgeCrewCallsign: governanceContext.actingBridgeCrewCallsign,
        },
        resource: {
          subagentId: args.subagentId,
          toolCatalogEntryId: catalogEntry.id,
          toolSlug: catalogEntry.slug,
          shipDeploymentId: shipDeploymentId || null,
        },
      })

      return {
        entryId,
        artifact,
      }
    }),
  )

  const grantReportByToolId = new Map(grantReportArtifacts.map((item) => [item.entryId, item.artifact]))
  const existingById = new Map(existingBindings.map((entry) => [entry.toolCatalogEntryId, entry]))

  await prisma.$transaction(async (tx) => {
    await tx.subagentToolBinding.deleteMany({
      where: {
        subagentId: args.subagentId,
      },
    })

    if (normalized.length > 0) {
      await tx.subagentToolBinding.createMany({
        data: normalized.map((entry) => ({
          subagentId: args.subagentId,
          toolCatalogEntryId: entry.toolCatalogEntryId,
          enabled: entry.enabled,
        })),
        skipDuplicates: true,
      })
    }

    for (const entryId of newlyEnabledIds) {
      const report = grantReportByToolId.get(entryId)
      if (!report) {
        throw new SubagentToolBindingError("Missing report artifact for subagent grant", 500)
      }

      const reportRecord = await createGovernanceSecurityReportRecord({
        ownerUserId: args.ownerUserId,
        eventType: "subagent_tool_granted",
        rationale: grantRationale,
        reportPathMd: report.reportPathMd || "",
        reportPathJson: report.reportPathJson || "",
        createdByUserId: args.changedByUserId,
        createdByBridgeCrewId: governanceContext.actingBridgeCrewId,
        tx,
      })

      await createGovernanceGrantEvent({
        ownerUserId: args.ownerUserId,
        createdByUserId: args.changedByUserId,
        eventType: "subagent_tool_granted",
        toolCatalogEntryId: entryId,
        shipDeploymentId: shipDeploymentId || null,
        subagentId: args.subagentId,
        actorBridgeCrewId: governanceContext.actingBridgeCrewId,
        securityReportId: reportRecord.id,
        rationale: grantRationale,
        tx,
      })
    }

    for (const entryId of revokedIds) {
      await createGovernanceGrantEvent({
        ownerUserId: args.ownerUserId,
        createdByUserId: args.changedByUserId,
        eventType: "subagent_tool_revoked",
        toolCatalogEntryId: entryId,
        shipDeploymentId: shipDeploymentId || null,
        subagentId: args.subagentId,
        actorBridgeCrewId: governanceContext.actingBridgeCrewId,
        rationale: args.revokeReason?.trim() || null,
        metadata: {
          previousBindingId: existingById.get(entryId)?.id || null,
        },
        tx,
      })
    }
  })

  return listSubagentToolBindings(args.subagentId)
}
