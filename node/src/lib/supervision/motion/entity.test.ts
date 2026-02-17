import test from "node:test"
import assert from "node:assert/strict"
import { resolveMotionEntity } from "./entity"

test("resolveMotionEntity prefers ship+station for bridge-agent channel", () => {
  const resolved = resolveMotionEntity({
    ownerUserId: "user-1",
    metadata: {
      bridge: {
        channel: "bridge-agent",
        shipDeploymentId: "ship-1",
        stationKey: "xo",
      },
      subagentId: "sub-1",
    },
  })

  assert.equal(resolved.entityType, "ship_station")
  assert.equal(resolved.entityKey, "ship:ship-1:station:xo")
  assert.equal(resolved.shipDeploymentId, "ship-1")
  assert.equal(resolved.stationKey, "xo")
})

test("resolveMotionEntity falls back to ship+subagent when station missing", () => {
  const resolved = resolveMotionEntity({
    ownerUserId: "user-1",
    metadata: {
      bridge: {
        channel: "bridge-agent",
        shipDeploymentId: "ship-1",
      },
      subagentId: "sub-1",
    },
  })

  assert.equal(resolved.entityType, "ship_subagent")
  assert.equal(resolved.entityKey, "ship:ship-1:subagent:sub-1")
})

test("resolveMotionEntity falls back to subagent when no shipDeploymentId", () => {
  const resolved = resolveMotionEntity({
    ownerUserId: "user-1",
    metadata: {
      subagentId: "sub-1",
    },
  })

  assert.equal(resolved.entityType, "subagent")
  assert.equal(resolved.entityKey, "subagent:sub-1")
})

test("resolveMotionEntity falls back to user when no subagent", () => {
  const resolved = resolveMotionEntity({
    ownerUserId: "user-1",
    metadata: {},
  })

  assert.equal(resolved.entityType, "user")
  assert.equal(resolved.entityKey, "user:user-1")
})

test("resolveMotionEntity resolves shipDeploymentId from multiple metadata sources", () => {
  const resolved = resolveMotionEntity({
    ownerUserId: "user-1",
    metadata: {
      shipContext: {
        deploymentId: "ship-ctx-1",
      },
      subagentId: "sub-1",
    },
  })

  assert.equal(resolved.entityType, "ship_subagent")
  assert.equal(resolved.entityKey, "ship:ship-ctx-1:subagent:sub-1")
})

