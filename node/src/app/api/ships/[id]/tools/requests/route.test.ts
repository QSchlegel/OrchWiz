import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { AccessControlError, type AccessActor } from "@/lib/security/access-control"
import { handlePostShipToolRequest } from "./route"

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

test("ship tools requests POST returns unauthorized when actor resolution fails", async () => {
  const response = await handlePostShipToolRequest(
    requestFor("http://localhost/api/ships/ship-1/tools/requests", {
      method: "POST",
      body: JSON.stringify({ catalogEntryId: "tool-1" }),
    }),
    "ship-1",
    {
      requireActor: async () => {
        throw new AccessControlError("Unauthorized", 401, "UNAUTHORIZED")
      },
      createRequest: async () => {
        throw new Error("should not run")
      },
      getState: async () => {
        throw new Error("should not run")
      },
    },
  )

  assert.equal(response.status, 401)
})

test("ship tools requests POST validates catalogEntryId", async () => {
  const response = await handlePostShipToolRequest(
    requestFor("http://localhost/api/ships/ship-1/tools/requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ rationale: "Need this" }),
    }),
    "ship-1",
    {
      requireActor: async () => actor,
      createRequest: async () => {
        throw new Error("should not run")
      },
      getState: async () => {
        throw new Error("should not run")
      },
    },
  )

  assert.equal(response.status, 400)
  const payload = await response.json() as Record<string, unknown>
  assert.equal(payload.error, "catalogEntryId is required")
})

test("ship tools requests POST returns created request and refreshed state", async () => {
  let receivedScopePreference = ""

  const response = await handlePostShipToolRequest(
    requestFor("http://localhost/api/ships/ship-1/tools/requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        catalogEntryId: "tool-1",
        requesterBridgeCrewId: "crew-1",
        scopePreference: "ship",
        rationale: "Needed for diagnostics",
      }),
    }),
    "ship-1",
    {
      requireActor: async () => actor,
      createRequest: async ({ scopePreference }) => {
        receivedScopePreference = scopePreference || ""
        return {
          id: "request-1",
          ownerUserId: "user-1",
          shipDeploymentId: "ship-1",
          catalogEntryId: "tool-1",
          requesterBridgeCrewId: "crew-1",
          requestedByUserId: "user-1",
          scopePreference: "ship",
          status: "pending",
          rationale: "Needed for diagnostics",
          metadata: null,
          approvedGrantId: null,
          reviewedByUserId: null,
          reviewedAt: null,
          createdAt: "2026-02-11T10:00:00.000Z",
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
            activationStatus: "approved",
            activationRationale: null,
            activatedAt: null,
            activatedByUserId: null,
            activatedByBridgeCrewId: null,
            activationSecurityReportId: null,
            metadata: null,
            ownerUserId: "user-1",
            lastSyncedAt: "2026-02-11T09:00:00.000Z",
            createdAt: "2026-02-11T09:00:00.000Z",
            updatedAt: "2026-02-11T09:00:00.000Z",
          },
          requesterBridgeCrew: {
            id: "crew-1",
            role: "ops",
            callsign: "OPS-ARX",
            name: "Operations",
          },
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
        subagentAssignments: [],
        governanceEvents: [],
      }),
    },
  )

  assert.equal(response.status, 201)
  assert.equal(receivedScopePreference, "ship")
})
