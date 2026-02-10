import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { AccessControlError, type AccessActor } from "@/lib/security/access-control"
import { handlePostTransfer, type ShipOwnershipTransferDeps } from "./route"

const ownerActor: AccessActor = {
  userId: "owner-1",
  email: "owner@example.com",
  role: "captain",
  isAdmin: false,
}

const adminActor: AccessActor = {
  userId: "admin-1",
  email: "admin@example.com",
  role: "admin",
  isAdmin: true,
}

function makeRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/ship-yard/ownership/transfer", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

function makeDeps(overrides: Partial<ShipOwnershipTransferDeps> = {}): ShipOwnershipTransferDeps {
  return {
    requireActor: async () => ownerActor,
    findShipById: async () => ({
      id: "ship-1",
      name: "USS Regression",
      userId: ownerActor.userId,
      status: "active",
      nodeId: "node-1",
    }),
    findUserByEmail: async () => ({
      id: "captain-2",
    }),
    transferOwnership: async (args) => ({
      ship: {
        id: args.shipDeploymentId,
        name: "USS Regression",
        userId: args.newOwnerUserId,
        status: "active",
        nodeId: "node-1",
      },
      reassignedApplications: 3,
    }),
    ensureQuartermaster: async () => ({}),
    publishShipUpdateEvent: () => undefined,
    publishNotificationUpdates: () => [],
    ...overrides,
  }
}

test("ship ownership transfer succeeds for owner", async () => {
  let lookedUpEmail = ""
  const shipEvents: Array<{ userId?: string | null }> = []
  const notificationCalls: Array<{ channel: string; userIds: string[] }> = []
  const response = await handlePostTransfer(
    makeRequest({
      shipDeploymentId: "ship-1",
      targetOwnerEmail: "  NEW-OWNER@example.com ",
    }),
    makeDeps({
      findUserByEmail: async (email) => {
        lookedUpEmail = email
        return { id: "captain-2" }
      },
      publishShipUpdateEvent: (event) => {
        shipEvents.push(event)
      },
      publishNotificationUpdates: (input) => {
        notificationCalls.push({
          channel: input.channel,
          userIds: input.userIds,
        })
        return []
      },
    }),
  )

  assert.equal(response.status, 200)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.success, true)
  assert.equal(payload.transferred, true)
  assert.deepEqual(payload.ship, {
    id: "ship-1",
    name: "USS Regression",
    previousOwnerUserId: "owner-1",
    newOwnerUserId: "captain-2",
  })
  assert.deepEqual(payload.applications, { reassignedCount: 3 })
  assert.deepEqual(payload.quartermaster, { provisioned: true })
  assert.deepEqual(payload.warnings, [])
  assert.equal(lookedUpEmail, "new-owner@example.com")
  assert.deepEqual(
    shipEvents.map((event) => event.userId),
    ["owner-1", "captain-2"],
  )
  assert.deepEqual(notificationCalls, [
    { channel: "ships", userIds: ["owner-1", "captain-2"] },
    { channel: "applications", userIds: ["owner-1", "captain-2"] },
  ])
})

test("ship ownership transfer succeeds for admin on other owner ship", async () => {
  const response = await handlePostTransfer(
    makeRequest({
      shipDeploymentId: "ship-off-roster",
      targetOwnerEmail: "new-owner@example.com",
    }),
    makeDeps({
      requireActor: async () => adminActor,
      findShipById: async () => ({
        id: "ship-off-roster",
        name: "USS Off Roster",
        userId: "captain-9",
        status: "active",
        nodeId: "node-9",
      }),
      transferOwnership: async (args) => ({
        ship: {
          id: args.shipDeploymentId,
          name: "USS Off Roster",
          userId: args.newOwnerUserId,
          status: "active",
          nodeId: "node-9",
        },
        reassignedApplications: 1,
      }),
    }),
  )

  assert.equal(response.status, 200)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.transferred, true)
  assert.deepEqual(payload.ship, {
    id: "ship-off-roster",
    name: "USS Off Roster",
    previousOwnerUserId: "captain-9",
    newOwnerUserId: "captain-2",
  })
})

