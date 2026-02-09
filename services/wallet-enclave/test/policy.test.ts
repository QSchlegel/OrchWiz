import test from "node:test"
import assert from "node:assert/strict"
import { checkSignIntent } from "../src/policy/policy.js"

test("policy allowlist + denylist behavior", () => {
  const allow = checkSignIntent({ allowKeyRefs: ["xo"], denyKeyRefs: [] }, "xo")
  assert.equal(allow.ok, true)

  const blockedNotAllowlisted = checkSignIntent({ allowKeyRefs: ["xo"], denyKeyRefs: [] }, "eng")
  assert.equal(blockedNotAllowlisted.ok, false)

  const blockedDenied = checkSignIntent({ allowKeyRefs: [], denyKeyRefs: ["ops"] }, "ops")
  assert.equal(blockedDenied.ok, false)
})
