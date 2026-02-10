import test from "node:test"
import assert from "node:assert/strict"
import { summarizeShipDeployments } from "./cluster-summary"

test("groups ships by normalized cluster target identity", () => {
  const summary = summarizeShipDeployments([
    {
      status: "active",
      healthStatus: "healthy",
      updatedAt: "2026-02-10T10:00:00.000Z",
      deployedAt: "2026-02-10T09:55:00.000Z",
      deploymentProfile: "local_starship_build",
      config: {},
    },
    {
      status: "deploying",
      healthStatus: null,
      updatedAt: "2026-02-10T10:02:00.000Z",
      deployedAt: null,
      deploymentProfile: "local_starship_build",
      config: {
        infrastructure: {
          kind: "kind",
          kubeContext: "kind-orchwiz",
          namespace: "orchwiz-starship",
        },
      },
    },
    {
      status: "failed",
      healthStatus: "unhealthy",
      updatedAt: "2026-02-10T10:05:00.000Z",
      deployedAt: null,
      deploymentProfile: "cloud_shipyard",
      config: {
        infrastructure: {
          kind: "existing_k8s",
          kubeContext: "prod-gke",
          namespace: "orchwiz-prod",
        },
      },
    },
  ])

  assert.equal(summary.groups.length, 2)
  const localGroup = summary.groups.find((group) => group.kubeContext === "kind-orchwiz")
  const cloudGroup = summary.groups.find((group) => group.kubeContext === "prod-gke")

  assert.ok(localGroup)
  assert.equal(localGroup.shipCount, 2)
  assert.equal(localGroup.statusCounts.active, 1)
  assert.equal(localGroup.statusCounts.deploying, 1)

  assert.ok(cloudGroup)
  assert.equal(cloudGroup.shipCount, 1)
  assert.equal(cloudGroup.statusCounts.failed, 1)
})

test("computes status and health counters correctly", () => {
  const summary = summarizeShipDeployments([
    {
      status: "active",
      healthStatus: "healthy",
      updatedAt: "2026-02-10T10:00:00.000Z",
      deployedAt: "2026-02-10T09:55:00.000Z",
      deploymentProfile: "local_starship_build",
      config: {},
    },
    {
      status: "updating",
      healthStatus: "healthy",
      updatedAt: "2026-02-10T10:01:00.000Z",
      deployedAt: "2026-02-10T09:56:00.000Z",
      deploymentProfile: "cloud_shipyard",
      config: {},
    },
    {
      status: "deploying",
      healthStatus: "degraded",
      updatedAt: "2026-02-10T10:02:00.000Z",
      deployedAt: null,
      deploymentProfile: "cloud_shipyard",
      config: {},
    },
    {
      status: "pending",
      healthStatus: null,
      updatedAt: "2026-02-10T10:03:00.000Z",
      deployedAt: null,
      deploymentProfile: "local_starship_build",
      config: {},
    },
    {
      status: "failed",
      healthStatus: "unhealthy",
      updatedAt: "2026-02-10T10:04:00.000Z",
      deployedAt: null,
      deploymentProfile: "cloud_shipyard",
      config: {},
    },
  ])

  assert.equal(summary.totalShips, 5)
  assert.equal(summary.statusCounts.active, 1)
  assert.equal(summary.statusCounts.updating, 1)
  assert.equal(summary.statusCounts.deploying, 1)
  assert.equal(summary.statusCounts.pending, 1)
  assert.equal(summary.statusCounts.failed, 1)

  assert.equal(summary.healthCounts.healthy, 2)
  assert.equal(summary.healthCounts.unhealthy, 2)
  assert.equal(summary.healthCounts.unknown, 1)
  assert.equal(summary.deployedNowCount, 2)
  assert.equal(summary.transitioningCount, 2)
  assert.equal(summary.failedCount, 1)
})

test("falls back to profile defaults when config is missing or partial", () => {
  const summary = summarizeShipDeployments([
    {
      status: "active",
      healthStatus: "healthy",
      updatedAt: "2026-02-10T10:00:00.000Z",
      deployedAt: "2026-02-10T09:55:00.000Z",
      deploymentProfile: "local_starship_build",
      config: null,
    },
    {
      status: "inactive",
      healthStatus: null,
      updatedAt: "2026-02-10T10:01:00.000Z",
      deployedAt: null,
      deploymentProfile: "cloud_shipyard",
      config: {
        infrastructure: {
          kubeContext: "prod-cluster",
        },
      },
    },
  ])

  const localGroup = summary.groups.find((group) => group.kubeContext === "kind-orchwiz")
  const cloudGroup = summary.groups.find((group) => group.kubeContext === "prod-cluster")

  assert.ok(localGroup)
  assert.equal(localGroup.kind, "kind")
  assert.equal(localGroup.namespace, "orchwiz-starship")

  assert.ok(cloudGroup)
  assert.equal(cloudGroup.kind, "existing_k8s")
  assert.equal(cloudGroup.namespace, "orchwiz-shipyard")
})

test("tracks latest deploy and update timestamps", () => {
  const summary = summarizeShipDeployments([
    {
      status: "active",
      healthStatus: "healthy",
      updatedAt: "2026-02-10T10:00:00.000Z",
      deployedAt: "2026-02-10T09:30:00.000Z",
      deploymentProfile: "local_starship_build",
      config: {},
    },
    {
      status: "updating",
      healthStatus: "healthy",
      updatedAt: "2026-02-10T10:06:00.000Z",
      deployedAt: "2026-02-10T09:40:00.000Z",
      deploymentProfile: "cloud_shipyard",
      config: {},
    },
    {
      status: "deploying",
      healthStatus: null,
      updatedAt: "2026-02-10T10:05:00.000Z",
      deployedAt: null,
      deploymentProfile: "cloud_shipyard",
      config: {},
    },
  ])

  assert.equal(summary.newestUpdatedAt, "2026-02-10T10:06:00.000Z")
  assert.equal(summary.newestDeployedAt, "2026-02-10T09:40:00.000Z")
})
