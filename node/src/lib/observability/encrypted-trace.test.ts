import test from "node:test"
import assert from "node:assert/strict"
import {
  buildTraceEncryptionContext,
  isEncryptedTraceFieldEnvelope,
  TRACE_ENCRYPTION_ENVELOPE_KIND,
  TRACE_ENCRYPTION_ENVELOPE_VERSION,
} from "./encrypted-trace"

test("buildTraceEncryptionContext is deterministic", () => {
  const one = buildTraceEncryptionContext("trace-1", "input.prompt")
  const two = buildTraceEncryptionContext("trace-1", "input.prompt")
  assert.equal(one, "observability.trace:trace-1:input.prompt")
  assert.equal(two, one)
})

test("isEncryptedTraceFieldEnvelope validates expected shape", () => {
  const envelope = {
    kind: TRACE_ENCRYPTION_ENVELOPE_KIND,
    version: TRACE_ENCRYPTION_ENVELOPE_VERSION,
    alg: "AES-256-GCM",
    context: "observability.trace:trace-2:output.text",
    ciphertextB64: "Y2lwaGVy",
    nonceB64: "bm9uY2U=",
    encryptedAt: new Date().toISOString(),
    fieldPath: "output.text",
  }

  assert.equal(isEncryptedTraceFieldEnvelope(envelope), true)
  assert.equal(isEncryptedTraceFieldEnvelope({ ...envelope, version: 2 }), false)
})
