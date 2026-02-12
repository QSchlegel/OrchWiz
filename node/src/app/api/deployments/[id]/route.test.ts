import assert from "node:assert/strict"
import test from "node:test"
import { sanitizeDeploymentUpdateData } from "./route"

test("sanitizeDeploymentUpdateData strips restricted version and profile helper fields", () => {
  const sanitized = sanitizeDeploymentUpdateData({
    name: "USS Hardened",
    advancedNodeTypeOverride: true,
    shipVersion: "v2",
    shipVersionUpdatedAt: "2026-02-12T12:00:00.000Z",
    status: "active",
  })

  assert.equal(sanitized.name, "USS Hardened")
  assert.equal(sanitized.status, "active")
  assert.equal(sanitized.advancedNodeTypeOverride, undefined)
  assert.equal(sanitized.shipVersion, undefined)
  assert.equal(sanitized.shipVersionUpdatedAt, undefined)
  assert.equal(sanitized.updatedAt instanceof Date, true)
})
