import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { AccessControlError, type AccessActor } from "@/lib/security/access-control"
import { handlePatchShipToolRequest } from "./route"

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

test("ship tool request PATCH returns unauthorized when actor resolution fails", async () => {
  const response = await handlePatchShipToolRequest(
    requestFor("http://localhost/api/ships/ship-1/tools/requests/request-1", {
      method: "PATCH",
      body: JSON.stringify({ decision: "approve", grantMode: "ship" }),
    }),
    "ship-1",
    "request-1",
    {
      requireActor: async () => {
        throw new AccessControlError("Unauthorized", 401, "UNAUTHORIZED")
      },
      reviewRequest: async () => {
        throw new Error("should not run")
      },
      getState: async () => {
        throw new Error("should not run")
      },
    },
  )

  assert.equal(response.status, 401)
})

test("ship tool request PATCH validates decision", async () => {
  const response = await handlePatchShipToolRequest(
    requestFor("http://localhost/api/ships/ship-1/tools/requests/request-1", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ decision: "invalid" }),
    }),
    "ship-1",
    "request-1",
    {
      requireActor: async () => actor,
      reviewRequest: async () => {
        throw new Error("should not run")
      },
      getState: async () => {
        throw new Error("should not run")
      },
    },
  )

  assert.equal(response.status, 400)
  const payload = await response.json() as Record<string, unknown>
  assert.equal(payload.error, "decision must be approve or deny")
})

test("ship tool request PATCH approves and returns refreshed state", async () => {
  let receivedGrantMode: string | undefined = undefined

  const response = await handlePatchShipToolRequest(
    requestFor("http://localhost/api/ships/ship-1/tools/requests/request-1", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ decision: "approve", grantMode: "requester_only" }),
    }),
    "ship-1",
    "request-1",
    {
      requireActor: async () => actor,
      reviewRequest: async ({ grantMode }) => {
        receivedGrantMode = grantMode
        return {
          request: {
            id: "request-1",
            ownerUserId: "user-1",
            shipDeploymentId: "ship-1",
            catalogEntryId: "tool-1",
            requesterBridgeCrewId: "crew-1",
            requestedByUserId: "user-1",
            scopePreference: "requester_only",
            status: "approved",
            rationale: null,
            metadata: null,
            approvedGrantId: "grant-1",
            reviewedByUserId: "user-1",
            reviewedAt: "2026-02-11T10:00:00.000Z",
            createdAt: "2026-02-11T09:00:00.000Z",
            updatedAt: "2026-02-11T10:00:00.000Z",
            catalogEntry: {
              id: "tool-1",
              slug: "camoufox",
              name: "Camoufox",
              description: null,
              source: "curated",
              sourceKey: "key",
              repo: null,
              sourcePath: null,
              sourceRef: null,
              sourceUrl: null,
              isInstalled: true,
              isSystem: false,
              installedPath: null,
              metadata: null,
              ownerUserId: "user-1",
              lastSyncedAt: "2026-02-11T09:00:00.000Z",
              createdAt: "2026-02-11T09:00:00.000Z",
              updatedAt: "2026-02-11T09:00:00.000Z",
            },
            requesterBridgeCrew: null,
          },
          grant: null,
        }
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
      }),
    },
  )

  assert.equal(response.status, 200)
  assert.equal(receivedGrantMode, "requester_only")
})
