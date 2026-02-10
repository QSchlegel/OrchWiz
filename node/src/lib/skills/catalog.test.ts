import assert from "node:assert/strict"
import test from "node:test"
import { buildSkillSourceKey, isSkillCatalogStale, parseSkillFrontmatter } from "@/lib/skills/catalog"

test("buildSkillSourceKey is deterministic for curated source tuples", () => {
  const keyA = buildSkillSourceKey({
    source: "curated",
    slug: "playwright",
    repo: "openai/skills",
    sourcePath: "skills/.curated/playwright",
    sourceRef: "main",
  })

  const keyB = buildSkillSourceKey({
    source: "curated",
    slug: "PLAYWRIGHT",
    repo: "OPENAI/SKILLS",
    sourcePath: "skills/.curated/playwright",
    sourceRef: "MAIN",
  })

  assert.equal(keyA, keyB)
})

test("parseSkillFrontmatter extracts name and description", () => {
  const parsed = parseSkillFrontmatter([
    "---",
    'name: "skill-installer"',
    "description: Install curated skills",
    "---",
    "",
    "# Skill Installer",
  ].join("\n"))

  assert.equal(parsed.name, "skill-installer")
  assert.equal(parsed.description, "Install curated skills")
})

test("isSkillCatalogStale evaluates by staleness window", () => {
  const now = new Date("2026-02-10T10:00:00.000Z")
  const old = new Date("2026-02-10T09:30:00.000Z")
  const fresh = new Date("2026-02-10T09:55:00.000Z")

  assert.equal(isSkillCatalogStale(null, now), true)
  assert.equal(isSkillCatalogStale(old, now), true)
  assert.equal(isSkillCatalogStale(fresh, now), false)
})
