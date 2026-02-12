import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { AccessControlError } from "@/lib/security/access-control"
import { ShipUpgradeError, type ShipUpgradeDeployment } from "@/lib/shipyard/upgrade"
import type { ShipyardRequestActor } from "@/lib/shipyard/request-actor"
import { handlePostShipUpgrade } from "./route"

const actor: ShipyardRequestActor = {
  userId: "user-1",
  email: "captain@example.com",
  role: "captain",
  isAdmin: false,
  authType: "session",
}

function requestFor(): NextRequest {
  return new Request("http://localhost/api/ship-yard/ships/ship-1/upgrade", {
    method: "POST",
  }) as unknown as NextRequest
}

function paramsFor(id = "ship-1"): { params: Promise<{ id: string }> } {
  return {
    params: Promise.resolve({
      id,
    }),
  }
}

function deployment(overrides: Partial<ShipUpgradeDeployment> = {}): ShipUpgradeDeployment {
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
    shipVersion: "v2",
    shipVersionUpdatedAt: new Date("2026-02-12T12:00:00.000Z"),
    config: {},
    metadata: {},
    deployedAt: new Date("2026-02-12T12:00:00.000Z"),
    lastHealthCheck: new Date("2026-02-12T12:00:00.000Z"),
    healthStatus: "healthy",
    ...overrides,
  }
}

test("upgrade route returns upgraded response payload", async () => {
  const response = await handlePostShipUpgrade(
    requestFor(),
    paramsFor(),
    {
      requireActor: async () => actor,
      upgradeShip: async () => ({
        upgraded: true,
        fromVersion: "v1",
        toVersion: "v2",
        deployment: deployment({ shipVersion: "v2" }),
      }),
    },
  )

  assert.equal(response.status, 200)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.success, true)
  assert.equal(payload.upgraded, true)
  assert.equal(payload.fromVersion, "v1")
  assert.equal(payload.toVersion, "v2")
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "code"), false)
  assert.equal((payload.deployment as Record<string, unknown>).shipVersion, "v2")
})

test("upgrade route returns ALREADY_LATEST for no-op upgrades", async () => {
  const response = await handlePostShipUpgrade(
    requestFor(),
    paramsFor(),
    {
      requireActor: async () => actor,
      upgradeShip: async () => ({
        upgraded: false,
        fromVersion: "v2",
        toVersion: "v2",
        deployment: deployment({ shipVersion: "v2" }),
      }),
    },
  )

  assert.equal(response.status, 200)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.success, true)
  assert.equal(payload.upgraded, false)
  assert.equal(payload.code, "ALREADY_LATEST")
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "fromVersion"), false)
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "toVersion"), false)
})

test("upgrade route surfaces unauthorized actor failures", async () => {
  const response = await handlePostShipUpgrade(
    requestFor(),
    paramsFor(),
    {
      requireActor: async () => {
        throw new AccessControlError("Unauthorized", 401, "UNAUTHORIZED")
      },
      upgradeShip: async () => {
        throw new Error("unreachable")
      },
    },
  )

  assert.equal(response.status, 401)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.code, "UNAUTHORIZED")
})

test("upgrade route returns 404 for missing scoped ship", async () => {
  const response = await handlePostShipUpgrade(
    requestFor(),
    paramsFor(),
    {
      requireActor: async () => actor,
      upgradeShip: async () => {
        throw new ShipUpgradeError("Ship not found", 404, "SHIP_NOT_FOUND")
      },
    },
  )

  assert.equal(response.status, 404)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.code, "SHIP_NOT_FOUND")
})

test("upgrade route returns 409 when ship is transitioning", async () => {
  const response = await handlePostShipUpgrade(
    requestFor(),
    paramsFor(),
    {
      requireActor: async () => actor,
      upgradeShip: async () => {
        throw new ShipUpgradeError(
          "Ship is currently transitioning; wait for status to settle before upgrading.",
          409,
          "SHIP_UPGRADE_CONFLICT",
          {
            status: "updating",
          },
          deployment({ status: "updating" }),
        )
      },
    },
  )

  assert.equal(response.status, 409)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.code, "SHIP_UPGRADE_CONFLICT")
  assert.equal((payload.details as Record<string, unknown>).status, "updating")
})

test("upgrade route returns 422 with stable code and details for expected failures", async () => {
  const response = await handlePostShipUpgrade(
    requestFor(),
    paramsFor(),
    {
      requireActor: async () => actor,
      upgradeShip: async () => {
        throw new ShipUpgradeError(
          "Cloud provider configuration is missing.",
          422,
          "CLOUD_PROVIDER_CONFIG_MISSING",
          {
            provider: "hetzner",
          },
        )
      },
    },
  )

  assert.equal(response.status, 422)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.code, "CLOUD_PROVIDER_CONFIG_MISSING")
  assert.equal((payload.details as Record<string, unknown>).provider, "hetzner")
})

test("upgrade route returns 500 for unexpected failures", async () => {
  const originalConsoleError = console.error
  console.error = () => {}

  try {
    const response = await handlePostShipUpgrade(
      requestFor(),
      paramsFor(),
      {
        requireActor: async () => actor,
        upgradeShip: async () => {
          throw new Error("boom")
        },
      },
    )

    assert.equal(response.status, 500)
    const payload = (await response.json()) as Record<string, unknown>
    assert.equal(payload.error, "Internal server error")
  } finally {
    console.error = originalConsoleError
  }
})
