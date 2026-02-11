import assert from "node:assert/strict"
import test from "node:test"
import type { DataCoreConfig } from "../src/config.js"
import type { DataCoreDb } from "../src/db.js"
import { MemoryStore } from "../src/memory-store.js"
import type { DataCorePlugin, DataCoreQueryResult } from "../src/plugins/types.js"

function makeConfig(): DataCoreConfig {
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
      maxRetries: 12,
      drainBatch: 25,
      drainIntervalMs: 15000,
    },
  }
}

function createNoDb(): DataCoreDb {
  return {
    query: async () => {
      throw new Error("db.query should not be called in plugin query routing tests")
    },
    transaction: async () => {
      throw new Error("db.transaction should not be called in plugin query routing tests")
    },
  } as unknown as DataCoreDb
}

function result(path: string, score = 0.9): DataCoreQueryResult {
  return {
    domain: "ship",
    canonicalPath: path,
    title: "Result",
    excerpt: "snippet",
    score,
    citations: [
      {
        id: "S1",
        canonicalPath: path,
        excerpt: "snippet",
        score,
        lexicalScore: score,
        semanticScore: score,
      },
    ],
  }
}

function pluginFrom(queryHybrid: DataCorePlugin["queryHybrid"]): DataCorePlugin {
  return {
    enqueueWriteSync: async () => {},
    drainPending: async () => ({ processed: 0, succeeded: 0, failed: 0, skipped: 0 }),
    queryHybrid,
  }
}

test("hybrid query returns plugin results when plugin succeeds", async () => {
  let pluginCalls = 0
  let localCalls = 0
  let receivedArgs: { query: string; domain?: string; prefix?: string; k: number } | null = null

  const plugin = pluginFrom(async (args) => {
    pluginCalls += 1
    receivedArgs = args
    return {
      mode: "hybrid",
      fallbackUsed: false,
      results: [result("ship/docs/plugin-hit.md", 0.97)],
    }
  })

  const store = new MemoryStore(createNoDb(), makeConfig(), plugin)
  ;(store as unknown as {
    queryLocal(args: unknown): Promise<{ mode: "hybrid" | "lexical"; fallbackUsed: boolean; results: DataCoreQueryResult[] }>
  }).queryLocal = async () => {
    localCalls += 1
    return {
      mode: "hybrid",
      fallbackUsed: false,
      results: [result("ship/docs/local-hit.md", 0.4)],
    }
  }

  const response = await store.query({
    query: "  fleet policy  ",
    mode: "hybrid",
    domain: "ship",
    prefix: "ship/docs/",
    k: 4,
  })

  assert.equal(pluginCalls, 1)
  assert.equal(localCalls, 0)
  assert.deepEqual(receivedArgs, {
    query: "fleet policy",
    domain: "ship",
    prefix: "ship/docs/",
    k: 4,
  })
  assert.equal(response.fallbackUsed, false)
  assert.equal(response.results[0]?.canonicalPath, "ship/docs/plugin-hit.md")
})

test("hybrid query fail-open fallback is used on plugin error", async () => {
  let localCalls = 0

  const plugin = pluginFrom(async () => {
    throw new Error("edgequake unavailable")
  })

  const store = new MemoryStore(createNoDb(), makeConfig(), plugin)
  ;(store as unknown as {
    queryLocal(args: { mode: "hybrid" | "lexical" }): Promise<{ mode: "hybrid" | "lexical"; fallbackUsed: boolean; results: DataCoreQueryResult[] }>
  }).queryLocal = async (args) => {
    localCalls += 1
    return {
      mode: args.mode,
      fallbackUsed: false,
      results: [result("ship/docs/local-fallback.md", 0.73)],
    }
  }

  const originalConsoleError = console.error
  console.error = () => {}

  let response: Awaited<ReturnType<MemoryStore["query"]>>
  try {
    response = await store.query({
      query: "sync",
      mode: "hybrid",
      domain: "ship",
    })
  } finally {
    console.error = originalConsoleError
  }

  assert.equal(localCalls, 1)
  assert.equal(response.fallbackUsed, true)
  assert.equal(response.results[0]?.canonicalPath, "ship/docs/local-fallback.md")
})

