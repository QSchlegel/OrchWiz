import assert from "node:assert/strict"
import test from "node:test"
import type { DeploymentAdapterResult } from "@/lib/deployment/adapter"
import {
  ShipUpgradeError,
  upgradeShipToLatest,
  type ShipUpgradeDeps,
  type ShipUpgradeDeployment,
} from "./upgrade"
import { SHIP_LATEST_VERSION } from "./versions"

function makeShip(overrides: Partial<ShipUpgradeDeployment> = {}): ShipUpgradeDeployment {
  return {
    id: "ship-1",
    name: "USS Upgrade",
    userId: "user-1",
    nodeId: "node-1",
    nodeType: "local",
    nodeUrl: "http://localhost:3000",
    deploymentProfile: "local_starship_build",
    provisioningMode: "terraform_ansible",
    status: "active",
    shipVersion: "v1",
    shipVersionUpdatedAt: new Date("2026-02-10T00:00:00.000Z"),
    config: {
      infrastructure: {
        kind: "kind",
        kubeContext: "kind-orchwiz",
        namespace: "orchwiz-starship",
        terraformWorkspace: "starship-local",
        terraformEnvDir: "infra/terraform/environments/starship-local",
        ansibleInventory: "infra/ansible/inventory/local.ini",
        ansiblePlaybook: "infra/ansible/playbooks/starship_local.yml",
      },
      cloudProvider: {
        provider: "hetzner",
        cluster: {
          clusterName: "orchwiz-starship",
          location: "nbg1",
          networkCidr: "10.42.0.0/16",
          image: "ubuntu-24.04",
          controlPlane: {
            machineType: "cx22",
            count: 1,
          },
          workers: {
            machineType: "cx32",
            count: 2,
          },
        },
        stackMode: "full_support_systems",
        k3s: {
          channel: "stable",
          disableTraefik: true,
        },
        tunnelPolicy: {
          manage: true,
          target: "kubernetes_api",
          localPort: 16443,
        },
        sshKeyId: "ssh-key-1",
      },
    },
    metadata: {
      saneBootstrap: true,
    },
    deployedAt: new Date("2026-02-10T00:00:00.000Z"),
    lastHealthCheck: new Date("2026-02-10T00:00:00.000Z"),
    healthStatus: "healthy",
    ...overrides,
  }
}

function makeAdapterResult(status: DeploymentAdapterResult["status"] = "active"): DeploymentAdapterResult {
  return {
    status,
    deployedAt: new Date("2026-02-12T11:00:00.000Z"),
    lastHealthCheck: new Date("2026-02-12T11:00:00.000Z"),
    healthStatus: status === "failed" ? "unhealthy" : "healthy",
    metadata: {
      mode: "test",
    },
    ...(status === "failed" ? { error: "adapter failed" } : {}),
  }
}

function applyUpdateData(
  ship: ShipUpgradeDeployment,
  data: Record<string, unknown>,
): ShipUpgradeDeployment {
  const next = {
    ...ship,
  } as ShipUpgradeDeployment

  for (const key of [
    "status",
    "shipVersion",
    "shipVersionUpdatedAt",
    "deployedAt",
    "lastHealthCheck",
    "healthStatus",
    "metadata",
  ] as const) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      ;(next as Record<string, unknown>)[key] = data[key]
    }
  }

  return next
}

