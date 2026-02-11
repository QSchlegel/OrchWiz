import test from "node:test"
import assert from "node:assert/strict"
import {
  assertKnowledgeIngestProvider,
  type IngestDocument,
  type IngestDeleteRequest,
  type KnowledgeIngestProvider,
} from "./contracts"

function sampleDocument(): IngestDocument {
  return {
    key: "orchwiz:notes/A.md",
    vaultId: "orchwiz",
    relativePath: "notes/A.md",
    absolutePath: "/tmp/notes/A.md",
    content: "# A",
    contentHash: "hash",
    byteSize: 3,
    mtime: new Date().toISOString(),
  }
}

test("assertKnowledgeIngestProvider accepts valid provider contract", async () => {
  const provider: KnowledgeIngestProvider = {
    config: {
      id: "stub",
      version: "1",
    },
    capabilities: {
      supportsDelete: true,
      supportsPostProcess: true,
    },
    ingestDocument: async () => ({
      artifactRef: "a.md",
    }),
    deleteDocuments: async (_documents: IngestDeleteRequest[]) => {},
    postProcess: async () => {},
  }

  assert.doesNotThrow(() => assertKnowledgeIngestProvider(provider))
  const result = await provider.ingestDocument(sampleDocument())
  assert.equal(result.artifactRef, "a.md")
})

test("assertKnowledgeIngestProvider rejects missing required methods for declared capabilities", () => {
  const provider = {
    config: {
      id: "broken",
      version: "1",
    },
    capabilities: {
      supportsDelete: true,
      supportsPostProcess: true,
    },
    ingestDocument: async () => ({ artifactRef: "x" }),
  } as unknown as KnowledgeIngestProvider

  assert.throws(
    () => assertKnowledgeIngestProvider(provider),
    /delete support but does not implement deleteDocuments/i,
  )
})
