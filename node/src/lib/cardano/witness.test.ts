import assert from "node:assert/strict"
import test from "node:test"
import { encode } from "cbor-x"
import { decodeFirstVkeyWitness } from "./witness"

function bytesToHex(bytes: Uint8Array): string {
  let out = ""
  for (const b of bytes) out += b.toString(16).padStart(2, "0")
  return out
}

test("decodeFirstVkeyWitness decodes first witness from CBOR witness set", () => {
  const vkey = new Uint8Array(32)
  const sig = new Uint8Array(64)
  for (let i = 0; i < vkey.length; i++) vkey[i] = i
  for (let i = 0; i < sig.length; i++) sig[i] = 255 - i

  const witnessSet = new Map<any, any>()
  witnessSet.set(0, [[vkey, sig]])

  const cborHex = bytesToHex(encode(witnessSet))
  const decoded = decodeFirstVkeyWitness(cborHex)

  assert.equal(decoded.vkeyHex, bytesToHex(vkey))
  assert.equal(decoded.signatureHex, bytesToHex(sig))
})

test("decodeFirstVkeyWitness throws on missing vkey witnesses", () => {
  const witnessSet = new Map<any, any>()
  const cborHex = bytesToHex(encode(witnessSet))

  assert.throws(() => decodeFirstVkeyWitness(cborHex), /vkey witnesses/u)
})

test("decodeFirstVkeyWitness throws on invalid witness lengths", () => {
  const witnessSet = new Map<any, any>()
  witnessSet.set(0, [[new Uint8Array(31), new Uint8Array(64)]])

  const cborHex = bytesToHex(encode(witnessSet))
  assert.throws(() => decodeFirstVkeyWitness(cborHex), /vkey length/u)
})