function makeDeps(args: {
  ship: ShipUpgradeDeployment | null
  localResult?: Awaited<ReturnType<ShipUpgradeDeps["runLocalUpgrade"]>>
  cloudResult?: Awaited<ReturnType<ShipUpgradeDeps["runCloudUpgrade"]>>
  adapterResult?: DeploymentAdapterResult
  lockFailure?: boolean
}): {
  deps: ShipUpgradeDeps
  getCurrentShip: () => ShipUpgradeDeployment | null
  publishedStatuses: string[]
  localUpgradeCallCount: () => number
  cloudUpgradeCallCount: () => number
  lockCallCount: () => number
  resolvedCredentialCallCount: () => number
  resolvedSshCallCount: () => number
} {
  let currentShip = args.ship
  let lockCalls = 0
  let localUpgradeCalls = 0
  let cloudUpgradeCalls = 0
  let resolvedCredentialCalls = 0
  let resolvedSshCalls = 0
  const publishedStatuses: string[] = []

  const nowQueue = [
    new Date("2026-02-12T12:00:00.000Z"),
    new Date("2026-02-12T12:05:00.000Z"),
    new Date("2026-02-12T12:10:00.000Z"),
  ]

  const deps: ShipUpgradeDeps = {
    now: () => nowQueue.shift() || new Date("2026-02-12T12:11:00.000Z"),
    findOwnedShip: async ({ shipDeploymentId, userId }) => {
      if (!currentShip) {
        return null
      }
      if (currentShip.id !== shipDeploymentId || currentShip.userId !== userId) {
        return null
      }
      return currentShip
    },
    lockShipForUpgrade: async ({ ship, metadata }) => {
      lockCalls += 1
      if (args.lockFailure || !currentShip) {
        return null
      }
      if (ship.id !== currentShip.id || ship.status !== currentShip.status) {
        return null
      }
      currentShip = {
        ...currentShip,
        status: "updating",
        metadata,
      }
      return currentShip
    },
    updateShip: async ({ shipId, userId, data }) => {
      if (!currentShip || currentShip.id !== shipId || currentShip.userId !== userId) {
        throw new Error("ship missing in update")
      }
      currentShip = applyUpdateData(currentShip, data as Record<string, unknown>)
      return currentShip
    },
    listBridgeCrewContext: async () => [],
    readCloudProviderConfig: () => ({
      provider: "hetzner",
      cluster: {
        clusterName: "orchwiz-starship",
        location: "nbg1",
        networkCidr: "10.42.0.0/16",
        image: "ubuntu-24.04",
        controlPlane: {
          machineType: "cx22",
          count: 1,
        },
        workers: {
          machineType: "cx32",
          count: 2,
        },
      },
      stackMode: "full_support_systems",
      k3s: {
        channel: "stable",
        disableTraefik: true,
      },
      tunnelPolicy: {
        manage: true,
        target: "kubernetes_api",
        localPort: 16443,
      },
      sshKeyId: "ssh-key-1",
    }),
    findCloudCredential: async () => ({
      tokenEnvelope: {
        encrypted: true,
      },
    }),
    findCloudSshKey: async () => ({
      name: "shipyard-key",
      privateKeyEnvelope: {
        encrypted: true,
      },
    }),
    resolveCloudCredentialToken: async () => {
      resolvedCredentialCalls += 1
      return "hetzner-token"
    },
    resolveCloudSshPrivateKey: async () => {
      resolvedSshCalls += 1
      return "-----BEGIN OPENSSH PRIVATE KEY-----"
    },
    runLocalUpgrade: async () => {
      localUpgradeCalls += 1
      return (
        args.localResult || {
          ok: true,
          adapterResult: makeAdapterResult("active"),
        }
      )
    },
    runCloudUpgrade: async () => {
      cloudUpgradeCalls += 1
      return (
        args.cloudResult || {
          ok: true,
          metadata: {
            mode: "shipyard_cloud_test",
          },
        }
      )
    },
    runAdapterUpgrade: async () => args.adapterResult || makeAdapterResult("active"),
    publishShipUpdated: (event) => {
      publishedStatuses.push(event.status)
    },
  }

  return {
    deps,
    getCurrentShip: () => currentShip,
    publishedStatuses,
    localUpgradeCallCount: () => localUpgradeCalls,
    cloudUpgradeCallCount: () => cloudUpgradeCalls,
    lockCallCount: () => lockCalls,
    resolvedCredentialCallCount: () => resolvedCredentialCalls,
    resolvedSshCallCount: () => resolvedSshCalls,
  }
}

test("upgradeShipToLatest returns not found for unauthorized or missing ship", async () => {
  const ship = makeShip({ userId: "user-2" })
  const harness = makeDeps({ ship })

  await assert.rejects(
    () =>
      upgradeShipToLatest(
        {
          shipDeploymentId: "ship-1",
          userId: "user-1",
        },
        harness.deps,
      ),
    (error) => {
      assert.ok(error instanceof ShipUpgradeError)
      assert.equal(error.status, 404)
      assert.equal(error.code, "SHIP_NOT_FOUND")
      return true
    },
  )
})

test("upgradeShipToLatest blocks transitional statuses", async () => {
  for (const status of ["pending", "deploying", "updating"] as const) {
    const harness = makeDeps({
      ship: makeShip({
        status,
      }),
    })

    await assert.rejects(
      () =>
        upgradeShipToLatest(
          {
            shipDeploymentId: "ship-1",
            userId: "user-1",
          },
          harness.deps,
        ),
      (error) => {
        assert.ok(error instanceof ShipUpgradeError)
        assert.equal(error.status, 409)
        assert.equal(error.code, "SHIP_UPGRADE_CONFLICT")
        return true
      },
    )

    assert.equal(harness.lockCallCount(), 0)
  }
})