test("hybrid query fallback is used when plugin returns empty result set", async () => {
  let localCalls = 0

  const plugin = pluginFrom(async () => ({
    mode: "hybrid",
    fallbackUsed: false,
    results: [],
  }))

  const store = new MemoryStore(createNoDb(), makeConfig(), plugin)
  ;(store as unknown as {
    queryLocal(args: { mode: "hybrid" | "lexical" }): Promise<{ mode: "hybrid" | "lexical"; fallbackUsed: boolean; results: DataCoreQueryResult[] }>
  }).queryLocal = async (args) => {
    localCalls += 1
    return {
      mode: args.mode,
      fallbackUsed: false,
      results: [result("ship/docs/local-empty-fallback.md", 0.66)],
    }
  }

  const response = await store.query({
    query: "deployment",
    mode: "hybrid",
    domain: "ship",
  })

  assert.equal(localCalls, 1)
  assert.equal(response.fallbackUsed, true)
  assert.equal(response.results[0]?.canonicalPath, "ship/docs/local-empty-fallback.md")
})

test("hybrid query fallback is used when plugin results have no mapped citations", async () => {
  let localCalls = 0

  const plugin = pluginFrom(async () => ({
    mode: "hybrid",
    fallbackUsed: false,
    results: [
      {
        domain: "ship",
        canonicalPath: "ship/docs/unmapped.md",
        title: "Unmapped",
        excerpt: "unmapped",
        score: 0.9,
        citations: [],
      },
    ],
  }))

  const store = new MemoryStore(createNoDb(), makeConfig(), plugin)
  ;(store as unknown as {
    queryLocal(args: { mode: "hybrid" | "lexical" }): Promise<{ mode: "hybrid" | "lexical"; fallbackUsed: boolean; results: DataCoreQueryResult[] }>
  }).queryLocal = async (args) => {
    localCalls += 1
    return {
      mode: args.mode,
      fallbackUsed: false,
      results: [result("ship/docs/local-mapped-fallback.md", 0.62)],
    }
  }

  const response = await store.query({
    query: "fallback",
    mode: "hybrid",
    domain: "ship",
  })

  assert.equal(localCalls, 1)
  assert.equal(response.fallbackUsed, true)
  assert.equal(response.results[0]?.canonicalPath, "ship/docs/local-mapped-fallback.md")
})

test("lexical mode remains local-only even when plugin is configured", async () => {
  let pluginCalls = 0
  let localCalls = 0

  const plugin = pluginFrom(async () => {
    pluginCalls += 1
    return {
      mode: "hybrid",
      fallbackUsed: false,
      results: [result("ship/docs/plugin-should-not-run.md", 0.99)],
    }
  })

  const store = new MemoryStore(createNoDb(), makeConfig(), plugin)
  ;(store as unknown as {
    queryLocal(args: { mode: "hybrid" | "lexical" }): Promise<{ mode: "hybrid" | "lexical"; fallbackUsed: boolean; results: DataCoreQueryResult[] }>
  }).queryLocal = async (args) => {
    localCalls += 1
    return {
      mode: args.mode,
      fallbackUsed: false,
      results: [result("ship/docs/lexical-local.md", 0.55)],
    }
  }

  const response = await store.query({
    query: "local lexical",
    mode: "lexical",
    domain: "ship",
  })

  assert.equal(pluginCalls, 0)
  assert.equal(localCalls, 1)
  assert.equal(response.mode, "lexical")
  assert.equal(response.fallbackUsed, false)
  assert.equal(response.results[0]?.canonicalPath, "ship/docs/lexical-local.md")
})
