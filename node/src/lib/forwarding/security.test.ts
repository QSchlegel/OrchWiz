import test from "node:test"
import assert from "node:assert/strict"
import {
  hashApiKey,
  isFreshTimestamp,
  signForwardingPayload,
  verifyApiKeyHash,
  verifyForwardingSignature,
} from "./security"

test("hash and verify api key", () => {
  const apiKey = "secret-key"
  const hash = hashApiKey(apiKey)
  assert.equal(verifyApiKeyHash(apiKey, hash), true)
  assert.equal(verifyApiKeyHash("wrong", hash), false)
})

test("sign and verify forwarding payload", () => {
  const apiKey = "secret-key"
  const timestamp = String(Date.now())
  const nonce = "abc123"
  const body = JSON.stringify({ hello: "world" })
  const signature = signForwardingPayload(timestamp, nonce, body, apiKey)

  assert.equal(verifyForwardingSignature(timestamp, nonce, body, signature, apiKey), true)
  assert.equal(verifyForwardingSignature(timestamp, nonce, body, signature, "wrong-key"), false)
})

test("fresh timestamp window", () => {
  assert.equal(isFreshTimestamp(String(Date.now())), true)
  assert.equal(isFreshTimestamp(String(Date.now() - 10 * 60 * 1000)), false)
})
