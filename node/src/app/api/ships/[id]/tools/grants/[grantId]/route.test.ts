import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { AccessControlError, type AccessActor } from "@/lib/security/access-control"
import { handleDeleteShipToolGrant } from "./route"

const actor: AccessActor = {
  userId: "user-1",
  email: "captain@example.com",
  role: "captain",
  isAdmin: false,
}

function requestFor(url: string, init?: RequestInit): NextRequest {
  const request = new Request(url, init)
  return {
    ...request,
    headers: request.headers,
    json: request.json.bind(request),
    nextUrl: new URL(url),
  } as unknown as NextRequest
}

test("ship tool grants DELETE returns unauthorized when actor resolution fails", async () => {
  const response = await handleDeleteShipToolGrant(
    requestFor("http://localhost/api/ships/ship-1/tools/grants/grant-1", { method: "DELETE" }),
    "ship-1",
    "grant-1",
    {
      requireActor: async () => {
        throw new AccessControlError("Unauthorized", 401, "UNAUTHORIZED")
      },
      revokeGrant: async () => {
        throw new Error("should not run")
      },
      getState: async () => {
        throw new Error("should not run")
      },
    },
  )

  assert.equal(response.status, 401)
})

test("ship tool grants DELETE revokes and returns refreshed state", async () => {
  let receivedGrantId = ""
  let receivedActingBridgeCrewId: string | null | undefined
  let receivedRevokeReason: string | null | undefined

  const response = await handleDeleteShipToolGrant(
    requestFor("http://localhost/api/ships/ship-1/tools/grants/grant-1", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actingBridgeCrewId: "crew-1",
        revokeReason: "Rotating duty assignment",
      }),
    }),
    "ship-1",
    "grant-1",
    {
      requireActor: async () => actor,
      revokeGrant: async ({ grantId, actingBridgeCrewId, revokeReason }) => {
        receivedGrantId = grantId
        receivedActingBridgeCrewId = actingBridgeCrewId
        receivedRevokeReason = revokeReason
      },
      getState: async () => ({
        ship: {
          id: "ship-1",
          name: "USS Test",
          userId: "user-1",
        },
        catalog: [],
        grants: [],
        requests: [],
        bridgeCrew: [],
        subagentAssignments: [],
        governanceEvents: [],
      }),
    },
  )

  assert.equal(response.status, 200)
  assert.equal(receivedGrantId, "grant-1")
  assert.equal(receivedActingBridgeCrewId, "crew-1")
  assert.equal(receivedRevokeReason, "Rotating duty assignment")
  const payload = await response.json() as Record<string, unknown>
  assert.equal(payload.success, true)
})
