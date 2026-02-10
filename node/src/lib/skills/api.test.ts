import assert from "node:assert/strict"
import test from "node:test"
import { AccessControlError } from "@/lib/security/access-control"
import {
  handleGetSkillImportRuns,
  handleGetSkillsCatalog,
  handlePostSkillImport,
  type SkillApiDependencies,
} from "@/lib/skills/api"
import type { SkillCatalogResponse, SkillImportRunDto } from "@/lib/skills/types"

const actor = {
  userId: "user-1",
  email: "user@example.com",
  role: "captain" as const,
  isAdmin: false,
}

function sampleRun(overrides: Partial<SkillImportRunDto> = {}): SkillImportRunDto {
  const now = new Date().toISOString()
  return {
    id: overrides.id || "run-1",
    ownerUserId: overrides.ownerUserId || "user-1",
    catalogEntryId: overrides.catalogEntryId ?? null,
    mode: overrides.mode || "curated",
    source: overrides.source || "curated",
    skillSlug: overrides.skillSlug ?? "playwright",
    repo: overrides.repo ?? "openai/skills",
    sourcePath: overrides.sourcePath ?? "skills/.curated/playwright",
    sourceRef: overrides.sourceRef ?? "main",
    sourceUrl: overrides.sourceUrl ?? null,
    status: overrides.status || "succeeded",
    exitCode: overrides.exitCode ?? 0,
    stdout: overrides.stdout ?? "ok",
    stderr: overrides.stderr ?? "",
    errorMessage: overrides.errorMessage ?? null,
    startedAt: overrides.startedAt || now,
    completedAt: overrides.completedAt ?? now,
    createdAt: overrides.createdAt || now,
    updatedAt: overrides.updatedAt || now,
  }
}

function baseDependencies(overrides: Partial<SkillApiDependencies> = {}): SkillApiDependencies {
  const catalog: SkillCatalogResponse = {
    entries: [],
    graph: {
      groups: [],
      nodes: [],
      edges: [],
      stats: {
        totalSkills: 0,
        installedCount: 0,
        systemCount: 0,
        groupedCounts: {
          installed: 0,
          curated: 0,
          experimental: 0,
          custom: 0,
          system: 0,
        },
      },
    },
    refresh: {
      refreshMode: "auto",
      refreshed: false,
      stale: false,
      lastSyncedAt: null,
      warnings: [],
      experimentalStatus: {
        state: "not_checked",
        checkedAt: null,
        error: null,
      },
    },
  }

  return {
    requireActor: async () => actor,
    getSkillCatalogForUser: async () => catalog,
    importCuratedSkillForUser: async () => ({
      run: sampleRun({ status: "succeeded" }),
      entry: null,
    }),
    importGithubUrlSkillForUser: async () => ({
      run: sampleRun({ status: "succeeded", mode: "github_url", source: "custom_github" }),
      entry: null,
    }),
    listSkillImportRunsForUser: async () => [sampleRun()],
    publishNotificationUpdated: () => null,
    ...overrides,
  }
}

test("handleGetSkillsCatalog returns 401 when actor is unauthorized", async () => {
  const result = await handleGetSkillsCatalog(
    { refresh: "auto" },
    baseDependencies({
      requireActor: async () => {
        throw new AccessControlError("Unauthorized", 401, "UNAUTHORIZED")
      },
    }),
  )

  assert.equal(result.status, 401)
})

test("handleGetSkillsCatalog returns owner-scoped payload", async () => {
  let receivedUserId = ""
  const result = await handleGetSkillsCatalog(
    { refresh: "force" },
    baseDependencies({
      getSkillCatalogForUser: async ({ ownerUserId }) => {
        receivedUserId = ownerUserId
        return {
          entries: [],
          graph: {
            groups: [],
            nodes: [],
            edges: [],
            stats: {
              totalSkills: 0,
              installedCount: 0,
              systemCount: 0,
              groupedCounts: {
                installed: 0,
                curated: 0,
                experimental: 0,
                custom: 0,
                system: 0,
              },
            },
          },
          refresh: {
            refreshMode: "force",
            refreshed: true,
            stale: false,
            lastSyncedAt: new Date().toISOString(),
            warnings: [],
            experimentalStatus: {
              state: "available",
              checkedAt: new Date().toISOString(),
              error: null,
            },
          },
        }
      },
    }),
  )

  assert.equal(result.status, 200)
  assert.equal(receivedUserId, "user-1")
})

test("handlePostSkillImport succeeds for curated mode", async () => {
  const result = await handlePostSkillImport(
    {
      body: {
        mode: "curated",
        skillSlug: "playwright",
      },
    },
    baseDependencies(),
  )

  assert.equal(result.status, 200)
})

test("handlePostSkillImport rejects invalid github URL", async () => {
  const result = await handlePostSkillImport(
    {
      body: {
        mode: "github_url",
        githubUrl: "https://example.com/foo",
      },
    },
    baseDependencies(),
  )

  assert.equal(result.status, 400)
})

test("handlePostSkillImport returns 502 when import run fails", async () => {
  const result = await handlePostSkillImport(
    {
      body: {
        mode: "curated",
        skillSlug: "playwright",
      },
    },
    baseDependencies({
      importCuratedSkillForUser: async () => ({
        run: sampleRun({
          status: "failed",
          exitCode: 1,
          stderr: "[REDACTED_TOKEN]",
          errorMessage: "Skill install failed.",
        }),
        entry: null,
      }),
    }),
  )

  assert.equal(result.status, 502)
})

test("handleGetSkillImportRuns enforces owner scope and limit", async () => {
  let receivedOwnerUserId = ""
  let receivedLimit = 0

  const result = await handleGetSkillImportRuns(
    {
      limit: "200",
    },
    baseDependencies({
      listSkillImportRunsForUser: async ({ ownerUserId, limit }) => {
        receivedOwnerUserId = ownerUserId
        receivedLimit = limit
        return [sampleRun()]
      },
    }),
  )

  assert.equal(result.status, 200)
  assert.equal(receivedOwnerUserId, "user-1")
  assert.equal(receivedLimit, 100)
})
