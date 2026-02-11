import test from "node:test"
import assert from "node:assert/strict"
import type { IngestDocument } from "@/lib/knowledge-ingest/contracts"
import { createLlmGraphBuilderProvider, toLlmGraphBuilderFileName } from "./index"

function makeDocument(overrides: Partial<IngestDocument> = {}): IngestDocument {
  return {
    key: "orchwiz:notes/A.md",
    vaultId: "orchwiz",
    relativePath: "notes/A.md",
    absolutePath: "/tmp/A.md",
    content: "# A",
    contentHash: "hash",
    byteSize: 3,
    mtime: new Date().toISOString(),
    ...overrides,
  }
}

function providerEnv(): NodeJS.ProcessEnv {
  return {
    LGB_API_URL: "http://127.0.0.1:8000",
    LGB_NEO4J_URI: "bolt://127.0.0.1:7688",
    LGB_NEO4J_USERNAME: "neo4j",
    LGB_NEO4J_PASSWORD: "secret",
    LGB_NEO4J_DATABASE: "neo4j",
    LGB_MODEL: "openai_gpt_5_mini",
    LGB_EMBEDDING_PROVIDER: "sentence-transformer",
    LGB_EMBEDDING_MODEL: "all-MiniLM-L6-v2",
  }
}

test("llm-graph-builder provider shapes upload/extract form requests", async () => {
  const calls: Array<{ url: string; form: FormData }> = []

  const provider = createLlmGraphBuilderProvider({
    env: providerEnv(),
    fetchFn: async (input, init) => {
      calls.push({
        url: String(input),
        form: init?.body as FormData,
      })
      return new Response(JSON.stringify({ status: "Success", data: {} }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      })
    },
  })

  const document = makeDocument()
  const result = await provider.ingestDocument(document)

  assert.equal(calls.length, 2)
  assert.equal(calls[0]?.url, "http://127.0.0.1:8000/upload")
  assert.equal(calls[1]?.url, "http://127.0.0.1:8000/extract")

  const uploadForm = calls[0]?.form
  assert.equal(uploadForm?.get("uri"), "bolt://127.0.0.1:7688")
  assert.equal(uploadForm?.get("userName"), "neo4j")
  assert.equal(uploadForm?.get("password"), "secret")
  assert.equal(uploadForm?.get("database"), "neo4j")
  assert.equal(uploadForm?.get("chunkNumber"), "1")
  assert.equal(uploadForm?.get("totalChunks"), "1")
  assert.equal(uploadForm?.get("model"), "openai_gpt_5_mini")
  assert.equal(uploadForm?.get("originalname"), result.artifactRef)

  const uploadFile = uploadForm?.get("file")
  assert.ok(uploadFile instanceof Blob)

  const extractForm = calls[1]?.form
  assert.equal(extractForm?.get("source_type"), "local file")
  assert.equal(extractForm?.get("file_name"), result.artifactRef)
  assert.equal(extractForm?.get("embedding_provider"), "sentence-transformer")
  assert.equal(extractForm?.get("embedding_model"), "all-MiniLM-L6-v2")

  const expectedFileName = toLlmGraphBuilderFileName(document.key, document.relativePath)
  assert.equal(result.artifactRef, expectedFileName)
})

test("llm-graph-builder provider normalizes error responses", async () => {
  const provider = createLlmGraphBuilderProvider({
    env: providerEnv(),
    fetchFn: async () => {
      return new Response(JSON.stringify({ status: "Failed", error: "boom" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      })
    },
  })

  await assert.rejects(
    () => provider.ingestDocument(makeDocument()),
    /boom/i,
  )
})

test("llm-graph-builder provider issues delete and post-process requests", async () => {
  const calls: Array<{ url: string; form: FormData }> = []

  const provider = createLlmGraphBuilderProvider({
    env: providerEnv(),
    fetchFn: async (input, init) => {
      calls.push({
        url: String(input),
        form: init?.body as FormData,
      })
      return new Response(JSON.stringify({ status: "Success" }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      })
    },
  })

  await provider.deleteDocuments?.([
    {
      key: "orchwiz:notes/A.md",
      artifactRef: "A__1.md",
      reason: "deleted",
    },
    {
      key: "ship:kb/fleet/F.md",
      artifactRef: "F__2.md",
      reason: "updated",
    },
  ])

  await provider.postProcess?.()

  assert.equal(calls.length, 2)
  assert.equal(calls[0]?.url, "http://127.0.0.1:8000/delete_document_and_entities")
  assert.equal(calls[1]?.url, "http://127.0.0.1:8000/post_processing")

  const deleteForm = calls[0]?.form
  assert.equal(deleteForm?.get("deleteEntities"), "true")
  const filenamesRaw = String(deleteForm?.get("filenames") || "[]")
  const sourceTypesRaw = String(deleteForm?.get("source_types") || "[]")
  assert.deepEqual(JSON.parse(filenamesRaw), ["A__1.md", "F__2.md"])
  assert.deepEqual(JSON.parse(sourceTypesRaw), ["local file", "local file"])

  const postForm = calls[1]?.form
  const tasksRaw = String(postForm?.get("tasks") || "[]")
  assert.deepEqual(JSON.parse(tasksRaw), ["enable_hybrid_search_and_fulltext_search_in_bloom"])
})
