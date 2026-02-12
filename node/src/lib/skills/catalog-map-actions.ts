import type { SkillCatalogEntryDto } from "@/lib/skills/types"

export type SkillCatalogMapActionState =
  | "import_curated"
  | "already_installed"
  | "not_directly_importable"
  | "none_selected"

function updatedAtMs(value: string): number {
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

export function isMapDirectImportable(entry: SkillCatalogEntryDto): boolean {
  return entry.source === "curated" && !entry.isInstalled && !entry.isSystem
}

export function rankMapInstallCandidates(entries: SkillCatalogEntryDto[]): SkillCatalogEntryDto[] {
  const cloned = [...entries]

  cloned.sort((left, right) => {
    const leftPriority = isMapDirectImportable(left) ? 0 : 1
    const rightPriority = isMapDirectImportable(right) ? 0 : 1
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority
    }

    const leftUpdated = updatedAtMs(left.updatedAt)
    const rightUpdated = updatedAtMs(right.updatedAt)
    if (leftUpdated !== rightUpdated) {
      return rightUpdated - leftUpdated
    }

    const nameDiff = left.name.localeCompare(right.name)
    if (nameDiff !== 0) {
      return nameDiff
    }

    return left.id.localeCompare(right.id)
  })

  return cloned
}

export function resolveMapActionState(
  selectedEntry: SkillCatalogEntryDto | null | undefined,
): SkillCatalogMapActionState {
  if (!selectedEntry) {
    return "none_selected"
  }

  if (isMapDirectImportable(selectedEntry)) {
    return "import_curated"
  }

  if (selectedEntry.isInstalled) {
    return "already_installed"
  }

  return "not_directly_importable"
}
