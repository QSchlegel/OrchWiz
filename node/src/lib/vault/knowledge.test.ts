import test from "node:test"
import assert from "node:assert/strict"
import {
  buildShipKnowledgeTree,
  filterShipKnowledgePaths,
  normalizeShipKnowledgePath,
  parseShipKnowledgeScope,
} from "./knowledge"

test("parseShipKnowledgeScope normalizes supported values", () => {
  assert.equal(parseShipKnowledgeScope("ship"), "ship")
  assert.equal(parseShipKnowledgeScope("fleet"), "fleet")
  assert.equal(parseShipKnowledgeScope("all"), "all")
  assert.equal(parseShipKnowledgeScope("x"), "all")
})

test("normalizeShipKnowledgePath enforces ship/fleet prefixes", () => {
  assert.equal(
    normalizeShipKnowledgePath("kb/ships/ship-5/readiness.md", "ship-5"),
    "kb/ships/ship-5/readiness.md",
  )
  assert.equal(
    normalizeShipKnowledgePath("kb/fleet/intel.md", "ship-5"),
    "kb/fleet/intel.md",
  )

  assert.throws(() => normalizeShipKnowledgePath("notes/outside.md", "ship-5"), /Knowledge path must be under/)
})

test("filterShipKnowledgePaths restricts by scope", () => {
  const all = [
    "kb/ships/ship-2/one.md",
    "kb/fleet/two.md",
    "notes/other.md",
  ]

  assert.deepEqual(
    filterShipKnowledgePaths({
      paths: all,
      scope: "ship",
      shipDeploymentId: "ship-2",
    }),
    ["kb/ships/ship-2/one.md"],
  )
  assert.deepEqual(
    filterShipKnowledgePaths({
      paths: all,
      scope: "fleet",
      shipDeploymentId: "ship-2",
    }),
    ["kb/fleet/two.md"],
  )
  assert.deepEqual(
    filterShipKnowledgePaths({
      paths: all,
      scope: "all",
      shipDeploymentId: "ship-2",
    }),
    ["kb/fleet/two.md", "kb/ships/ship-2/one.md"],
  )
})

test("buildShipKnowledgeTree builds deterministic nested tree", () => {
  const tree = buildShipKnowledgeTree([
    "kb/fleet/a.md",
    "kb/ships/ship-1/notes/start.md",
  ])

  assert.equal(tree.length > 0, true)
  assert.equal(tree[0].nodeType, "folder")
  assert.equal(tree[0].name, "kb")
})
