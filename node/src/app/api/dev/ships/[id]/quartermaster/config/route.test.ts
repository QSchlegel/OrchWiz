import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { AccessControlError } from "@/lib/security/access-control"
import type { ShipyardRequestActor } from "@/lib/shipyard/request-actor"
import {
  handleGetDevShipQuartermasterConfig,
  handlePutDevShipQuartermasterConfig,
  type DevShipQuartermasterConfigRouteDeps,
} from "./route"

function requestFor(body: Record<string, unknown>): NextRequest {
  return new Request("http://localhost/api/dev/ships/ship-1/quartermaster/config", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

function actor(): ShipyardRequestActor {
  return {
    userId: "user-1",
    email: "captain@example.com",
    role: "captain",
    isAdmin: false,
    authType: "user_api_key",
    keyId: "kid-1",
  }
}

function sampleState(): Awaited<ReturnType<DevShipQuartermasterConfigRouteDeps["ensureState"]>> {
  return {
    ship: {
      id: "ship-1",
      name: "USS Test",
      status: "failed",
      nodeId: "node-1",
      nodeType: "local",
      deploymentProfile: "local_starship_build",
      healthStatus: "unhealthy",
      lastHealthCheck: null,
      updatedAt: new Date("2026-02-17T10:00:00.000Z").toISOString(),
    },
    quartermaster: {
      enabled: true,
      roleKey: "qtm",
      callsign: "QTM-LGR",
      authority: "scoped_operator",
      runtimeProfile: "quartermaster",
      diagnosticsScope: "read_only",
      executionLevel: "read_only",
      loopDefaults: {
        intervalSeconds: 60,
        maxDurationSeconds: 1800,
        maxIterations: 30,
        autoStopOnHealthyActive: true,
      },
      channel: "ship-quartermaster",
      policySlug: "quartermaster-readonly",
      subagentId: "subagent-1",
      sessionId: "session-1",
      provisionedAt: new Date("2026-02-17T09:00:00.000Z").toISOString(),
    },
    subagent: {
      id: "subagent-1",
      name: "QTM",
      description: null,
    },
    session: {
      id: "session-1",
      title: "QTM",
      status: "planning",
      updatedAt: new Date("2026-02-17T10:00:00.000Z").toISOString(),
      createdAt: new Date("2026-02-17T09:00:00.000Z").toISOString(),
    },
  }
}

function createDeps(overrides: Partial<DevShipQuartermasterConfigRouteDeps> = {}): DevShipQuartermasterConfigRouteDeps {
  return {
    requireActor: async () => actor(),
    isDevRouteEnabled: () => true,
    ensureState: async () => sampleState(),
    updateConfig: async () => sampleState()!,
    ...overrides,
  }
}

test("dev quartermaster config GET returns 404 when dev routes are disabled", async () => {
  let requireActorCalled = false
  const response = await handleGetDevShipQuartermasterConfig(
    requestFor({}),
    { shipDeploymentId: "ship-1" },
    createDeps({
      isDevRouteEnabled: () => false,
      requireActor: async () => {
        requireActorCalled = true
        return actor()
      },
    }),
  )

  assert.equal(response.status, 404)
  assert.equal(requireActorCalled, false)
})

test("dev quartermaster config GET maps actor auth errors", async () => {
  const response = await handleGetDevShipQuartermasterConfig(
    requestFor({}),
    { shipDeploymentId: "ship-1" },
    createDeps({
      requireActor: async () => {
        throw new AccessControlError("Unauthorized", 401, "UNAUTHORIZED")
      },
    }),
  )

  assert.equal(response.status, 401)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.code, "UNAUTHORIZED")
})

test("dev quartermaster config PUT validates loop defaults", async () => {
  const response = await handlePutDevShipQuartermasterConfig(
    requestFor({
      executionLevel: "read_only",
      loopDefaults: {
        intervalSeconds: 1,
      },
    }),
    { shipDeploymentId: "ship-1" },
    createDeps(),
  )

  assert.equal(response.status, 400)
})

test("dev quartermaster config PUT enforces danger confirmation", async () => {
  const response = await handlePutDevShipQuartermasterConfig(
    requestFor({ executionLevel: "danger_full_access" }),
    { shipDeploymentId: "ship-1" },
    createDeps(),
  )

  assert.equal(response.status, 400)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.code, "QUARTERMASTER_DANGER_CONFIRMATION_REQUIRED")
})

test("dev quartermaster config PUT forwards actor userId and execution level", async () => {
  let seenUserId: string | null = null
  let seenExecutionLevel: string | null = null

  const response = await handlePutDevShipQuartermasterConfig(
    requestFor({
      executionLevel: "danger_full_access",
      confirmDangerous: true,
    }),
    { shipDeploymentId: "ship-1" },
    createDeps({
      updateConfig: async (args) => {
        seenUserId = args.userId
        seenExecutionLevel = args.executionLevel
        return sampleState()!
      },
    }),
  )

  assert.equal(response.status, 200)
  assert.equal(seenUserId, "user-1")
  assert.equal(seenExecutionLevel, "danger_full_access")
})
