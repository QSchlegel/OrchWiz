import assert from "node:assert/strict"
import test from "node:test"
import {
  buildSkillCatalogView,
  classifyCatalogGroup,
  resolveSelectedSkillId,
  type SkillCatalogFilterState,
} from "@/lib/skills/catalog-view"
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

function filters(overrides: Partial<SkillCatalogFilterState> = {}): SkillCatalogFilterState {
  return {
    query: overrides.query || "",
    sourceFilters: overrides.sourceFilters || [],
    statusFilters: overrides.statusFilters || [],
    groupFilter: overrides.groupFilter ?? null,
    sort: overrides.sort || "name_asc",
  }
}

test("classifyCatalogGroup mirrors group semantics", () => {
  assert.equal(classifyCatalogGroup(entry({ source: "system", isSystem: true })), "system")
  assert.equal(classifyCatalogGroup(entry({ source: "custom_github" })), "custom")
  assert.equal(classifyCatalogGroup(entry({ source: "local" })), "custom")
  assert.equal(classifyCatalogGroup(entry({ source: "curated", isInstalled: true })), "installed")
  assert.equal(classifyCatalogGroup(entry({ source: "experimental" })), "experimental")
  assert.equal(classifyCatalogGroup(entry({ source: "curated" })), "curated")
})

test("buildSkillCatalogView filters by search query", () => {
  const entries = [
    entry({ id: "a", name: "Playwright", slug: "playwright" }),
    entry({ id: "b", name: "Spreadsheet", slug: "spreadsheet" }),
  ]

  const view = buildSkillCatalogView({
    entries,
    filters: filters({ query: "play" }),
    selectedSkillId: null,
  })

  assert.deepEqual(view.filteredEntries.map((item) => item.id), ["a"])
  assert.equal(view.selectedSkillId, "a")
})

test("buildSkillCatalogView applies source and status filters as intersecting facets", () => {
  const entries = [
    entry({ id: "a", source: "curated", isInstalled: true }),
    entry({ id: "b", source: "curated", isInstalled: false }),
    entry({ id: "c", source: "custom_github", isInstalled: true }),
  ]

  const view = buildSkillCatalogView({
    entries,
    filters: filters({
      sourceFilters: ["curated"],
      statusFilters: ["installed"],
    }),
    selectedSkillId: null,
  })

  assert.deepEqual(view.filteredEntries.map((item) => item.id), ["a"])
})

test("buildSkillCatalogView sorts by source and updated timestamp", () => {
  const entries = [
    entry({ id: "a", source: "system", name: "A", updatedAt: "2026-02-11T01:00:00.000Z", isSystem: true }),
    entry({ id: "b", source: "curated", name: "B", updatedAt: "2026-02-11T03:00:00.000Z" }),
    entry({ id: "c", source: "experimental", name: "C", updatedAt: "2026-02-11T02:00:00.000Z" }),
  ]

  const bySource = buildSkillCatalogView({
    entries,
    filters: filters({ sort: "source" }),
    selectedSkillId: null,
  })
  assert.deepEqual(bySource.filteredEntries.map((item) => item.id), ["b", "c", "a"])

  const byUpdated = buildSkillCatalogView({
    entries,
    filters: filters({ sort: "updated_desc" }),
    selectedSkillId: null,
  })
  assert.deepEqual(byUpdated.filteredEntries.map((item) => item.id), ["b", "c", "a"])
})

test("group filter narrows entries to selected map group", () => {
  const entries = [
    entry({ id: "a", source: "curated", isInstalled: true }),
    entry({ id: "b", source: "curated", isInstalled: false }),
    entry({ id: "c", source: "custom_github", isInstalled: true }),
  ]

  const installedGroup = buildSkillCatalogView({
    entries,
    filters: filters({ groupFilter: "installed" }),
    selectedSkillId: null,
  })
  assert.deepEqual(installedGroup.filteredEntries.map((item) => item.id), ["a"])
})

test("selection falls back when selected skill is filtered out", () => {
  const entries = [
    entry({ id: "a", name: "A" }),
    entry({ id: "b", name: "B" }),
  ]

  const view = buildSkillCatalogView({
    entries,
    filters: filters({ query: "b" }),
    selectedSkillId: "a",
  })

  assert.equal(view.selectedSkillId, "b")
  assert.equal(view.selectedEntry?.id, "b")
})

test("selection becomes null when no entries match", () => {
  const entries = [entry({ id: "a", name: "A" })]

  const view = buildSkillCatalogView({
    entries,
    filters: filters({ query: "zzz" }),
    selectedSkillId: "a",
  })

  assert.equal(view.filteredEntries.length, 0)
  assert.equal(view.selectedSkillId, null)
  assert.equal(view.selectedEntry, null)
})

test("resolveSelectedSkillId keeps explicit selection when still visible", () => {
  const entries = [entry({ id: "a" }), entry({ id: "b" })]
  assert.equal(resolveSelectedSkillId("b", entries), "b")
  assert.equal(resolveSelectedSkillId("missing", entries), "a")
  assert.equal(resolveSelectedSkillId(null, []), null)
})
