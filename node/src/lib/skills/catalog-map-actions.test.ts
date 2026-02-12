import assert from "node:assert/strict"
import test from "node:test"
import {
  isMapDirectImportable,
  rankMapInstallCandidates,
  resolveMapActionState,
} from "@/lib/skills/catalog-map-actions"
import type { SkillCatalogEntryDto } from "@/lib/skills/types"

function entry(overrides: Partial<SkillCatalogEntryDto>): SkillCatalogEntryDto {
  const id = overrides.id || "entry"
  return {
    id,
    slug: overrides.slug || id,
    name: overrides.name || id,
    description: overrides.description ?? null,
    source: overrides.source || "curated",
    sourceKey: overrides.sourceKey || `${id}-key`,
    repo: overrides.repo ?? null,
    sourcePath: overrides.sourcePath ?? null,
    sourceRef: overrides.sourceRef ?? null,
    sourceUrl: overrides.sourceUrl ?? null,
    isInstalled: overrides.isInstalled ?? false,
    isSystem: overrides.isSystem ?? false,
    installedPath: overrides.installedPath ?? null,
    activationStatus: overrides.activationStatus || "approved",
    activationRationale: overrides.activationRationale ?? null,
    activatedAt: overrides.activatedAt ?? null,
    activatedByUserId: overrides.activatedByUserId ?? null,
    activatedByBridgeCrewId: overrides.activatedByBridgeCrewId ?? null,
    activationSecurityReportId: overrides.activationSecurityReportId ?? null,
    metadata: overrides.metadata ?? null,
    ownerUserId: overrides.ownerUserId || "user-1",
    lastSyncedAt: overrides.lastSyncedAt || "2026-02-11T12:00:00.000Z",
    createdAt: overrides.createdAt || "2026-02-11T12:00:00.000Z",
    updatedAt: overrides.updatedAt || "2026-02-11T12:00:00.000Z",
  }
}

test("isMapDirectImportable returns true only for curated and not installed", () => {
  assert.equal(isMapDirectImportable(entry({ source: "curated", isInstalled: false })), true)
  assert.equal(isMapDirectImportable(entry({ source: "curated", isInstalled: true })), false)
  assert.equal(isMapDirectImportable(entry({ source: "experimental", isInstalled: false })), false)
  assert.equal(isMapDirectImportable(entry({ source: "custom_github", isInstalled: false })), false)
  assert.equal(isMapDirectImportable(entry({ source: "system", isInstalled: false, isSystem: true })), false)
})

test("rankMapInstallCandidates prioritizes curated not installed then updated desc then name asc", () => {
  const ranked = rankMapInstallCandidates([
    entry({ id: "d", name: "Delta", source: "experimental", updatedAt: "2026-02-11T08:00:00.000Z" }),
    entry({ id: "b", name: "Beta", source: "curated", isInstalled: false, updatedAt: "2026-02-11T09:00:00.000Z" }),
    entry({ id: "a", name: "Alpha", source: "curated", isInstalled: false, updatedAt: "2026-02-11T09:00:00.000Z" }),
    entry({ id: "c", name: "Curated Installed", source: "curated", isInstalled: true, updatedAt: "2026-02-11T10:00:00.000Z" }),
  ])

  assert.deepEqual(
    ranked.map((item) => item.id),
    ["a", "b", "c", "d"],
  )
})

test("resolveMapActionState resolves all map action states", () => {
  assert.equal(resolveMapActionState(null), "none_selected")
  assert.equal(
    resolveMapActionState(entry({ source: "curated", isInstalled: false })),
    "import_curated",
  )
  assert.equal(
    resolveMapActionState(entry({ source: "curated", isInstalled: true })),
    "already_installed",
  )
  assert.equal(
    resolveMapActionState(entry({ source: "system", isSystem: true, isInstalled: false })),
    "not_directly_importable",
  )
  assert.equal(
    resolveMapActionState(entry({ source: "custom_github", isInstalled: false })),
    "not_directly_importable",
  )
})
