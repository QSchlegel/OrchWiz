import test from "node:test"
import assert from "node:assert/strict"
import {
  parseRagBackend,
  RagBackendUnavailableError,
  resolveRagBackend,
} from "./rag-backend"

test("parseRagBackend accepts known values and defaults to auto", () => {
  assert.equal(parseRagBackend(undefined), "auto")
  assert.equal(parseRagBackend(null), "auto")
  assert.equal(parseRagBackend(""), "auto")
  assert.equal(parseRagBackend("auto"), "auto")
  assert.equal(parseRagBackend("vault-local"), "vault-local")
  assert.equal(parseRagBackend("data-core-merged"), "data-core-merged")
  assert.equal(parseRagBackend("unknown"), "auto")
})

test("resolveRagBackend maps auto to data-core when enabled", () => {
  const resolved = resolveRagBackend({
    requestedBackend: "auto",
    dataCoreEnabled: true,
  })

  assert.deepEqual(resolved, {
    requestedBackend: "auto",
    effectiveBackend: "data-core-merged",
  })
})

test("resolveRagBackend maps auto to local when data-core is disabled", () => {
  const resolved = resolveRagBackend({
    requestedBackend: "auto",
    dataCoreEnabled: false,
  })

  assert.deepEqual(resolved, {
    requestedBackend: "auto",
    effectiveBackend: "vault-local",
  })
})

test("resolveRagBackend throws explicit unavailable error for data-core backend when disabled", () => {
  assert.throws(
    () => {
      resolveRagBackend({
        requestedBackend: "data-core-merged",
        dataCoreEnabled: false,
      })
    },
    (error: unknown) => {
      assert.ok(error instanceof RagBackendUnavailableError)
      assert.equal(error.code, "RAG_BACKEND_UNAVAILABLE")
      assert.equal(error.status, 409)
      assert.equal(error.backend, "data-core-merged")
      return true
    },
  )
})
