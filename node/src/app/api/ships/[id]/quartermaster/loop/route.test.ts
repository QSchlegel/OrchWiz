import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import {
  handleDeleteShipQuartermasterLoop,
  handleGetShipQuartermasterLoop,
  handlePostShipQuartermasterLoop,
  type ShipQuartermasterLoopRouteDeps,
} from "./route"

function requestFor(body: Record<string, unknown>): NextRequest {
  return new Request("http://localhost/api/ships/ship-1/quartermaster/loop", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

function sampleLoopStatus(): Awaited<ReturnType<ShipQuartermasterLoopRouteDeps["getLoopStatus"]>> {
  return {
    activeRun: null,
    recentRuns: [],
  }
}

function createDeps(overrides: Partial<ShipQuartermasterLoopRouteDeps> = {}): ShipQuartermasterLoopRouteDeps {
  return {
    getSessionUserId: async () => "user-1",
    getLoopStatus: async () => sampleLoopStatus(),
    startLoop: async () => sampleLoopStatus(),
    stopLoop: async () => sampleLoopStatus(),
    ...overrides,
  }
}

test("ship quartermaster loop GET requires authenticated session", async () => {
  const response = await handleGetShipQuartermasterLoop(
    { shipDeploymentId: "ship-1" },
    createDeps({
      getSessionUserId: async () => null,
    }),
  )

  assert.equal(response.status, 401)
})

test("ship quartermaster loop POST validates prompt", async () => {
  const response = await handlePostShipQuartermasterLoop(
    requestFor({ prompt: "   " }),
    { shipDeploymentId: "ship-1" },
    createDeps(),
  )

  assert.equal(response.status, 400)
})

test("ship quartermaster loop POST validates executionLevel", async () => {
  const response = await handlePostShipQuartermasterLoop(
    requestFor({ prompt: "debug", executionLevel: "bad" }),
    { shipDeploymentId: "ship-1" },
    createDeps(),
  )

  assert.equal(response.status, 400)
})

test("ship quartermaster loop POST forwards executionLevel and loop defaults", async () => {
  let seenExecutionLevel: string | undefined
  let seenLoopDefaults: Record<string, unknown> | null = null

  const response = await handlePostShipQuartermasterLoop(
    requestFor({
      prompt: "diagnose continuously",
      executionLevel: "workspace_write",
      loopDefaults: {
        maxIterations: 15,
      },
    }),
    { shipDeploymentId: "ship-1" },
    createDeps({
      startLoop: async (args) => {
        seenExecutionLevel = args.executionLevel
        seenLoopDefaults = (args.loopDefaults || null) as Record<string, unknown> | null
        return sampleLoopStatus()
      },
    }),
  )

  assert.equal(response.status, 202)
  assert.equal(seenExecutionLevel, "workspace_write")
  assert.deepEqual(seenLoopDefaults, { maxIterations: 15 })
})

test("ship quartermaster loop POST maps ship not found errors", async () => {
  const response = await handlePostShipQuartermasterLoop(
    requestFor({ prompt: "diagnose continuously" }),
    { shipDeploymentId: "ship-1" },
    createDeps({
      startLoop: async () => {
        throw new Error("Ship deployment not found for Quartermaster provisioning")
      },
    }),
  )

  assert.equal(response.status, 404)
})

test("ship quartermaster loop DELETE calls stop loop for the ship", async () => {
  let seenShipDeploymentId: string | null = null

  const response = await handleDeleteShipQuartermasterLoop(
    { shipDeploymentId: "ship-1" },
    createDeps({
      stopLoop: async (args) => {
        seenShipDeploymentId = args.shipDeploymentId
        return sampleLoopStatus()
      },
    }),
  )

  assert.equal(response.status, 200)
  assert.equal(seenShipDeploymentId, "ship-1")
})
