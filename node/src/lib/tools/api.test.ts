import assert from "node:assert/strict"
import test from "node:test"
import { AccessControlError } from "@/lib/security/access-control"
import {
  handleGetToolImportRuns,
  handleGetToolsCatalog,
  handlePostToolImport,
  type ToolApiDependencies,
} from "@/lib/tools/api"
import type { ToolCatalogResponse, ToolImportRunDto } from "@/lib/tools/types"

const actor = {
  userId: "user-1",
  email: "captain@example.com",
  role: "captain" as const,
  isAdmin: false,
}

function sampleRun(overrides: Partial<ToolImportRunDto> = {}): ToolImportRunDto {
  const now = new Date().toISOString()
  return {
    id: overrides.id || "run-1",
    ownerUserId: overrides.ownerUserId || "user-1",
    catalogEntryId: overrides.catalogEntryId ?? null,
    mode: overrides.mode || "curated",
    source: overrides.source || "curated",
    toolSlug: overrides.toolSlug ?? "camoufox",
    repo: overrides.repo ?? "daijro/camoufox",
    sourcePath: overrides.sourcePath ?? ".",
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

function baseDependencies(overrides: Partial<ToolApiDependencies> = {}): ToolApiDependencies {
  const catalog: ToolCatalogResponse = {
    entries: [],
    refresh: {
      refreshMode: "auto",
      refreshed: false,
      stale: false,
      lastSyncedAt: null,
      warnings: [],
    },
  }

  return {
    requireActor: async () => actor,
    getToolCatalogForUser: async () => catalog,
    importCuratedToolForUser: async () => ({
      run: sampleRun({ status: "succeeded" }),
      entry: null,
    }),
    importGithubUrlToolForUser: async () => ({
      run: sampleRun({ status: "succeeded", mode: "github_url", source: "custom_github" }),
      entry: null,
    }),
    listToolImportRunsForUser: async () => [sampleRun()],
    ...overrides,
  }
}

test("handleGetToolsCatalog returns 401 when actor is unauthorized", async () => {
  const result = await handleGetToolsCatalog(
    { refresh: "auto" },
    baseDependencies({
      requireActor: async () => {
        throw new AccessControlError("Unauthorized", 401, "UNAUTHORIZED")
      },
    }),
  )

  assert.equal(result.status, 401)
})

test("handleGetToolsCatalog returns owner-scoped payload", async () => {
  let receivedOwnerUserId = ""
  let receivedRefreshMode = ""

  const result = await handleGetToolsCatalog(
    { refresh: "force" },
    baseDependencies({
      getToolCatalogForUser: async ({ ownerUserId, refreshMode }) => {
        receivedOwnerUserId = ownerUserId
        receivedRefreshMode = refreshMode
        return {
          entries: [],
          refresh: {
            refreshMode,
            refreshed: true,
            stale: false,
            lastSyncedAt: new Date().toISOString(),
            warnings: [],
          },
        }
      },
    }),
  )

  assert.equal(result.status, 200)
  assert.equal(receivedOwnerUserId, "user-1")
  assert.equal(receivedRefreshMode, "force")
})

test("handleGetToolsCatalog returns 503 when schema is unavailable", async () => {
  const result = await handleGetToolsCatalog(
    { refresh: "auto" },
    baseDependencies({
      getToolCatalogForUser: async () => {
        throw { code: "P2022" }
      },
    }),
  )

  assert.equal(result.status, 503)
  assert.equal(result.body.code, "SCHEMA_UNAVAILABLE")
  assert.equal(String(result.body.error).includes("npm run db:migrate"), true)
})

test("handlePostToolImport succeeds for curated mode", async () => {
  const result = await handlePostToolImport(
    {
      body: {
        mode: "curated",
        toolSlug: "camoufox",
      },
    },
    baseDependencies(),
  )

  assert.equal(result.status, 200)
})

test("handlePostToolImport rejects invalid github URL", async () => {
  const result = await handlePostToolImport(
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

test("handlePostToolImport rejects unknown mode", async () => {
  const result = await handlePostToolImport(
    {
      body: {
        mode: "archive",
      },
    },
    baseDependencies(),
  )

  assert.equal(result.status, 400)
})

test("handlePostToolImport returns 502 when import run fails", async () => {
  const result = await handlePostToolImport(
    {
      body: {
        mode: "curated",
        toolSlug: "camoufox",
      },
    },
    baseDependencies({
      importCuratedToolForUser: async () => ({
        run: sampleRun({
          status: "failed",
          exitCode: 1,
          stderr: "[REDACTED_TOKEN]",
          errorMessage: "Tool install failed.",
        }),
        entry: null,
      }),
    }),
  )

  assert.equal(result.status, 502)
})

test("handleGetToolImportRuns enforces owner scope and limit", async () => {
  let receivedOwnerUserId = ""
  let receivedLimit = 0

  const result = await handleGetToolImportRuns(
    {
      limit: "250",
    },
    baseDependencies({
      listToolImportRunsForUser: async ({ ownerUserId, limit }) => {
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
