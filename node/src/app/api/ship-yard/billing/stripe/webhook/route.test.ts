import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { handlePostStripeWebhook } from "./route"

function requestFor(body: string, signature = "sig_test"): NextRequest {
  return new Request("http://localhost/api/ship-yard/billing/stripe/webhook", {
    method: "POST",
    headers: {
      "stripe-signature": signature,
    },
    body,
  }) as unknown as NextRequest
}

test("stripe webhook handles checkout.session.completed", async () => {
  const completedCalls: Array<Record<string, unknown>> = []

  const response = await handlePostStripeWebhook(
    requestFor("{}"),
    {
      getWebhookSecret: () => "whsec_test",
      constructEvent: () => ({
        id: "evt_1",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_1",
            amount_total: 500,
            currency: "eur",
            payment_intent: "pi_1",
          },
        },
      } as unknown as import("stripe").default.Event),
      completeTopup: async (args) => {
        completedCalls.push(args as unknown as Record<string, unknown>)
        return {
          status: "completed",
          topupId: "topup-1",
          walletId: "wallet-1",
          balanceAfterCents: 500,
        }
      },
      markTopupExpired: async () => ({ updatedCount: 0 }),
    },
  )

  assert.equal(response.status, 200)
  assert.equal(completedCalls.length, 1)
  assert.equal(completedCalls[0].stripeCheckoutSessionId, "cs_1")
  assert.equal(completedCalls[0].amountCents, 500)
})

test("stripe webhook handles checkout.session.expired", async () => {
  const expiredIds: string[] = []

  const response = await handlePostStripeWebhook(
    requestFor("{}"),
    {
      getWebhookSecret: () => "whsec_test",
      constructEvent: () => ({
        id: "evt_2",
        type: "checkout.session.expired",
        data: {
          object: {
            id: "cs_2",
            amount_total: 500,
            currency: "eur",
            payment_intent: null,
          },
        },
      } as unknown as import("stripe").default.Event),
      completeTopup: async () => ({ status: "not_found" }),
      markTopupExpired: async ({ stripeCheckoutSessionId }) => {
        expiredIds.push(stripeCheckoutSessionId)
        return { updatedCount: 1 }
      },
    },
  )

  assert.equal(response.status, 200)
  assert.deepEqual(expiredIds, ["cs_2"])
})

test("stripe webhook validates signature header presence", async () => {
  const request = new Request("http://localhost/api/ship-yard/billing/stripe/webhook", {
    method: "POST",
    body: "{}",
  }) as unknown as NextRequest

  const response = await handlePostStripeWebhook(request, {
    getWebhookSecret: () => "whsec_test",
    constructEvent: () => {
      throw new Error("unreachable")
    },
    completeTopup: async () => ({ status: "not_found" }),
    markTopupExpired: async () => ({ updatedCount: 0 }),
  })

  assert.equal(response.status, 400)
})
