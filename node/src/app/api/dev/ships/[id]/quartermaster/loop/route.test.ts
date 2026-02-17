import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { AccessControlError } from "@/lib/security/access-control"
import type { ShipyardRequestActor } from "@/lib/shipyard/request-actor"
import {
  handleDeleteDevShipQuartermasterLoop,
  handleGetDevShipQuartermasterLoop,
  handlePostDevShipQuartermasterLoop,
  type DevShipQuartermasterLoopRouteDeps,
} from "./route"

function requestFor(body: Record<string, unknown>): NextRequest {
  return new Request("http://localhost/api/dev/ships/ship-1/quartermaster/loop", {
    method: "POST",
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

function sampleLoopStatus(): Awaited<ReturnType<DevShipQuartermasterLoopRouteDeps["getLoopStatus"]>> {
  return {
    activeRun: null,
    recentRuns: [],
  }
}

function createDeps(overrides: Partial<DevShipQuartermasterLoopRouteDeps> = {}): DevShipQuartermasterLoopRouteDeps {
  return {
    requireActor: async () => actor(),
    isDevRouteEnabled: () => true,
    getLoopStatus: async () => sampleLoopStatus(),
    startLoop: async () => sampleLoopStatus(),
    stopLoop: async () => sampleLoopStatus(),
    ...overrides,
  }
}

test("dev quartermaster loop GET returns 404 when dev routes are disabled", async () => {
  let requireActorCalled = false
  const response = await handleGetDevShipQuartermasterLoop(
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

test("dev quartermaster loop GET maps actor auth errors", async () => {
  const response = await handleGetDevShipQuartermasterLoop(
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

test("dev quartermaster loop POST validates prompt", async () => {
  const response = await handlePostDevShipQuartermasterLoop(
    requestFor({ prompt: "   " }),
    { shipDeploymentId: "ship-1" },
    createDeps(),
  )

  assert.equal(response.status, 400)
})

test("dev quartermaster loop POST validates loop defaults", async () => {
  const response = await handlePostDevShipQuartermasterLoop(
    requestFor({
      prompt: "diagnose",
      loopDefaults: {
        maxDurationSeconds: 1,
      },
    }),
    { shipDeploymentId: "ship-1" },
    createDeps(),
  )

  assert.equal(response.status, 400)
})

test("dev quartermaster loop POST forwards actor user and execution level", async () => {
  let seenUserId: string | null = null
  let seenExecutionLevel: string | undefined

  const response = await handlePostDevShipQuartermasterLoop(
    requestFor({
      prompt: "diagnose",
      executionLevel: "danger_full_access",
    }),
    { shipDeploymentId: "ship-1" },
    createDeps({
      startLoop: async (args) => {
        seenUserId = args.userId
        seenExecutionLevel = args.executionLevel
        return sampleLoopStatus()
      },
    }),
  )

  assert.equal(response.status, 202)
  assert.equal(seenUserId, "user-1")
  assert.equal(seenExecutionLevel, "danger_full_access")
})

test("dev quartermaster loop DELETE calls stop loop", async () => {
  let seenShipDeploymentId: string | null = null

  const response = await handleDeleteDevShipQuartermasterLoop(
    requestFor({}),
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
