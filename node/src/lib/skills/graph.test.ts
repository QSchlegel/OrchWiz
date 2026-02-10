import assert from "node:assert/strict"
import test from "node:test"
import { buildSkillGraph } from "@/lib/skills/graph"
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
    metadata: overrides.metadata ?? null,
    ownerUserId: overrides.ownerUserId || "user-1",
    lastSyncedAt: overrides.lastSyncedAt || new Date().toISOString(),
    createdAt: overrides.createdAt || new Date().toISOString(),
    updatedAt: overrides.updatedAt || new Date().toISOString(),
  }
}

test("buildSkillGraph groups skills by source/status buckets", () => {
  const graph = buildSkillGraph([
    entry({ id: "curated-installed", source: "curated", isInstalled: true }),
    entry({ id: "curated-available", source: "curated", isInstalled: false }),
    entry({ id: "experimental", source: "experimental", isInstalled: false }),
    entry({ id: "custom", source: "custom_github", isInstalled: true }),
    entry({ id: "system", source: "system", isSystem: true, isInstalled: true }),
  ])

  assert.equal(graph.groups.length, 5)
  assert.equal(graph.stats.totalSkills, 5)
  assert.equal(graph.edges.length, 5)
  assert.equal(graph.stats.groupedCounts.installed, 1)
  assert.equal(graph.stats.groupedCounts.curated, 1)
  assert.equal(graph.stats.groupedCounts.experimental, 1)
  assert.equal(graph.stats.groupedCounts.custom, 1)
  assert.equal(graph.stats.groupedCounts.system, 1)
})