test("upgradeShipToLatest returns no-op when already latest", async () => {
  const harness = makeDeps({
    ship: makeShip({
      shipVersion: SHIP_LATEST_VERSION,
    }),
  })

  const result = await upgradeShipToLatest(
    {
      shipDeploymentId: "ship-1",
      userId: "user-1",
    },
    harness.deps,
  )

  assert.equal(result.upgraded, false)
  assert.equal(result.fromVersion, SHIP_LATEST_VERSION)
  assert.equal(result.toVersion, SHIP_LATEST_VERSION)
  assert.equal(harness.lockCallCount(), 0)
  assert.equal(harness.localUpgradeCallCount(), 0)
  assert.deepEqual(harness.publishedStatuses, [])
})

test("upgradeShipToLatest upgrades local ships and publishes start/completion events", async () => {
  const harness = makeDeps({
    ship: makeShip({
      deploymentProfile: "local_starship_build",
      shipVersion: "v1",
      status: "active",
    }),
  })

  const result = await upgradeShipToLatest(
    {
      shipDeploymentId: "ship-1",
      userId: "user-1",
    },
    harness.deps,
  )

  assert.equal(result.upgraded, true)
  assert.equal(result.fromVersion, "v1")
  assert.equal(result.toVersion, SHIP_LATEST_VERSION)
  assert.equal(result.deployment.shipVersion, SHIP_LATEST_VERSION)
  assert.equal(result.deployment.status, "active")
  assert.equal(result.deployment.shipVersionUpdatedAt instanceof Date, true)
  assert.equal(harness.localUpgradeCallCount(), 1)
  assert.equal(harness.cloudUpgradeCallCount(), 0)
  assert.deepEqual(harness.publishedStatuses, ["updating", "active"])

  const metadata = (result.deployment.metadata || {}) as Record<string, unknown>
  const shipUpgrade = (metadata.shipUpgrade || {}) as Record<string, unknown>
  assert.equal(shipUpgrade.status, "succeeded")
})

test("upgradeShipToLatest upgrades cloud ships using credential + ssh resolution", async () => {
  const harness = makeDeps({
    ship: makeShip({
      nodeType: "cloud",
      deploymentProfile: "cloud_shipyard",
      shipVersion: "v1",
      status: "active",
    }),
  })

  const result = await upgradeShipToLatest(
    {
      shipDeploymentId: "ship-1",
      userId: "user-1",
    },
    harness.deps,
  )

  assert.equal(result.upgraded, true)
  assert.equal(result.deployment.shipVersion, SHIP_LATEST_VERSION)
  assert.equal(harness.localUpgradeCallCount(), 0)
  assert.equal(harness.cloudUpgradeCallCount(), 1)
  assert.equal(harness.resolvedCredentialCallCount(), 1)
  assert.equal(harness.resolvedSshCallCount(), 1)
  assert.deepEqual(harness.publishedStatuses, ["updating", "active"])
})

test("upgradeShipToLatest keeps prior version on expected execution failure and records metadata", async () => {
  const harness = makeDeps({
    ship: makeShip({
      shipVersion: "v1",
      status: "active",
    }),
    localResult: {
      ok: false,
      httpStatus: 422,
      code: "LOCAL_PROVISIONING_FAILED",
      error: "Local bootstrap failed",
      details: {
        missingCommands: ["terraform"],
      },
      metadata: {
        localBootstrap: "failed",
      },
    },
  })

  await assert.rejects(
    () =>
      upgradeShipToLatest(
        {
          shipDeploymentId: "ship-1",
          userId: "user-1",
        },
        harness.deps,
      ),
    (error) => {
      assert.ok(error instanceof ShipUpgradeError)
      assert.equal(error.status, 422)
      assert.equal(error.code, "LOCAL_PROVISIONING_FAILED")
      assert.equal(error.deployment?.status, "failed")
      assert.equal(error.deployment?.shipVersion, "v1")

      const metadata = (error.deployment?.metadata || {}) as Record<string, unknown>
      const shipUpgrade = (metadata.shipUpgrade || {}) as Record<string, unknown>
      assert.equal(shipUpgrade.status, "failed")
      assert.equal(metadata.deploymentErrorCode, "LOCAL_PROVISIONING_FAILED")
      return true
    },
  )

  assert.deepEqual(harness.publishedStatuses, ["updating", "failed"])

  const finalShip = harness.getCurrentShip()
  assert.equal(finalShip?.shipVersion, "v1")
  assert.equal(finalShip?.status, "failed")
})
