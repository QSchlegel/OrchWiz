import test from "node:test"
import assert from "node:assert/strict"
import {
  parseKnowledgeBackend,
  parseKnowledgeResyncScope,
  parseKnowledgeScope,
  parseTopK,
  resolveKnowledgeMutationPath,
} from "./route-helpers"

test("parseKnowledgeScope and parseKnowledgeResyncScope normalize values", () => {
  assert.equal(parseKnowledgeScope("ship"), "ship")
  assert.equal(parseKnowledgeScope("fleet"), "fleet")
  assert.equal(parseKnowledgeScope("unknown"), "all")

  assert.equal(parseKnowledgeResyncScope("ship"), "ship")
  assert.equal(parseKnowledgeResyncScope("fleet"), "fleet")
  assert.equal(parseKnowledgeResyncScope("anything"), "all")
})

test("parseKnowledgeBackend normalizes values and defaults to auto", () => {
  assert.equal(parseKnowledgeBackend("auto"), "auto")
  assert.equal(parseKnowledgeBackend("vault-local"), "vault-local")
  assert.equal(parseKnowledgeBackend("data-core-merged"), "data-core-merged")
  assert.equal(parseKnowledgeBackend("unknown"), "auto")
  assert.equal(parseKnowledgeBackend(null), "auto")
})

test("parseTopK clamps bounds and handles invalid input", () => {
  assert.equal(parseTopK("5"), 5)
  assert.equal(parseTopK("0"), 1)
  assert.equal(parseTopK("200"), 100)
  assert.equal(parseTopK("x"), undefined)
  assert.equal(parseTopK(null), undefined)
})

test("resolveKnowledgeMutationPath accepts ship/fleet prefixes and rejects other paths", () => {
  const shipPath = resolveKnowledgeMutationPath(
    {
      path: "kb/ships/ship-77/readiness.md",
      content: "ok",
    },
    "ship-77",
  )
  assert.equal(shipPath, "kb/ships/ship-77/readiness.md")

  const fleetPath = resolveKnowledgeMutationPath(
    {
      scope: "fleet",
      relativePath: "intel/summary",
      content: "ok",
    },
    "ship-77",
  )
  assert.equal(fleetPath, "kb/fleet/intel/summary.md")

  assert.throws(
    () =>
      resolveKnowledgeMutationPath(
        {
          path: "notes/outside.md",
          content: "x",
        },
        "ship-77",
      ),
    /Knowledge path must be under/,
  )
})
