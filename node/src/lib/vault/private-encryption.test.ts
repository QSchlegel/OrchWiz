import test from "node:test"
import assert from "node:assert/strict"
import {
  buildPrivateVaultEncryptionContext,
  parsePrivateVaultEncryptedEnvelope,
  serializePrivateVaultEncryptedEnvelope,
} from "./private-encryption"

test("private encryption envelope serialize/parse roundtrip", () => {
  const serialized = serializePrivateVaultEncryptedEnvelope({
    kind: "orchwiz.wallet-enclave.encrypted-note",
    version: 1,
    alg: "AES-256-GCM",
    context: buildPrivateVaultEncryptionContext("notes/private.md"),
    ciphertextB64: "Y2lwaGVydGV4dA==",
    nonceB64: "bm9uY2U=",
    encryptedAt: "2026-02-09T00:00:00.000Z",
  })

  const parsed = parsePrivateVaultEncryptedEnvelope(serialized)
  assert.ok(parsed)
  assert.equal(parsed?.alg, "AES-256-GCM")
  assert.equal(parsed?.context, "vault:agent-private:notes/private.md")
})

test("parsePrivateVaultEncryptedEnvelope returns null for plaintext", () => {
  const parsed = parsePrivateVaultEncryptedEnvelope("# Plain note\n\nHello")
  assert.equal(parsed, null)
})
