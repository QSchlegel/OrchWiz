import test from "node:test"
import assert from "node:assert/strict"
import {
  chunkMarkdownForRag,
  classifyVaultRagScope,
  rankVaultRagCandidate,
} from "./rag"

test("classifyVaultRagScope identifies ship, fleet, and global scopes", () => {
  assert.deepEqual(classifyVaultRagScope("ship/kb/ships/ship-123/notes/startup.md"), {
    scopeType: "ship",
    shipDeploymentId: "ship-123",
  })
  assert.deepEqual(classifyVaultRagScope("ship/kb/fleet/intel.md"), {
    scopeType: "fleet",
    shipDeploymentId: null,
  })
  assert.deepEqual(classifyVaultRagScope("orchwiz/03-Technical/API-Documentation.md"), {
    scopeType: "global",
    shipDeploymentId: null,
  })
})

test("chunkMarkdownForRag is deterministic for same markdown input", () => {
  const markdown = `# Readiness\n\nRun diagnostics and verify comms.\n\n## Follow-up\n\nLog issues.`
  const first = chunkMarkdownForRag(markdown)
  const second = chunkMarkdownForRag(markdown)

  assert.deepEqual(first, second)
  assert.ok(first.length >= 2)
})

test("rankVaultRagCandidate favors lexical+semantic matches and ship scope boost", () => {
  const boosted = rankVaultRagCandidate({
    queryTokens: ["engine", "status"],
    queryLower: "engine status",
    queryEmbedding: [1, 0],
    mode: "hybrid",
    chunkPath: "ship/kb/ships/ship-123/engine.md",
    chunkTitle: "Engine Status",
    chunkNormalizedContent: "engine status diagnostics healthy",
    chunkEmbedding: [1, 0],
    chunkScopeType: "ship",
    chunkShipDeploymentId: "ship-123",
    requestedShipDeploymentId: "ship-123",
  })

  const weaker = rankVaultRagCandidate({
    queryTokens: ["engine", "status"],
    queryLower: "engine status",
    queryEmbedding: [1, 0],
    mode: "hybrid",
    chunkPath: "orchwiz/notes/random.md",
    chunkTitle: "Unrelated",
    chunkNormalizedContent: "random planning notes",
    chunkEmbedding: [0, 1],
    chunkScopeType: "global",
    chunkShipDeploymentId: null,
    requestedShipDeploymentId: "ship-123",
  })

  assert.ok(boosted.score > weaker.score)
  assert.ok(boosted.semantic > weaker.semantic)
})

test("rankVaultRagCandidate falls back to lexical when embedding vector is unavailable", () => {
  const result = rankVaultRagCandidate({
    queryTokens: ["maintenance", "schedule"],
    queryLower: "maintenance schedule",
    queryEmbedding: null,
    mode: "hybrid",
    chunkPath: "ship/kb/fleet/maintenance.md",
    chunkTitle: "Maintenance Schedule",
    chunkNormalizedContent: "maintenance schedule daily checks",
    chunkEmbedding: [0.1, 0.2],
    chunkScopeType: "fleet",
    chunkShipDeploymentId: null,
    requestedShipDeploymentId: "ship-123",
  })

  assert.equal(result.semantic, 0)
  assert.ok(result.lexical > 0)
  assert.ok(result.score > 0)
})
