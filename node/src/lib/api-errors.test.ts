import test from "node:test"
import assert from "node:assert/strict"
import { buildUiError, parseApiError } from "./api-errors"

test("parseApiError extracts error message + code when present", () => {
  const parsed = parseApiError({ error: "Nope", code: "SOME_CODE" }, "fallback")
  assert.deepEqual(parsed, { message: "Nope", code: "SOME_CODE" })
})

test("parseApiError falls back when payload is missing or malformed", () => {
  assert.deepEqual(parseApiError(null, "fallback-1"), { message: "fallback-1", code: null })
  assert.deepEqual(parseApiError({}, "fallback-2"), { message: "fallback-2", code: null })
  assert.deepEqual(parseApiError({ error: "   " }, "fallback-3"), { message: "fallback-3", code: null })
})

test("buildUiError attaches wallet enclave suggested commands for WALLET_ENCLAVE_UNREACHABLE", () => {
  const ui = buildUiError(
    {
      error: "Wallet enclave request failed.",
      code: "WALLET_ENCLAVE_UNREACHABLE",
    },
    503,
    "fallback",
  )

  assert.equal(ui.text, "Wallet enclave request failed.")
  assert.equal(ui.code, "WALLET_ENCLAVE_UNREACHABLE")
  assert.deepEqual(ui.suggestedCommands, [
    "curl -sS -m 2 http://127.0.0.1:3377/ || true",
    "lsof -nP -iTCP:3377 -sTCP:LISTEN || true",
    "cd node && rg '^WALLET_ENCLAVE_' .env || true",
  ])
})

test("buildUiError does not attach suggested commands for unrelated codes", () => {
  const ui = buildUiError({ error: "Nope", code: "NOT_ENCLAVE" }, 400, "fallback")
  assert.equal(ui.text, "Nope")
  assert.equal(ui.code, "NOT_ENCLAVE")
  assert.equal(ui.suggestedCommands, undefined)
})

