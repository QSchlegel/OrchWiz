import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { AccessControlError } from "@/lib/security/access-control"
import { handlePatchSkillCatalogActivation } from "./route"

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

test("skill activation PATCH returns unauthorized when actor resolution fails", async () => {
  const response = await handlePatchSkillCatalogActivation(
    requestFor("http://localhost/api/skills/catalog/skill-1/activation", {
      method: "PATCH",
      body: JSON.stringify({
        decision: "approve",
        rationale: "required",
      }),
    }),
    "skill-1",
    {
      requireActor: async () => {
        throw new AccessControlError("Unauthorized", 401, "UNAUTHORIZED")
      },
      decideActivation: async () => {
        throw new Error("should not run")
      },
      publishNotificationUpdated: () => null,
    },
  )

  assert.equal(response.status, 401)
})

test("skill activation PATCH validates rationale", async () => {
  const response = await handlePatchSkillCatalogActivation(
    requestFor("http://localhost/api/skills/catalog/skill-1/activation", {
      method: "PATCH",
      body: JSON.stringify({
        decision: "approve",
      }),
    }),
    "skill-1",
    {
      requireActor: async () => actor,
      decideActivation: async () => {
        throw new Error("should not run")
      },
      publishNotificationUpdated: () => null,
    },
  )

  assert.equal(response.status, 400)
  const payload = await response.json() as Record<string, unknown>
  assert.equal(payload.error, "rationale is required")
})

test("skill activation PATCH forwards acting context and returns entry", async () => {
  let capturedActingBridgeCrewId: string | null | undefined = undefined

  const response = await handlePatchSkillCatalogActivation(
    requestFor("http://localhost/api/skills/catalog/skill-1/activation", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        decision: "deny",
        rationale: "Not ready for production",
        actingBridgeCrewId: "crew-xo",
      }),
    }),
    "skill-1",
    {
      requireActor: async () => actor,
      decideActivation: async ({ actingBridgeCrewId }) => {
        capturedActingBridgeCrewId = actingBridgeCrewId
        return {
          id: "skill-1",
        } as any
      },
      publishNotificationUpdated: () => null,
    },
  )

  assert.equal(response.status, 200)
  assert.equal(capturedActingBridgeCrewId, "crew-xo")
})
