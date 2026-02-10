import assert from "node:assert/strict"
import test from "node:test"
import {
  defaultCloudProviderConfig,
  normalizeCloudProviderConfig,
  readCloudProviderConfig,
} from "@/lib/shipyard/cloud/types"

test("normalizeCloudProviderConfig applies defaults", () => {
  const normalized = normalizeCloudProviderConfig({})

  assert.equal(normalized.provider, "hetzner")
  assert.equal(normalized.cluster.clusterName, "orchwiz-starship")
  assert.equal(normalized.tunnelPolicy.localPort, 16443)
})

test("normalizeCloudProviderConfig merges provided values", () => {
  const normalized = normalizeCloudProviderConfig({
    cluster: {
      clusterName: "custom",
      location: "fsn1",
      controlPlane: {
        machineType: "cx31",
        count: 2,
      },
      workers: {
        machineType: "cx41",
        count: 5,
      },
    },
    tunnelPolicy: {
      manage: false,
      localPort: 17443,
    },
    sshKeyId: "key-1",
  })

  assert.equal(normalized.cluster.clusterName, "custom")
  assert.equal(normalized.cluster.location, "fsn1")
  assert.equal(normalized.cluster.controlPlane.count, 2)
  assert.equal(normalized.cluster.workers.count, 5)
  assert.equal(normalized.tunnelPolicy.manage, false)
  assert.equal(normalized.tunnelPolicy.localPort, 17443)
  assert.equal(normalized.sshKeyId, "key-1")
})

test("readCloudProviderConfig returns null when config is absent", () => {
  assert.equal(readCloudProviderConfig({}), null)
})

test("readCloudProviderConfig normalizes cloud provider object", () => {
  const defaults = defaultCloudProviderConfig()
  const parsed = readCloudProviderConfig({
    cloudProvider: {
      cluster: {
        clusterName: "edge-1",
      },
    },
  })

  assert.ok(parsed)
  assert.equal(parsed?.cluster.clusterName, "edge-1")
  assert.equal(parsed?.cluster.location, defaults.cluster.location)
})
