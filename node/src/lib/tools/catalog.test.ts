import assert from "node:assert/strict"
import test from "node:test"
import {
  buildToolSourceKey,
  choosePreferredToolEntryBySlug,
  isToolCatalogStale,
} from "@/lib/tools/catalog"

test("buildToolSourceKey is deterministic for curated source tuples", () => {
  const keyA = buildToolSourceKey({
    source: "curated",
    slug: "camoufox",
    repo: "daijro/camoufox",
    sourcePath: ".",
    sourceRef: "main",
  })

  const keyB = buildToolSourceKey({
    source: "curated",
    slug: "CAMOUFOX",
    repo: "DAIJRO/CAMOUFOX",
    sourcePath: ".",
    sourceRef: "MAIN",
  })

  assert.equal(keyA, keyB)
})

test("choosePreferredToolEntryBySlug favors imported/custom over curated/local/system", () => {
  const preferred = choosePreferredToolEntryBySlug([
    { id: "system", slug: "camoufox", source: "system" },
    { id: "local", slug: "camoufox", source: "local" },
    { id: "curated", slug: "camoufox", source: "curated" },
    { id: "custom", slug: "camoufox", source: "custom_github" },
  ])

  assert.equal(preferred.get("camoufox")?.id, "custom")
})

test("isToolCatalogStale evaluates by staleness window", () => {
  const now = new Date("2026-02-11T10:00:00.000Z")
  const old = new Date("2026-02-11T09:30:00.000Z")
  const fresh = new Date("2026-02-11T09:55:00.000Z")

  assert.equal(isToolCatalogStale(null, now), true)
  assert.equal(isToolCatalogStale(old, now), true)
  assert.equal(isToolCatalogStale(fresh, now), false)
})
