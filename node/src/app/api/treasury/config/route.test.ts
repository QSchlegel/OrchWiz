import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { AccessControlError } from "@/lib/security/access-control"
import { handleGetTreasuryConfig, handlePutTreasuryConfig } from "./route"

function requestFor(body: unknown): NextRequest {
  const request = new Request("http://localhost:3000/api/treasury/config", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })

  return {
    ...request,
    headers: request.headers,
    nextUrl: new URL(request.url),
    json: request.json.bind(request),
  } as unknown as NextRequest
}

test("GET /api/treasury/config returns defaults when no config exists", async () => {
  const response = await handleGetTreasuryConfig({} as NextRequest, {
    requireActor: async () =>
      ({
        userId: "user-1",
        email: "captain@example.com",
        role: "captain",
        isAdmin: false,
      }) as any,
    getConfig: async () => null,
    upsertConfig: async () => {
      throw new Error("not used")
    },
  })

  assert.equal(response.status, 200)
  const payload = (await response.json()) as any
  assert.equal(payload.exists, false)
  assert.equal(payload.canEdit, false)
  assert.equal(payload.config.meshBaseUrl, "https://multisig.meshjs.dev")
  assert.equal(payload.config.network, "preprod")
  assert.equal(payload.config.meshWalletId, "")
  assert.equal(payload.config.updatedAt, null)
})

test("PUT /api/treasury/config returns 401 when unauthorized", async () => {
  const response = await handlePutTreasuryConfig(requestFor({}), {
    requireActor: async () => {
      throw new AccessControlError("Unauthorized", 401, "UNAUTHORIZED")
    },
    getConfig: async () => null,
    upsertConfig: async () => {
      throw new Error("not used")
    },
  })

  assert.equal(response.status, 401)
  const payload = (await response.json()) as any
  assert.equal(payload.error, "Unauthorized")
  assert.equal(payload.code, "UNAUTHORIZED")
})

test("PUT /api/treasury/config returns 403 when actor is not admin", async () => {
  const response = await handlePutTreasuryConfig(
    requestFor({ meshBaseUrl: "https://multisig.meshjs.dev", network: "preprod", meshWalletId: "abc" }),
    {
      requireActor: async () =>
        ({
          userId: "user-1",
          email: "captain@example.com",
          role: "captain",
          isAdmin: false,
        }) as any,
      getConfig: async () => null,
      upsertConfig: async () => {
        throw new Error("not used")
      },
    },
  )

  assert.equal(response.status, 403)
  const payload = (await response.json()) as any
  assert.equal(payload.code, "FORBIDDEN")
})

test("PUT /api/treasury/config upserts and normalizes meshBaseUrl", async () => {
  let captured: any

  const response = await handlePutTreasuryConfig(
    requestFor({
      meshBaseUrl: "https://multisig.meshjs.dev/",
      network: "preprod",
      meshWalletId: "wallet-123",
    }),
    {
      requireActor: async () =>
        ({
          userId: "admin-1",
          email: "admin@example.com",
          role: "admin",
          isAdmin: true,
        }) as any,
      getConfig: async () => null,
      upsertConfig: async (input) => {
        captured = input
        return {
          meshBaseUrl: input.meshBaseUrl,
          network: input.network,
          meshWalletId: input.meshWalletId,
          updatedAt: new Date("2026-02-13T00:00:00.000Z"),
        }
      },
    },
  )

  assert.equal(response.status, 200)
  assert.equal(captured.meshBaseUrl, "https://multisig.meshjs.dev")
  assert.equal(captured.updatedByUserId, "admin-1")

  const payload = (await response.json()) as any
  assert.equal(payload.exists, true)
  assert.equal(payload.canEdit, true)
  assert.equal(payload.config.meshBaseUrl, "https://multisig.meshjs.dev")
  assert.equal(payload.config.network, "preprod")
  assert.equal(payload.config.meshWalletId, "wallet-123")
  assert.equal(payload.config.updatedAt, "2026-02-13T00:00:00.000Z")
})

