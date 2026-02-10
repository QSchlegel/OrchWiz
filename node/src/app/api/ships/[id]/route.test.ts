import assert from "node:assert/strict"
import test from "node:test"
import { sanitizeShipUpdateData } from "./route"

test("sanitizeShipUpdateData strips ownership fields from generic ship updates", () => {
  const sanitized = sanitizeShipUpdateData({
    name: "USS Secure",
    userId: "attacker-user-id",
    advancedNodeTypeOverride: true,
    status: "active",
  })

  assert.equal(sanitized.name, "USS Secure")
  assert.equal(sanitized.status, "active")
  assert.equal(sanitized.userId, undefined)
  assert.equal(sanitized.advancedNodeTypeOverride, undefined)
  assert.equal(sanitized.deploymentType, "ship")
  assert.equal(sanitized.updatedAt instanceof Date, true)
})
