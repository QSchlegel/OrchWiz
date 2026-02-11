import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import type { AccessActor } from "@/lib/security/access-control"
import { handlePostQuote } from "./route"

const actor: AccessActor = {
  userId: "user-1",
  email: "captain@example.com",
  role: "captain",
  isAdmin: false,
}

function requestFor(body: Record<string, unknown>): NextRequest {
  return new Request("http://localhost/api/ship-yard/billing/quote", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

test("quote route returns cloud quote with wallet shortfall", async () => {
  const response = await handlePostQuote(
    requestFor({
      cloudProvider: {
        provider: "hetzner",
        cluster: {
          location: "nbg1",
          controlPlane: { machineType: "cx22", count: 1 },
          workers: { machineType: "cx32", count: 2 },
        },
      },
    }),
    {
      requireActor: async () => actor,
      getCredentials: async () => ({ tokenEnvelope: { encrypted: true } }),
      resolveToken: async () => "token-1",
      loadCatalog: async () => ({
        fetchedAt: "2026-02-11T00:00:00.000Z",
        regions: [],
        machineTypes: [
          {
            id: "1",
            name: "cx22",
            description: "cx22",
            cpu: 2,
            memoryGb: 4,
            diskGb: 40,
            architecture: "x86",
            locations: ["nbg1"],
            priceHourlyByLocationEur: { nbg1: 0.013 },
            priceHourlyEur: 0.013,
          },
          {
            id: "2",
            name: "cx32",
            description: "cx32",
            cpu: 4,
            memoryGb: 8,
            diskGb: 80,
            architecture: "x86",
            locations: ["nbg1"],
            priceHourlyByLocationEur: { nbg1: 0.024 },
            priceHourlyEur: 0.024,
          },
        ],
        images: [],
      }),
      getWallet: async () => ({
        id: "wallet-1",
        userId: actor.userId,
        balanceCents: 2500,
        currency: "eur",
      }),
    },
  )

  assert.equal(response.status, 200)
  const payload = (await response.json()) as Record<string, unknown>
  const quote = payload.quote as Record<string, unknown>
  assert.equal(quote.currency, "eur")
  assert.equal(quote.canLaunch, false)
  assert.equal(typeof quote.shortfallCents, "number")
})

test("quote route returns missing credentials error", async () => {
  const response = await handlePostQuote(
    requestFor({ cloudProvider: {} }),
    {
      requireActor: async () => actor,
      getCredentials: async () => null,
      resolveToken: async () => "",
      loadCatalog: async () => {
        throw new Error("unreachable")
      },
      getWallet: async () => ({
        id: "wallet-1",
        userId: actor.userId,
        balanceCents: 0,
        currency: "eur",
      }),
    },
  )

  assert.equal(response.status, 400)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.code, "CLOUD_CREDENTIALS_MISSING")
})
