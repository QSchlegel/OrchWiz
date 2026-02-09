import test from "node:test"
import assert from "node:assert/strict"
import { decrypt, encrypt } from "../src/crypto/crypto.js"

test("encrypt/decrypt roundtrip", () => {
  process.env.WALLET_ENCLAVE_MASTER_SECRET = "dev-secret"

  const plaintext = Buffer.from("hello", "utf8").toString("base64")
  const encrypted = encrypt("ctx", plaintext)
  const decrypted = decrypt("ctx", encrypted.ciphertextB64, encrypted.nonceB64)

  assert.equal(Buffer.from(decrypted.plaintextB64, "base64").toString("utf8"), "hello")
})

test("decrypt fails with wrong context", () => {
  process.env.WALLET_ENCLAVE_MASTER_SECRET = "dev-secret"

  const plaintext = Buffer.from("secret", "utf8").toString("base64")
  const encrypted = encrypt("ctx-a", plaintext)

  assert.throws(() => decrypt("ctx-b", encrypted.ciphertextB64, encrypted.nonceB64))
})
