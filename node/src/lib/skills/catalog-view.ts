import type {
  SkillCatalogEntryDto,
  SkillCatalogSourceValue,
  SkillGraphGroupId,
} from "@/lib/skills/types"

export type SkillCatalogSortKey = "name_asc" | "source" | "updated_desc" | "installed_first"
export type SkillCatalogStatusFilter = "installed" | "not_installed" | "system"

export interface SkillCatalogFilterState {
  query: string
  sourceFilters: SkillCatalogSourceValue[]
  statusFilters: SkillCatalogStatusFilter[]
  groupFilter: SkillGraphGroupId | null
  sort: SkillCatalogSortKey
}

export interface SkillCatalogSection {
  groupId: SkillGraphGroupId
  label: string
  count: number
  entries: SkillCatalogEntryDto[]
}

export interface SkillCatalogViewModel {
  filteredEntries: SkillCatalogEntryDto[]
  sections: SkillCatalogSection[]
  selectedSkillId: string | null
  selectedEntry: SkillCatalogEntryDto | null
  counters: {
    total: number
    filtered: number
    byGroup: Record<SkillGraphGroupId, number>
  }
}

const GROUP_ORDER: SkillGraphGroupId[] = ["installed", "curated", "experimental", "custom", "system"]

const GROUP_LABEL: Record<SkillGraphGroupId, string> = {
  installed: "Installed",
  curated: "Curated Available",
  experimental: "Experimental Available",
  custom: "Custom Imported",
  system: "System Skills",
}

const SOURCE_SORT_ORDER: SkillCatalogSourceValue[] = ["curated", "experimental", "custom_github", "local", "system"]

function sourceSortWeight(source: SkillCatalogSourceValue): number {
  const idx = SOURCE_SORT_ORDER.indexOf(source)
  return idx >= 0 ? idx : SOURCE_SORT_ORDER.length
}

export function classifyCatalogGroup(entry: SkillCatalogEntryDto): SkillGraphGroupId {
  if (entry.isSystem || entry.source === "system") {
    return "system"
  }

  if (entry.source === "custom_github" || entry.source === "local") {
    return "custom"
  }

  if (entry.isInstalled) {
    return "installed"
  }

  if (entry.source === "experimental") {
    return "experimental"
  }

  if (entry.source === "curated") {
    return "curated"
  }

  return "custom"
}

function statusMatches(entry: SkillCatalogEntryDto, status: SkillCatalogStatusFilter): boolean {
  if (status === "installed") {
    return entry.isInstalled
  }

  if (status === "not_installed") {
    return !entry.isInstalled
  }

  return entry.isSystem || entry.source === "system"
}

function sortEntries(entries: SkillCatalogEntryDto[], sort: SkillCatalogSortKey): SkillCatalogEntryDto[] {
  const cloned = [...entries]

  if (sort === "source") {
    cloned.sort((left, right) => {
      const sourceDiff = sourceSortWeight(left.source) - sourceSortWeight(right.source)
      if (sourceDiff !== 0) {
        return sourceDiff
      }
      return left.name.localeCompare(right.name)
    })
    return cloned
  }

  if (sort === "updated_desc") {
    cloned.sort((left, right) => {
      const rightTime = new Date(right.updatedAt).getTime()
      const leftTime = new Date(left.updatedAt).getTime()
      if (rightTime !== leftTime) {
        return rightTime - leftTime
      }
      return left.name.localeCompare(right.name)
    })
    return cloned
  }

  if (sort === "installed_first") {
    cloned.sort((left, right) => {
      if (left.isInstalled !== right.isInstalled) {
        return left.isInstalled ? -1 : 1
      }

      if (left.isSystem !== right.isSystem) {
        return left.isSystem ? -1 : 1
      }

      return left.name.localeCompare(right.name)
    })
    return cloned
  }

  cloned.sort((left, right) => left.name.localeCompare(right.name))
  return cloned
}

function buildCounters(entries: SkillCatalogEntryDto[]): Record<SkillGraphGroupId, number> {
  const byGroup: Record<SkillGraphGroupId, number> = {
    installed: 0,
    curated: 0,
    experimental: 0,
    custom: 0,
    system: 0,
  }

  for (const entry of entries) {
    byGroup[classifyCatalogGroup(entry)] += 1
  }

  return byGroup
}

export function resolveSelectedSkillId(
  selectedSkillId: string | null,
  filteredEntries: SkillCatalogEntryDto[],
): string | null {
  if (filteredEntries.length === 0) {
    return null
  }

  if (selectedSkillId && filteredEntries.some((entry) => entry.id === selectedSkillId)) {
    return selectedSkillId
  }

  return filteredEntries[0]?.id || null
}

export function buildSkillCatalogView(args: {
  entries: SkillCatalogEntryDto[]
  filters: SkillCatalogFilterState
  selectedSkillId: string | null
}): SkillCatalogViewModel {
  const normalizedQuery = args.filters.query.trim().toLowerCase()
  const sourceFilterSet = new Set(args.filters.sourceFilters)
  const statusFilterSet = new Set(args.filters.statusFilters)

  const filtered = args.entries.filter((entry) => {
    if (normalizedQuery) {
      const haystack = `${entry.name} ${entry.slug} ${entry.description || ""}`.toLowerCase()
      if (!haystack.includes(normalizedQuery)) {
        return false
      }
    }

    if (sourceFilterSet.size > 0 && !sourceFilterSet.has(entry.source)) {
      return false
    }

    if (statusFilterSet.size > 0) {
      let anyStatusMatch = false
      for (const status of statusFilterSet) {
        if (statusMatches(entry, status)) {
          anyStatusMatch = true
          break
        }
      }

      if (!anyStatusMatch) {
        return false
      }
    }

    if (args.filters.groupFilter && classifyCatalogGroup(entry) !== args.filters.groupFilter) {
      return false
    }

    return true
  })

  const sorted = sortEntries(filtered, args.filters.sort)
  const selectedSkillId = resolveSelectedSkillId(args.selectedSkillId, sorted)
  const selectedEntry = sorted.find((entry) => entry.id === selectedSkillId) || null

  const sectionMap = new Map<SkillGraphGroupId, SkillCatalogEntryDto[]>()
  for (const entry of sorted) {
    const groupId = classifyCatalogGroup(entry)
    const current = sectionMap.get(groupId) || []
    current.push(entry)
    sectionMap.set(groupId, current)
  }

  const sections: SkillCatalogSection[] = GROUP_ORDER
    .map((groupId) => {
      const entries = sectionMap.get(groupId) || []
      return {
        groupId,
        label: GROUP_LABEL[groupId],
        count: entries.length,
        entries,
      }
    })
    .filter((section) => section.count > 0)

  return {
    filteredEntries: sorted,
    sections,
    selectedSkillId,
    selectedEntry,
    counters: {
      total: args.entries.length,
      filtered: sorted.length,
      byGroup: buildCounters(sorted),
    },
  }
}
