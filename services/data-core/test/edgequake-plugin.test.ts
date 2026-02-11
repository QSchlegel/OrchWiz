import assert from "node:assert/strict"
import test from "node:test"
import type { DataCoreConfig } from "../src/config.js"
import type { DataCoreDb } from "../src/db.js"
import { EdgeQuakePlugin, computeRetryBackoffMs, edgeQuakeWorkspaceSlug, isStaleSyncJob, mapEdgeQuakeSources } from "../src/plugins/edgequake.js"

function makeConfig(maxRetries = 3): DataCoreConfig {
  return {
    host: "127.0.0.1",
    port: 3390,
    databaseUrl: "postgresql://example.invalid/data-core",
    apiKey: null,
    syncSharedSecret: null,
    coreId: "core-test",
    role: "ship",
    clusterId: "local",
    shipDeploymentId: null,
    fleetHubUrl: null,
    autoMigrate: false,
    maxSyncBatch: 200,
    queryCandidateLimit: 500,
    queryTopKDefault: 12,
    enableMergeWorker: true,
    edgequake: {
      enabled: true,
      baseUrl: "http://127.0.0.1:8011",
      apiKey: null,
      bearerToken: null,
      timeoutMs: 6000,
      tenantId: "00000000-0000-0000-0000-000000000002",
      maxRetries,
      drainBatch: 25,
      drainIntervalMs: 15000,
    },
  }
}

function createDbSpy(): {
  db: DataCoreDb
  calls: Array<{ sql: string; params: unknown[] }>
} {
  const calls: Array<{ sql: string; params: unknown[] }> = []
  const db = {
    query: async <T = unknown>(sql: string, params: unknown[] = []) => {
      calls.push({ sql, params })
      return { rows: [] as T[] }
    },
  } as DataCoreDb
  return { db, calls }
}

test("edgeQuakeWorkspaceSlug derives deterministic cluster+domain slug", () => {
  const slug = edgeQuakeWorkspaceSlug({
    clusterId: "Local Cluster_01",
    domain: "agent-public",
  })
  assert.equal(slug, "data-core-local-cluster-01-agent-public")
})

test("mapEdgeQuakeSources maps source document ids to canonical citations", () => {
  const results = mapEdgeQuakeSources({
    query: "deployments",
    k: 10,
    sources: [
      {
        source_type: "chunk",
        document_id: "doc-a",
        snippet: "Ship deployment runbook",
        score: 0.92,
      },
      {
        source_type: "chunk",
        document_id: "doc-b",
        snippet: "Fleet policy guidance",
        rerank_score: 0.88,
        score: 0.5,
      },
    ],
    mappings: [
      {
        domain: "ship",
        canonicalPath: "ship/fleet/runbook.md",
        documentId: "doc-a",
      },
      {
        domain: "ship",
        canonicalPath: "ship/fleet/policy.md",
        documentId: "doc-b",
      },
    ],
  })

  assert.equal(results.length, 2)
  assert.equal(results[0]?.canonicalPath, "ship/fleet/runbook.md")
  assert.equal(results[0]?.citations[0]?.canonicalPath, "ship/fleet/runbook.md")
  assert.equal(results[1]?.score, 0.88)
})

test("mapEdgeQuakeSources applies canonical path prefix filter", () => {
  const results = mapEdgeQuakeSources({
    query: "ship",
    k: 10,
    prefix: "ship/fleet/",
    sources: [
      {
        document_id: "doc-fleet",
        snippet: "fleet note",
        score: 0.9,
      },
      {
        document_id: "doc-ship",
        snippet: "ship note",
        score: 0.8,
      },
    ],
    mappings: [
      {
        domain: "ship",
        canonicalPath: "ship/fleet/a.md",
        documentId: "doc-fleet",
      },
      {
        domain: "ship",
        canonicalPath: "ship/ship-123/b.md",
        documentId: "doc-ship",
      },
    ],
  })

  assert.equal(results.length, 1)
  assert.equal(results[0]?.canonicalPath, "ship/fleet/a.md")
})

test("isStaleSyncJob rejects non-latest event ids", () => {
  assert.equal(isStaleSyncJob({
    operation: "upsert",
    eventId: "evt-1",
    latestEventId: "evt-2",
  }), true)

  assert.equal(isStaleSyncJob({
    operation: "delete",
    eventId: "evt-1",
    latestEventId: null,
  }), false)

  assert.equal(isStaleSyncJob({
    operation: "move",
    eventId: "evt-1",
    latestEventId: null,
  }), true)
})

test("computeRetryBackoffMs grows exponentially and caps", () => {
  assert.equal(computeRetryBackoffMs(1), 2000)
  assert.equal(computeRetryBackoffMs(2), 4000)
  assert.equal(computeRetryBackoffMs(10), 1024000)
  assert.equal(computeRetryBackoffMs(20), 1024000)
})

test("EdgeQuake retry transitions to retrying before max retries", async () => {
  const { db, calls } = createDbSpy()
  const plugin = new EdgeQuakePlugin(db, makeConfig(3))
  const now = Date.now()

  const state = await (plugin as unknown as {
    failOrRetryJob(input: {
      job: {
        id: string
        event_id: string
        operation: "upsert" | "delete" | "move" | "merge"
        domain: string
        canonical_path: string
        from_canonical_path: string | null
        content_markdown: string | null
        attempt_count: number
      }
      errorMessage: string
    }): Promise<"retrying" | "failed">
  }).failOrRetryJob({
    job: {
      id: "job-1",
      event_id: "evt-1",
      operation: "upsert",
      domain: "ship",
      canonical_path: "ship/docs/a.md",
      from_canonical_path: null,
      content_markdown: null,
      attempt_count: 0,
    },
    errorMessage: "transient",
  })

  assert.equal(state, "retrying")
  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.params[1], "retrying")
  assert.equal(calls[0]?.params[2], 1)
  assert.ok(typeof calls[0]?.params[3] === "string")
  assert.ok(new Date(String(calls[0]?.params[3])).getTime() > now)
})

test("EdgeQuake retry reaches terminal failed state at max retries", async () => {
  const { db, calls } = createDbSpy()
  const plugin = new EdgeQuakePlugin(db, makeConfig(1))
  const now = Date.now()

  const state = await (plugin as unknown as {
    failOrRetryJob(input: {
      job: {
        id: string
        event_id: string
        operation: "upsert" | "delete" | "move" | "merge"
        domain: string
        canonical_path: string
        from_canonical_path: string | null
        content_markdown: string | null
        attempt_count: number
      }
      errorMessage: string
    }): Promise<"retrying" | "failed">
  }).failOrRetryJob({
    job: {
      id: "job-2",
      event_id: "evt-2",
      operation: "upsert",
      domain: "ship",
      canonical_path: "ship/docs/b.md",
      from_canonical_path: null,
      content_markdown: null,
      attempt_count: 0,
    },
    errorMessage: "permanent",
  })

  assert.equal(state, "failed")
  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.params[1], "failed")
  assert.equal(calls[0]?.params[2], 1)
  assert.ok(typeof calls[0]?.params[3] === "string")
  assert.ok(new Date(String(calls[0]?.params[3])).getTime() <= now + 1000)
})
