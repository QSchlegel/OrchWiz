import test from "node:test"
import assert from "node:assert/strict"
import {
  buildCanonicalBridgeSigningPayload,
  signatureMetadataFromRuntimeBundle,
  validateRuntimeSignatureBundle,
} from "./message-signing"

test("buildCanonicalBridgeSigningPayload produces stable payload hash", () => {
  const one = buildCanonicalBridgeSigningPayload({
    sessionId: "session-1",
    interactionType: "ai_response",
    bridgeCrewId: "crew-1",
    bridgeStationKey: "eng",
    provider: "openclaw",
    content: "All systems nominal.",
    signedAt: "2026-02-09T00:00:00.000Z",
  })

  const two = buildCanonicalBridgeSigningPayload({
    sessionId: "session-1",
    interactionType: "ai_response",
    bridgeCrewId: "crew-1",
    bridgeStationKey: "eng",
    provider: "openclaw",
    content: "All systems nominal.",
    signedAt: "2026-02-09T00:00:00.000Z",
  })

  assert.equal(one.payloadJson, two.payloadJson)
  assert.equal(one.payloadHash, two.payloadHash)
})

test("validateRuntimeSignatureBundle rejects hash mismatch", () => {
  const payload = buildCanonicalBridgeSigningPayload({
    sessionId: "session-2",
    interactionType: "ai_response",
    bridgeCrewId: "crew-2",
    bridgeStationKey: "ops",
    provider: "openclaw",
    content: "Route updated.",
    signedAt: "2026-02-09T00:00:01.000Z",
  })

  const valid = validateRuntimeSignatureBundle(
    {
      keyRef: "ops",
      signature: "sig",
      algorithm: "cip8-ed25519",
      payloadHash: payload.payloadHash,
      signedAt: payload.payload.signedAt,
    },
    payload.payloadHash,
  )
  assert.equal(valid, true)

  const invalid = validateRuntimeSignatureBundle(
    {
      keyRef: "ops",
      signature: "sig",
      algorithm: "cip8-ed25519",
      payloadHash: "wrong",
      signedAt: payload.payload.signedAt,
    },
    payload.payloadHash,
  )
  assert.equal(invalid, false)
})

test("signatureMetadataFromRuntimeBundle serializes metadata", () => {
  const payload = buildCanonicalBridgeSigningPayload({
    sessionId: "session-3",
    interactionType: "ai_response",
    bridgeCrewId: "crew-3",
    bridgeStationKey: "xo",
    provider: "openclaw",
    content: "Acknowledge mission intent.",
    signedAt: "2026-02-09T00:00:02.000Z",
  })

  const metadata = signatureMetadataFromRuntimeBundle(
    {
      keyRef: "xo",
      signature: "runtime-sig",
      algorithm: "cip8-ed25519",
      payloadHash: payload.payloadHash,
      signedAt: payload.payload.signedAt,
      address: "addr_test",
      key: "pubkey",
    },
    payload.payloadJson,
  )

  assert.equal(metadata.source, "runtime")
  assert.equal(metadata.keyRef, "xo")
  assert.equal(metadata.signature, "runtime-sig")
  assert.equal(metadata.payloadHash, payload.payloadHash)
})