test("ship ownership transfer returns 401 when actor is unauthorized", async () => {
  const response = await handlePostTransfer(
    makeRequest({
      shipDeploymentId: "ship-1",
      targetOwnerEmail: "new-owner@example.com",
    }),
    makeDeps({
      requireActor: async () => {
        throw new AccessControlError("Unauthorized", 401, "UNAUTHORIZED")
      },
    }),
  )

  assert.equal(response.status, 401)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.error, "Unauthorized")
  assert.equal(payload.code, "UNAUTHORIZED")
})

test("ship ownership transfer returns 404 when ship is inaccessible to non-admin", async () => {
  const response = await handlePostTransfer(
    makeRequest({
      shipDeploymentId: "ship-1",
      targetOwnerEmail: "new-owner@example.com",
    }),
    makeDeps({
      findShipById: async () => ({
        id: "ship-1",
        name: "USS Hidden",
        userId: "owner-2",
        status: "active",
        nodeId: "node-1",
      }),
    }),
  )

  assert.equal(response.status, 404)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.error, "Ship not found")
})

test("ship ownership transfer returns 404 when target owner does not exist", async () => {
  const response = await handlePostTransfer(
    makeRequest({
      shipDeploymentId: "ship-1",
      targetOwnerEmail: "missing@example.com",
    }),
    makeDeps({
      findUserByEmail: async () => null,
    }),
  )

  assert.equal(response.status, 404)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.error, "Target user not found")
})

test("ship ownership transfer returns 400 for invalid payload", async () => {
  const response = await handlePostTransfer(
    makeRequest({
      shipDeploymentId: "",
      targetOwnerEmail: "",
    }),
    makeDeps(),
  )

  assert.equal(response.status, 400)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.error, "shipDeploymentId and targetOwnerEmail are required")
})

test("ship ownership transfer no-op response when target already owns ship", async () => {
  let transferCalled = false
  let quartermasterCalled = false

  const response = await handlePostTransfer(
    makeRequest({
      shipDeploymentId: "ship-1",
      targetOwnerEmail: "owner@example.com",
    }),
    makeDeps({
      findUserByEmail: async () => ({
        id: ownerActor.userId,
      }),
      transferOwnership: async () => {
        transferCalled = true
        return {
          ship: {
            id: "ship-1",
            name: "USS Regression",
            userId: ownerActor.userId,
            status: "active",
            nodeId: "node-1",
          },
          reassignedApplications: 99,
        }
      },
      ensureQuartermaster: async () => {
        quartermasterCalled = true
        return {}
      },
    }),
  )

  assert.equal(response.status, 200)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.success, true)
  assert.equal(payload.transferred, false)
  assert.deepEqual(payload.applications, { reassignedCount: 0 })
  assert.deepEqual(payload.quartermaster, { provisioned: false })
  assert.deepEqual(payload.warnings, [])
  assert.equal(transferCalled, false)
  assert.equal(quartermasterCalled, false)
})

test("ship ownership transfer succeeds with warning when quartermaster reprovision fails", async () => {
  const originalConsoleError = console.error
  console.error = () => {}
  try {
    const response = await handlePostTransfer(
      makeRequest({
        shipDeploymentId: "ship-1",
        targetOwnerEmail: "new-owner@example.com",
      }),
      makeDeps({
        ensureQuartermaster: async () => {
          throw new Error("quartermaster unavailable")
        },
      }),
    )

    assert.equal(response.status, 200)
    const payload = (await response.json()) as Record<string, unknown>
    assert.equal(payload.success, true)
    assert.equal(payload.transferred, true)
    assert.deepEqual(payload.quartermaster, { provisioned: false })
    assert.deepEqual(payload.warnings, [
      "Ownership transfer succeeded, but quartermaster provisioning for the new owner failed.",
    ])
  } finally {
    console.error = originalConsoleError
  }
})
