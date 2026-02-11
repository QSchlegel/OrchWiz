import { prisma } from "@/lib/prisma"

export interface SubagentToolBindingCatalogEntry {
  id: string
  slug: string
  name: string
  description: string | null
  source: "curated" | "custom_github" | "local" | "system"
  isInstalled: boolean
  isSystem: boolean
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
}): Promise<SubagentToolBindingDto[]> {
  const normalized = normalizeBindingsInput(args.bindings)
  const requestedEntryIds = normalized.map((entry) => entry.toolCatalogEntryId)

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
      },
    })

    const ownedInstalledEntryIds = new Set(catalogEntries.map((entry) => entry.id))
    for (const entryId of requestedEntryIds) {
      if (!ownedInstalledEntryIds.has(entryId)) {
        throw new SubagentToolBindingError(
          `toolCatalogEntryId is not imported or not owned: ${entryId}`,
          404,
        )
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await (tx as unknown as {
      subagentToolBinding: {
        deleteMany: (args: unknown) => Promise<unknown>
        createMany: (args: unknown) => Promise<unknown>
      }
    }).subagentToolBinding.deleteMany({
      where: {
        subagentId: args.subagentId,
      },
    })

    if (normalized.length === 0) {
      return
    }

    await (tx as unknown as {
      subagentToolBinding: {
        deleteMany: (args: unknown) => Promise<unknown>
        createMany: (args: unknown) => Promise<unknown>
      }
    }).subagentToolBinding.createMany({
      data: normalized.map((entry) => ({
        subagentId: args.subagentId,
        toolCatalogEntryId: entry.toolCatalogEntryId,
        enabled: entry.enabled,
      })),
      skipDuplicates: true,
    })
  })

  return listSubagentToolBindings(args.subagentId)
}
