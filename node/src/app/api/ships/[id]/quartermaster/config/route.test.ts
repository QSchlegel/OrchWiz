import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import {
  handleGetShipQuartermasterConfig,
  handlePutShipQuartermasterConfig,
  type ShipQuartermasterConfigRouteDeps,
} from "./route"

function requestFor(body: Record<string, unknown>): NextRequest {
  return new Request("http://localhost/api/ships/ship-1/quartermaster/config", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

function sampleState(): Awaited<ReturnType<ShipQuartermasterConfigRouteDeps["ensureState"]>> {
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

function createDeps(overrides: Partial<ShipQuartermasterConfigRouteDeps> = {}): ShipQuartermasterConfigRouteDeps {
  return {
    getSessionUserId: async () => "user-1",
    ensureState: async () => sampleState(),
    updateConfig: async () => sampleState()!,
    ...overrides,
  }
}

test("ship quartermaster config GET requires authenticated session", async () => {
  const response = await handleGetShipQuartermasterConfig(
    { shipDeploymentId: "ship-1" },
    createDeps({
      getSessionUserId: async () => null,
    }),
  )

  assert.equal(response.status, 401)
})

test("ship quartermaster config GET returns 404 when ship is missing", async () => {
  const response = await handleGetShipQuartermasterConfig(
    { shipDeploymentId: "ship-1" },
    createDeps({
      ensureState: async () => null,
    }),
  )

  assert.equal(response.status, 404)
})

test("ship quartermaster config PUT requires executionLevel enum", async () => {
  const response = await handlePutShipQuartermasterConfig(
    requestFor({ executionLevel: "invalid" }),
    { shipDeploymentId: "ship-1" },
    createDeps(),
  )

  assert.equal(response.status, 400)
})

test("ship quartermaster config PUT requires danger confirmation", async () => {
  const response = await handlePutShipQuartermasterConfig(
    requestFor({ executionLevel: "danger_full_access" }),
    { shipDeploymentId: "ship-1" },
    createDeps(),
  )

  assert.equal(response.status, 400)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.code, "QUARTERMASTER_DANGER_CONFIRMATION_REQUIRED")
})

test("ship quartermaster config PUT forwards executionLevel and loop defaults", async () => {
  let seenExecutionLevel: string | null = null
  let seenLoopDefaults: Record<string, unknown> | null = null

  const response = await handlePutShipQuartermasterConfig(
    requestFor({
      executionLevel: "workspace_write",
      loopDefaults: {
        intervalSeconds: 90,
        maxDurationSeconds: 2400,
      },
    }),
    { shipDeploymentId: "ship-1" },
    createDeps({
      updateConfig: async (args) => {
        seenExecutionLevel = args.executionLevel
        seenLoopDefaults = (args.loopDefaults || null) as Record<string, unknown> | null
        return sampleState()!
      },
    }),
  )

  assert.equal(response.status, 200)
  assert.equal(seenExecutionLevel, "workspace_write")
  assert.deepEqual(seenLoopDefaults, {
    intervalSeconds: 90,
    maxDurationSeconds: 2400,
  })
})

test("ship quartermaster config PUT maps ship-not-found service errors", async () => {
  const response = await handlePutShipQuartermasterConfig(
    requestFor({ executionLevel: "read_only" }),
    { shipDeploymentId: "ship-1" },
    createDeps({
      updateConfig: async () => {
        throw new Error("Ship deployment not found for Quartermaster provisioning")
      },
    }),
  )

  assert.equal(response.status, 404)
})
