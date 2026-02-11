import assert from "node:assert/strict"
import test from "node:test"
import {
  createShipyardUserApiKey,
  hashShipyardUserApiKey,
  parseShipyardUserApiKey,
  SHIPYARD_USER_API_KEY_PREFIX,
  shipyardUserApiKeyFingerprintFromHash,
  shipyardUserApiKeyPreview,
  verifyShipyardUserApiKey,
} from "./user-api-keys"

test("createShipyardUserApiKey generates parseable token and hash", () => {
  const generated = createShipyardUserApiKey()
  const parsed = parseShipyardUserApiKey(generated.plaintextKey)

  assert.ok(parsed)
  assert.equal(parsed.keyId, generated.keyId)
  assert.equal(hashShipyardUserApiKey(generated.plaintextKey), generated.keyHash)
  assert.ok(verifyShipyardUserApiKey(generated.plaintextKey, generated.keyHash))
})

test("parseShipyardUserApiKey rejects malformed tokens", () => {
  assert.equal(parseShipyardUserApiKey(null), null)
  assert.equal(parseShipyardUserApiKey(""), null)
  assert.equal(parseShipyardUserApiKey("foo"), null)
  assert.equal(parseShipyardUserApiKey(`${SHIPYARD_USER_API_KEY_PREFIX}.missing-secret`), null)
  assert.equal(parseShipyardUserApiKey(`wrong_prefix.keyId.secret`), null)
  assert.equal(parseShipyardUserApiKey(`${SHIPYARD_USER_API_KEY_PREFIX}.key.secret.extra`), null)
})

test("verifyShipyardUserApiKey uses hash verification", () => {
  const generated = createShipyardUserApiKey()
  assert.equal(verifyShipyardUserApiKey(generated.plaintextKey, generated.keyHash), true)

  const tampered = `${generated.plaintextKey}x`
  assert.equal(verifyShipyardUserApiKey(tampered, generated.keyHash), false)
})

test("fingerprint and preview formatting are stable", () => {
  const hash = "0123456789abcdef"
  assert.equal(shipyardUserApiKeyFingerprintFromHash(hash), "0123456789ab")

  const preview = shipyardUserApiKeyPreview("abcd1234efgh5678")
  assert.equal(preview, `${SHIPYARD_USER_API_KEY_PREFIX}.abcd...5678.********`)
})
