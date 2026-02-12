import assert from "node:assert/strict"
import test from "node:test"
import {
  buildToolSourceKey,
  choosePreferredToolEntryBySlug,
  isToolCatalogStale,
} from "@/lib/tools/catalog"
import { findCuratedToolBySlug } from "@/lib/tools/curated-tools"

function withEnv<T>(patch: Record<string, string | undefined>, run: () => T): T {
  const previous: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(patch)) {
    previous[key] = process.env[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  try {
    return run()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

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

test("n8n curated tool surfaces env-driven unavailable warning when N8N_TOOL_URI is missing", () => {
  withEnv({ N8N_TOOL_URI: undefined }, () => {
    const curated = findCuratedToolBySlug("n8n")
    assert.ok(curated)
    assert.equal(curated?.available, false)
    assert.match(curated?.unavailableReason || "", /N8N_TOOL_URI/)
  })
})

test("n8n curated tool resolves env-driven GitHub URI when N8N_TOOL_URI is set", () => {
  withEnv({ N8N_TOOL_URI: "example/n8n-tool" }, () => {
    const curated = findCuratedToolBySlug("n8n")
    assert.ok(curated)
    assert.equal(curated?.available, true)
    assert.equal(curated?.repo, "example/n8n-tool")
    assert.equal(curated?.sourceRef, "main")
    assert.equal(curated?.sourcePath, ".")
  })
})
