import assert from "node:assert/strict"
import test from "node:test"
import { mergeShipConfig, sanitizeShipUpdateData } from "./route"

test("sanitizeShipUpdateData strips ownership fields from generic ship updates", () => {
  const sanitized = sanitizeShipUpdateData({
    name: "USS Secure",
    userId: "attacker-user-id",
    advancedNodeTypeOverride: true,
    shipVersion: "v2",
    shipVersionUpdatedAt: "2026-02-12T12:00:00.000Z",
    status: "active",
  })

  assert.equal(sanitized.name, "USS Secure")
  assert.equal(sanitized.status, "active")
  assert.equal(sanitized.userId, undefined)
  assert.equal(sanitized.advancedNodeTypeOverride, undefined)
  assert.equal(sanitized.shipVersion, undefined)
  assert.equal(sanitized.shipVersionUpdatedAt, undefined)
  assert.equal(sanitized.deploymentType, "ship")
  assert.equal(sanitized.updatedAt instanceof Date, true)
})

test("mergeShipConfig preserves unrelated keys when monitoring is updated", () => {
  const merged = mergeShipConfig(
    {
      infrastructure: {
        kind: "kind",
        kubeContext: "kind-orchwiz",
      },
      cloudProvider: {
        provider: "hetzner",
        stackMode: "single_node",
      },
      metadata: {
        purpose: "ops",
      },
      monitoring: {
        grafanaUrl: "https://grafana.old.example.com",
      },
    },
    {
      monitoring: {
        prometheusUrl: "https://prometheus.new.example.com",
      },
    },
  )

  assert.equal(merged.metadata && (merged.metadata as Record<string, unknown>).purpose, "ops")
  assert.equal(
    (merged.infrastructure as Record<string, unknown>).kubeContext,
    "kind-orchwiz",
  )
  assert.equal(
    (merged.cloudProvider as Record<string, unknown>).provider,
    "hetzner",
  )
  assert.equal(
    (merged.monitoring as Record<string, unknown>).grafanaUrl,
    "https://grafana.old.example.com",
  )
  assert.equal(
    (merged.monitoring as Record<string, unknown>).prometheusUrl,
    "https://prometheus.new.example.com",
  )
})
