import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { AccessControlError, type AccessActor } from "@/lib/security/access-control"
import { handleGetShipTools } from "./route"

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

test("ship tools GET returns unauthorized when actor resolution fails", async () => {
  const response = await handleGetShipTools(
    requestFor("http://localhost/api/ships/ship-1/tools"),
    "ship-1",
    {
      requireActor: async () => {
        throw new AccessControlError("Unauthorized", 401, "UNAUTHORIZED")
      },
      getState: async () => {
        throw new Error("should not run")
      },
    },
  )

  assert.equal(response.status, 401)
  const payload = await response.json() as Record<string, unknown>
  assert.equal(payload.code, "UNAUTHORIZED")
})

test("ship tools GET returns owner-scoped state", async () => {
  let receivedOwnerUserId = ""
  let receivedShipDeploymentId = ""

  const response = await handleGetShipTools(
    requestFor("http://localhost/api/ships/ship-1/tools"),
    "ship-1",
    {
      requireActor: async () => actor,
      getState: async ({ ownerUserId, shipDeploymentId }) => {
        receivedOwnerUserId = ownerUserId
        receivedShipDeploymentId = shipDeploymentId
        return {
          ship: {
            id: "ship-1",
            name: "USS Test",
            userId: "user-1",
          },
          catalog: [],
          grants: [],
          requests: [],
          bridgeCrew: [],
        }
      },
    },
  )

  assert.equal(response.status, 200)
  assert.equal(receivedOwnerUserId, "user-1")
  assert.equal(receivedShipDeploymentId, "ship-1")
})
