import test from "node:test"
import assert from "node:assert/strict"
import { normalizeImportedAuroraCaseFile } from "./aurora-normalize"

test("normalizeImportedAuroraCaseFile defaults missing arrays/enums and normalizes version", () => {
  const normalized = normalizeImportedAuroraCaseFile({
    storage_format_version: 2,
    caseid: "CASE-123",
    malware: [{ md5: "deadbeef" }],
  })

  assert.equal(normalized.storage_format_version, 7)
  assert.equal(normalized.locked, false)
  assert.equal(normalized.case_id, "CASE-123")

  assert.ok(Array.isArray(normalized.timeline))
  assert.ok(Array.isArray(normalized.malware))
  assert.ok(Array.isArray(normalized.network_indicators))
  assert.ok(Array.isArray(normalized.evidence))

  assert.ok(Array.isArray(normalized.event_types))
  assert.ok(Array.isArray(normalized.killchain))
  assert.ok(normalized.event_types.length > 0)
})

test("normalizeImportedAuroraCaseFile ensures recid on grid records", () => {
  const normalized = normalizeImportedAuroraCaseFile({
    malware: [{ md5: "abc" }, { recid: 7, md5: "def" }],
    evidence: [{ name: "x" }],
  })

  assert.equal(typeof normalized.malware[0].recid, "number")
  assert.equal(normalized.malware[1].recid, 7)
  assert.equal(typeof normalized.evidence[0].recid, "number")
})

test("normalizeImportedAuroraCaseFile strips known secret fields", () => {
  const normalized = normalizeImportedAuroraCaseFile({
    mispapikey: "should-not-persist",
    vtapikey: "should-not-persist",
  })

  assert.equal((normalized as any).mispapikey, undefined)
  assert.equal((normalized as any).vtapikey, undefined)
})

