import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import type { AccessActor } from "@/lib/security/access-control"
import { ShipyardBillingProviderError } from "@/lib/shipyard/billing/stripe"
import { handlePostTopup } from "./route"

const actor: AccessActor = {
  userId: "user-1",
  email: "captain@example.com",
  role: "captain",
  isAdmin: false,
}

function requestFor(body: Record<string, unknown>): NextRequest {
  return new Request("http://localhost/api/ship-yard/billing/topups", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

test("topups route validates minimum amount", async () => {
  const response = await handlePostTopup(
    requestFor({ amountEur: 1 }),
    {
      requireActor: async () => actor,
      getWallet: async () => ({ id: "wallet-1", userId: actor.userId, balanceCents: 0, currency: "eur" }),
      createTopup: async () => ({ id: "topup-1", stripeCheckoutSessionId: "pending-1" }),
      updateTopupAfterSession: async () => {},
      markTopupFailed: async () => {},
      createCheckoutSession: async () => {
        throw new Error("unreachable")
      },
      resolveReturnUrls: () => ({ successUrl: "http://localhost/ship-yard?billing=success", cancelUrl: "http://localhost/ship-yard?billing=cancel" }),
    },
  )

  assert.equal(response.status, 400)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.code, "INVALID_TOPUP_AMOUNT")
})

test("topups route returns checkout URL", async () => {
  let updatedTopupSessionId: string | null = null

  const response = await handlePostTopup(
    requestFor({ amountEur: 5 }),
    {
      requireActor: async () => actor,
      getWallet: async () => ({ id: "wallet-1", userId: actor.userId, balanceCents: 0, currency: "eur" }),
      createTopup: async () => ({ id: "topup-1", stripeCheckoutSessionId: "pending-1" }),
      updateTopupAfterSession: async ({ stripeCheckoutSessionId }) => {
        updatedTopupSessionId = stripeCheckoutSessionId
      },
      markTopupFailed: async () => {},
      createCheckoutSession: async () => ({
        id: "cs_test_1",
        url: "https://checkout.stripe.test/cs_test_1",
      } as unknown as import("stripe").Stripe.Checkout.Session),
      resolveReturnUrls: () => ({ successUrl: "http://localhost/ship-yard?billing=success", cancelUrl: "http://localhost/ship-yard?billing=cancel" }),
    },
  )

  assert.equal(response.status, 200)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.checkoutUrl, "https://checkout.stripe.test/cs_test_1")
  assert.equal(updatedTopupSessionId, "cs_test_1")
})

test("topups route returns billing provider unavailable", async () => {
  const response = await handlePostTopup(
    requestFor({ amountEur: 5 }),
    {
      requireActor: async () => actor,
      getWallet: async () => ({ id: "wallet-1", userId: actor.userId, balanceCents: 0, currency: "eur" }),
      createTopup: async () => ({ id: "topup-1", stripeCheckoutSessionId: "pending-1" }),
      updateTopupAfterSession: async () => {},
      markTopupFailed: async () => {},
      createCheckoutSession: async () => {
        throw new ShipyardBillingProviderError("Stripe billing is not configured.")
      },
      resolveReturnUrls: () => ({ successUrl: "http://localhost/ship-yard?billing=success", cancelUrl: "http://localhost/ship-yard?billing=cancel" }),
    },
  )

  assert.equal(response.status, 503)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.code, "BILLING_PROVIDER_UNAVAILABLE")
})
