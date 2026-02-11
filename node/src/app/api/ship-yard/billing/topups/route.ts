import crypto from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import type Stripe from "stripe"
import { Prisma } from "@prisma/client"
import type { AccessActor } from "@/lib/security/access-control"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"
import { prisma } from "@/lib/prisma"
import {
  SHIPYARD_BILLING_CURRENCY,
  SHIPYARD_BILLING_MIN_TOPUP_CENTS,
} from "@/lib/shipyard/billing/constants"
import {
  getOrCreateWallet,
  markTopupFailedById,
} from "@/lib/shipyard/billing/wallet"
import {
  requireStripeClient,
  resolveShipyardBillingReturnUrls,
  ShipyardBillingProviderError,
} from "@/lib/shipyard/billing/stripe"
import { requireShipyardRequestActor } from "@/lib/shipyard/request-actor"

export const dynamic = "force-dynamic"

interface TopupRequestBody {
  amountCents?: number
  amountEur?: number
}

interface WalletShape {
  id: string
  userId: string
  balanceCents: number
  currency: "eur"
}

interface CreatedTopup {
  id: string
  stripeCheckoutSessionId: string
}

export interface ShipyardBillingTopupsRouteDeps {
  requireActor: () => Promise<AccessActor>
  getWallet: (userId: string) => Promise<WalletShape>
  createTopup: (args: {
    walletId: string
    userId: string
    amountCents: number
    stripeCheckoutSessionId: string
    metadata?: Record<string, unknown>
  }) => Promise<CreatedTopup>
  updateTopupAfterSession: (args: {
    topupId: string
    stripeCheckoutSessionId: string
    metadata?: Record<string, unknown>
  }) => Promise<void>
  markTopupFailed: (args: { topupId: string; metadata?: Record<string, unknown> }) => Promise<void>
  createCheckoutSession: (args: {
    amountCents: number
    userId: string
    topupId: string
    successUrl: string
    cancelUrl: string
  }) => Promise<Stripe.Checkout.Session>
  resolveReturnUrls: (request: NextRequest) => { successUrl: string; cancelUrl: string }
}

const defaultDeps: ShipyardBillingTopupsRouteDeps = {
  requireActor: requireAccessActor,
  getWallet: async (userId) => {
    const wallet = await getOrCreateWallet({ userId })
    return {
      id: wallet.id,
      userId: wallet.userId,
      balanceCents: wallet.balanceCents,
      currency: "eur",
    }
  },
  createTopup: async (args) =>
    prisma.shipyardBillingTopup.create({
      data: {
        walletId: args.walletId,
        userId: args.userId,
        amountCents: args.amountCents,
        currency: SHIPYARD_BILLING_CURRENCY,
        status: "pending",
        stripeCheckoutSessionId: args.stripeCheckoutSessionId,
        ...(args.metadata
          ? {
              metadata: args.metadata as Prisma.InputJsonValue,
            }
          : {}),
      },
      select: {
        id: true,
        stripeCheckoutSessionId: true,
      },
    }),
  updateTopupAfterSession: async (args) => {
    await prisma.shipyardBillingTopup.update({
      where: {
        id: args.topupId,
      },
      data: {
        stripeCheckoutSessionId: args.stripeCheckoutSessionId,
        ...(args.metadata
          ? {
              metadata: args.metadata as Prisma.InputJsonValue,
            }
          : {}),
      },
    })
  },
  markTopupFailed: markTopupFailedById,
  createCheckoutSession: async (args) => {
    const stripe = requireStripeClient()
    return stripe.checkout.sessions.create({
      mode: "payment",
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: SHIPYARD_BILLING_CURRENCY,
            unit_amount: args.amountCents,
            product_data: {
              name: "OrchWiz Refueling Credits",
              description: "Prepaid credits for Cloud Ship Yard managed service launches.",
            },
          },
        },
      ],
      metadata: {
        userId: args.userId,
        topupId: args.topupId,
      },
      payment_intent_data: {
        metadata: {
          userId: args.userId,
          topupId: args.topupId,
        },
      },
    })
  },
  resolveReturnUrls: (request) =>
    resolveShipyardBillingReturnUrls({
      requestOrigin: request.nextUrl.origin,
    }),
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function parseBody(input: Record<string, unknown>): TopupRequestBody {
  return {
    amountCents: typeof input.amountCents === "number" ? input.amountCents : undefined,
    amountEur: typeof input.amountEur === "number" ? input.amountEur : undefined,
  }
}

function parseAmountCents(body: TopupRequestBody): number | null {
  if (typeof body.amountCents === "number" && Number.isFinite(body.amountCents)) {
    const rounded = Math.round(body.amountCents)
    return rounded > 0 ? rounded : null
  }

  if (typeof body.amountEur === "number" && Number.isFinite(body.amountEur)) {
    const cents = Math.round(body.amountEur * 100)
    return cents > 0 ? cents : null
  }

  return null
}

export async function handlePostTopup(
  request: NextRequest,
  deps: ShipyardBillingTopupsRouteDeps = defaultDeps,
) {
  try {
    const actor = await deps.requireActor()
    const body = parseBody(asRecord(await request.json().catch(() => ({}))))
    const amountCents = parseAmountCents(body)

    if (!amountCents || amountCents < SHIPYARD_BILLING_MIN_TOPUP_CENTS) {
      return NextResponse.json(
        {
          error: `Top-up amount must be at least €${(SHIPYARD_BILLING_MIN_TOPUP_CENTS / 100).toFixed(2)}.`,
          code: "INVALID_TOPUP_AMOUNT",
          minTopupCents: SHIPYARD_BILLING_MIN_TOPUP_CENTS,
        },
        { status: 400 },
      )
    }

    const wallet = await deps.getWallet(actor.userId)
    const placeholderSessionId = `pending_${crypto.randomUUID()}`
    const topup = await deps.createTopup({
      walletId: wallet.id,
      userId: actor.userId,
      amountCents,
      stripeCheckoutSessionId: placeholderSessionId,
    })

    try {
      const returnUrls = deps.resolveReturnUrls(request)
      const session = await deps.createCheckoutSession({
        amountCents,
        userId: actor.userId,
        topupId: topup.id,
        successUrl: returnUrls.successUrl,
        cancelUrl: returnUrls.cancelUrl,
      })

      if (!session.url || !session.id) {
        throw new Error("Stripe checkout session was created without a redirect URL.")
      }

      await deps.updateTopupAfterSession({
        topupId: topup.id,
        stripeCheckoutSessionId: session.id,
        metadata: {
          checkoutUrl: session.url,
          amountCents,
        },
      })

      return NextResponse.json({
        topupId: topup.id,
        checkoutUrl: session.url,
        amountCents,
        currency: SHIPYARD_BILLING_CURRENCY,
      })
    } catch (error) {
      await deps.markTopupFailed({
        topupId: topup.id,
        metadata: {
          error: (error as Error).message,
        },
      })
      throw error
    }
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    if (error instanceof ShipyardBillingProviderError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("Error creating Ship Yard billing top-up session:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return handlePostTopup(request, {
    ...defaultDeps,
    requireActor: async () => requireShipyardRequestActor(request),
  })
}
