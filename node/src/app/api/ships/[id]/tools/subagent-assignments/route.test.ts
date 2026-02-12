import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { AccessControlError } from "@/lib/security/access-control"
import {
  handleGetShipSubagentAssignments,
  handlePutShipSubagentAssignments,
} from "./route"

function requestFor(url: string, init?: RequestInit): NextRequest {
  const request = new Request(url, init)
  return {
    ...request,
    headers: request.headers,
    json: request.json.bind(request),
    nextUrl: new URL(url),
  } as unknown as NextRequest
}

const actor = {
  userId: "user-1",
  email: "captain@example.com",
  role: "captain" as const,
  isAdmin: false,
}

const sampleAssignments = [
  {
    id: "assignment-1",
    ownerUserId: "user-1",
    shipDeploymentId: "ship-1",
    bridgeCrewId: "crew-1",
    subagentId: "sub-1",
    assignedByUserId: "user-1",
    assignedByBridgeCrewId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    bridgeCrew: {
      id: "crew-1",
      role: "ops",
      callsign: "OPS-ARX",
      name: "Operations",
    },
    subagent: {
      id: "sub-1",
      name: "ops-helper",
      subagentType: "general",
    },
  },
]

test("ship subagent assignments GET returns unauthorized when actor resolution fails", async () => {
  const response = await handleGetShipSubagentAssignments(
    requestFor("http://localhost/api/ships/ship-1/tools/subagent-assignments"),
    "ship-1",
    {
      requireActor: async () => {
        throw new AccessControlError("Unauthorized", 401, "UNAUTHORIZED")
      },
      listAssignments: async () => {
        throw new Error("should not run")
      },
      replaceAssignments: async () => {
        throw new Error("should not run")
      },
      publishNotificationUpdated: () => null,
    },
  )

  assert.equal(response.status, 401)
})

test("ship subagent assignments GET returns assignment list", async () => {
  const response = await handleGetShipSubagentAssignments(
    requestFor("http://localhost/api/ships/ship-1/tools/subagent-assignments"),
    "ship-1",
    {
      requireActor: async () => actor,
      listAssignments: async () => sampleAssignments,
      replaceAssignments: async () => sampleAssignments,
      publishNotificationUpdated: () => null,
    },
  )

  assert.equal(response.status, 200)
  const payload = await response.json() as { assignments: unknown[] }
  assert.equal(Array.isArray(payload.assignments), true)
  assert.equal(payload.assignments.length, 1)
})

test("ship subagent assignments PUT forwards acting bridge crew id and assignments", async () => {
  let capturedActingBridgeCrewId: string | null | undefined = undefined

  const response = await handlePutShipSubagentAssignments(
    requestFor("http://localhost/api/ships/ship-1/tools/subagent-assignments", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actingBridgeCrewId: "crew-xo",
        assignments: [
          {
            bridgeCrewId: "crew-1",
            subagentId: "sub-1",
          },
        ],
      }),
    }),
    "ship-1",
    {
      requireActor: async () => actor,
      listAssignments: async () => sampleAssignments,
      replaceAssignments: async ({ actingBridgeCrewId }) => {
        capturedActingBridgeCrewId = actingBridgeCrewId
        return sampleAssignments
      },
      publishNotificationUpdated: () => null,
    },
  )

  assert.equal(response.status, 200)
  assert.equal(capturedActingBridgeCrewId, "crew-xo")
})
