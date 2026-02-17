import assert from "node:assert/strict"
import test from "node:test"

import { computeCoinPose } from "./coinPose"

test("computeCoinPose starts and ends on the ground", () => {
  const start = computeCoinPose(0)
  const end = computeCoinPose(1)
  assert.ok(Math.abs(start.position.y) < 1e-12)
  assert.ok(Math.abs(end.position.y) < 1e-12)
})

test("computeCoinPose returns finite numbers across the full range", () => {
  for (let i = 0; i <= 10; i += 1) {
    const t = i / 10
    const pose = computeCoinPose(t)

    const values = [
      pose.position.x,
      pose.position.y,
      pose.position.z,
      pose.rotation.x,
      pose.rotation.y,
      pose.rotation.z,
      pose.shadow.scale,
      pose.shadow.opacity,
    ]

    for (const value of values) {
      assert.ok(Number.isFinite(value), `expected finite value, got ${String(value)} at t=${t}`)
    }
  }
})

test("computeCoinPose shadow stays within expected bounds", () => {
  for (let i = 0; i <= 100; i += 1) {
    const t = i / 100
    const pose = computeCoinPose(t)
    assert.ok(pose.shadow.scale >= 0.6 && pose.shadow.scale <= 1.15)
    assert.ok(pose.shadow.opacity >= 0 && pose.shadow.opacity <= 0.25)
  }
})

