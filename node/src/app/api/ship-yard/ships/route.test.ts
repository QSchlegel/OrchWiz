import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { AccessControlError } from "@/lib/security/access-control"
import type { ShipyardRequestActor } from "@/lib/shipyard/request-actor"
import { handleDeleteShipyardShips } from "./route"

const actor: ShipyardRequestActor = {
  userId: "user-1",
  email: "captain@example.com",
  role: "captain",
  isAdmin: false,
  authType: "user_api_key",
  keyId: "kid-1",
}

function deleteRequest(url: string): NextRequest {
  return new Request(url, {
    method: "DELETE",
  }) as unknown as NextRequest
}

test("ship-yard ships DELETE requires explicit confirmation", async () => {
  let deleteCalled = false

  const response = await handleDeleteShipyardShips(
    deleteRequest("http://localhost/api/ship-yard/ships"),
    {
      requireActor: async () => actor,
      listShips: async () => [],
      deleteShipsByIds: async () => {
        deleteCalled = true
        return 0
      },
      publishShipUpdateEvent: () => {},
      publishNotificationUpdate: () => null,
    },
  )

  assert.equal(response.status, 400)
  assert.equal(deleteCalled, false)
})

test("ship-yard ships DELETE removes all actor ships and emits updates", async () => {
  const listCalls: Array<{ userId: string; filter: { namePrefix?: string; deploymentProfile?: string } }> = []
  const deletedCalls: Array<{ userId: string; shipIds: string[] }> = []
  const shipEvents: Array<{ shipId: string; status: string; nodeId?: string | null; userId?: string | null }> = []
  const notificationCalls: Array<{ userId?: string; channel: string; action?: string; entityId?: string }> = []

  const response = await handleDeleteShipyardShips(
    deleteRequest("http://localhost/api/ship-yard/ships?confirm=delete-all&namePrefix=LocalDebugShip&deploymentProfile=local_starship_build"),
    {
      requireActor: async () => actor,
      listShips: async (userId, filter) => {
        listCalls.push({ userId, filter })
        return [
          { id: "ship-1", nodeId: "node-a" },
          { id: "ship-2", nodeId: "node-b" },
        ]
      },
      deleteShipsByIds: async (userId, shipIds) => {
        deletedCalls.push({ userId, shipIds })
        return shipIds.length
      },
      publishShipUpdateEvent: (args) => {
        shipEvents.push(args)
      },
      publishNotificationUpdate: (args) => {
        notificationCalls.push(args as { userId?: string; channel: string; action?: string; entityId?: string })
        return null
      },
    },
  )

  assert.equal(response.status, 200)
  const payload = (await response.json()) as {
    matchedCount: number
    deletedCount: number
    deletedShipIds: string[]
  }

  assert.equal(payload.matchedCount, 2)
  assert.equal(payload.deletedCount, 2)
  assert.deepEqual(payload.deletedShipIds, ["ship-1", "ship-2"])
  assert.deepEqual(listCalls, [
    {
      userId: "user-1",
      filter: {
        namePrefix: "LocalDebugShip",
        deploymentProfile: "local_starship_build",
      },
    },
  ])
  assert.deepEqual(deletedCalls, [
    { userId: "user-1", shipIds: ["ship-1", "ship-2"] },
  ])
  assert.equal(shipEvents.length, 2)
  assert.equal(shipEvents[0]?.status, "deleted")
  assert.equal(shipEvents[0]?.userId, "user-1")
  assert.equal(shipEvents[1]?.status, "deleted")
  assert.deepEqual(notificationCalls, [
    { userId: "user-1", channel: "ships", action: "clear" },
  ])
})

test("ship-yard ships DELETE validates deployment profile filter", async () => {
  const response = await handleDeleteShipyardShips(
    deleteRequest("http://localhost/api/ship-yard/ships?confirm=delete-all&deploymentProfile=unknown_profile"),
    {
      requireActor: async () => actor,
      listShips: async () => [],
      deleteShipsByIds: async () => 0,
      publishShipUpdateEvent: () => {},
      publishNotificationUpdate: () => null,
    },
  )

  assert.equal(response.status, 400)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(
    payload.error,
    "deploymentProfile must be one of: local_starship_build, cloud_shipyard",
  )
})

test("ship-yard ships DELETE surfaces access control errors", async () => {
  const response = await handleDeleteShipyardShips(
    deleteRequest("http://localhost/api/ship-yard/ships?confirm=delete-all"),
    {
      requireActor: async () => {
        throw new AccessControlError("Unauthorized", 401, "UNAUTHORIZED")
      },
      listShips: async () => [],
      deleteShipsByIds: async () => 0,
      publishShipUpdateEvent: () => {},
      publishNotificationUpdate: () => null,
    },
  )

  assert.equal(response.status, 401)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.code, "UNAUTHORIZED")
})
