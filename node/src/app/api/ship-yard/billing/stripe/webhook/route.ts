import { NextRequest, NextResponse } from "next/server"
import type Stripe from "stripe"
import { SHIPYARD_BILLING_CURRENCY } from "@/lib/shipyard/billing/constants"
import {
  completeTopupFromStripeSession,
  markTopupExpiredByStripeSession,
  type CompleteTopupResult,
} from "@/lib/shipyard/billing/wallet"
import {
  requireStripeClient,
  requireStripeWebhookSecret,
  ShipyardBillingProviderError,
} from "@/lib/shipyard/billing/stripe"

export const dynamic = "force-dynamic"

interface StripeCheckoutSessionLike {
  id: string
  amount_total: number | null
  currency: string | null
  payment_intent: string | Stripe.PaymentIntent | null
}

export interface ShipyardBillingStripeWebhookDeps {
  getWebhookSecret: () => string
  constructEvent: (payload: string, signature: string, secret: string) => Stripe.Event
  completeTopup: (args: {
    stripeCheckoutSessionId: string
    amountCents: number
    currency: "eur"
    stripePaymentIntentId?: string | null
    metadata?: Record<string, unknown>
  }) => Promise<CompleteTopupResult>
  markTopupExpired: (args: { stripeCheckoutSessionId: string }) => Promise<{ updatedCount: number }>
}

const defaultDeps: ShipyardBillingStripeWebhookDeps = {
  getWebhookSecret: () => requireStripeWebhookSecret(),
  constructEvent: (payload, signature, secret) => {
    const stripe = requireStripeClient()
    return stripe.webhooks.constructEvent(payload, signature, secret)
  },
  completeTopup: completeTopupFromStripeSession,
  markTopupExpired: markTopupExpiredByStripeSession,
}

function toStripeCheckoutSession(payload: Stripe.Event): StripeCheckoutSessionLike | null {
  const rawCandidate = payload.data?.object as unknown
  if (!rawCandidate || typeof rawCandidate !== "object" || Array.isArray(rawCandidate)) {
    return null
  }
  const candidate = rawCandidate as Record<string, unknown>

  const id = typeof candidate.id === "string" ? candidate.id : ""
  if (!id) {
    return null
  }

  const paymentIntentRaw = candidate.payment_intent

  return {
    id,
    amount_total: typeof candidate.amount_total === "number" ? candidate.amount_total : null,
    currency: typeof candidate.currency === "string" ? candidate.currency : null,
    payment_intent:
      typeof paymentIntentRaw === "string" || (paymentIntentRaw && typeof paymentIntentRaw === "object")
        ? (paymentIntentRaw as string | Stripe.PaymentIntent)
        : null,
  }
}

function paymentIntentId(paymentIntent: string | Stripe.PaymentIntent | null): string | null {
  if (!paymentIntent) {
    return null
  }
  if (typeof paymentIntent === "string") {
    return paymentIntent
  }
  return typeof paymentIntent.id === "string" ? paymentIntent.id : null
}

export async function handlePostStripeWebhook(
  request: NextRequest,
  deps: ShipyardBillingStripeWebhookDeps = defaultDeps,
) {
  try {
    const signature = request.headers.get("stripe-signature")
    if (!signature) {
      return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 })
    }

    const payload = await request.text()
    const webhookSecret = deps.getWebhookSecret()

    let event: Stripe.Event
    try {
      event = deps.constructEvent(payload, signature, webhookSecret)
    } catch (error) {
      return NextResponse.json(
        {
          error: (error as Error).message || "Invalid Stripe webhook payload",
        },
        { status: 400 },
      )
    }

    if (event.type === "checkout.session.completed") {
      const session = toStripeCheckoutSession(event)
      if (session?.id && session.amount_total && session.amount_total > 0) {
        const currency = (session.currency || "").toLowerCase()
        if (currency === SHIPYARD_BILLING_CURRENCY) {
          await deps.completeTopup({
            stripeCheckoutSessionId: session.id,
            amountCents: Math.round(session.amount_total),
            currency: SHIPYARD_BILLING_CURRENCY,
            stripePaymentIntentId: paymentIntentId(session.payment_intent),
            metadata: {
              stripeEventId: event.id,
              stripeEventType: event.type,
            },
          })
        }
      }
    }

    if (event.type === "checkout.session.expired") {
      const session = toStripeCheckoutSession(event)
      if (session?.id) {
        await deps.markTopupExpired({
          stripeCheckoutSessionId: session.id,
        })
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    if (error instanceof ShipyardBillingProviderError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("Error processing Ship Yard Stripe webhook:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return handlePostStripeWebhook(request)
}
