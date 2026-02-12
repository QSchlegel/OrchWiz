import assert from "node:assert/strict"
import test from "node:test"
import {
  SHIP_BASELINE_VERSION,
  SHIP_LATEST_VERSION,
  isKnownShipVersion,
  latestShipVersion,
  resolveShipVersion,
  shipVersionNeedsUpgrade,
} from "./versions"

test("isKnownShipVersion validates catalog entries", () => {
  assert.equal(isKnownShipVersion("v1"), true)
  assert.equal(isKnownShipVersion("v2"), true)
  assert.equal(isKnownShipVersion("v99"), false)
  assert.equal(isKnownShipVersion(2), false)
})

test("resolveShipVersion falls back to baseline for unknown values", () => {
  assert.equal(resolveShipVersion("v2"), "v2")
  assert.equal(resolveShipVersion("unknown"), SHIP_BASELINE_VERSION)
  assert.equal(resolveShipVersion(null), SHIP_BASELINE_VERSION)
})

test("latestShipVersion returns latest catalog entry", () => {
  assert.equal(latestShipVersion(), SHIP_LATEST_VERSION)
})

test("shipVersionNeedsUpgrade compares current and target versions", () => {
  assert.equal(shipVersionNeedsUpgrade("v1"), true)
  assert.equal(shipVersionNeedsUpgrade("v2"), false)
  assert.equal(shipVersionNeedsUpgrade("unknown"), true)
  assert.equal(shipVersionNeedsUpgrade("v2", "v2"), false)
  assert.equal(shipVersionNeedsUpgrade("v1", "v1"), false)
})
