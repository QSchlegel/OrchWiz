import test from "node:test"
import assert from "node:assert/strict"
import { MeshCardanoAdapter } from "../src/adapters/mesh_cardano.js"

const hasMnemonic = Boolean(process.env.CARDANO_MNEMONIC || process.env.CARDANO_MNEMONIC_TEST)

test("mesh adapter signs payload when mnemonic is configured", { skip: !hasMnemonic }, async () => {
  if (!process.env.CARDANO_MNEMONIC && process.env.CARDANO_MNEMONIC_TEST) {
    process.env.CARDANO_MNEMONIC = process.env.CARDANO_MNEMONIC_TEST
  }

  const adapter = new MeshCardanoAdapter()
  const signed = await adapter.signData({
    keyRef: "test",
    payload: "wallet-enclave-signing-smoke",
  })

  assert.equal(typeof signed.address, "string")
  assert.equal(typeof signed.signature, "string")
  assert.equal(typeof signed.key, "string")
  assert.equal(signed.alg, "cip8-ed25519")
})
