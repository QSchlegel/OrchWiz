import test from "node:test"
import assert from "node:assert/strict"
import { updateEmbeddingBaseline } from "./baseline"

function approxEqual(actual: number, expected: number, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `expected ${actual} ~= ${expected}`)
}

test("updateEmbeddingBaseline bootstraps centroid and updates mean vectors", () => {
  let state = { centroid: null as number[] | null, sim: null }

  const first = updateEmbeddingBaseline({ state, vector: [1, 0] })
  assert.deepEqual(first.state.centroid, [1, 0])
  assert.equal(first.similarity, null)
  state = first.state

  const second = updateEmbeddingBaseline({ state, vector: [0, 1] })
  assert.ok(second.state.sim)
  assert.equal(second.state.sim?.count, 1)
  approxEqual(second.state.centroid?.[0] ?? 0, 0.5)
  approxEqual(second.state.centroid?.[1] ?? 0, 0.5)
  approxEqual(second.similarity ?? 0, 0)
  state = second.state

  const third = updateEmbeddingBaseline({ state, vector: [1, 0] })
  approxEqual(third.state.centroid?.[0] ?? 0, 2 / 3)
  approxEqual(third.state.centroid?.[1] ?? 0, 1 / 3)
  assert.ok(third.state.sim)
  assert.equal(third.state.sim?.count, 2)
})

