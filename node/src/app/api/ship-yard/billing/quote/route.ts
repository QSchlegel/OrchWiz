import { NextRequest, NextResponse } from "next/server"
import type { AccessActor } from "@/lib/security/access-control"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"
import { prisma } from "@/lib/prisma"
import { getCloudProviderHandler } from "@/lib/shipyard/cloud/providers/registry"
import { normalizeCloudProviderConfig, type CloudCatalog } from "@/lib/shipyard/cloud/types"
import {
  resolveCloudCredentialToken,
  ShipyardCloudVaultError,
} from "@/lib/shipyard/cloud/vault"
import {
  buildShipyardCloudLaunchQuote,
  ShipyardBillingQuoteError,
  withWalletBalance,
} from "@/lib/shipyard/billing/pricing"
import { getOrCreateWallet } from "@/lib/shipyard/billing/wallet"

export const dynamic = "force-dynamic"

interface QuoteRequestBody {
  cloudProvider?: unknown
  forceRefresh?: boolean
}

interface QuoteCredentialsShape {
  tokenEnvelope: unknown
}

interface WalletShape {
  id: string
  userId: string
  balanceCents: number
  currency: "eur"
}

export interface ShipyardBillingQuoteRouteDeps {
  requireActor: () => Promise<AccessActor>
  getCredentials: (userId: string) => Promise<QuoteCredentialsShape | null>
  resolveToken: (args: { userId: string; stored: unknown }) => Promise<string>
  loadCatalog: (args: { token: string; forceRefresh?: boolean }) => Promise<CloudCatalog>
  getWallet: (userId: string) => Promise<WalletShape>
}

const defaultDeps: ShipyardBillingQuoteRouteDeps = {
  requireActor: requireAccessActor,
  getCredentials: async (userId) =>
    prisma.shipyardCloudCredential.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: "hetzner",
        },
      },
      select: {
        tokenEnvelope: true,
      },
    }),
  resolveToken: async ({ userId, stored }) =>
    resolveCloudCredentialToken({
      userId,
      provider: "hetzner",
      stored,
    }),
  loadCatalog: async ({ token, forceRefresh }) =>
    getCloudProviderHandler("hetzner").catalog({
      token,
      forceRefresh,
    }),
  getWallet: async (userId) => {
    const wallet = await getOrCreateWallet({ userId })
    return {
      id: wallet.id,
      userId: wallet.userId,
      balanceCents: wallet.balanceCents,
      currency: "eur",
    }
  },
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function parseBody(input: Record<string, unknown>): QuoteRequestBody {
  return {
    cloudProvider: input.cloudProvider,
    forceRefresh: input.forceRefresh === true,
  }
}

export async function handlePostQuote(
  request: NextRequest,
  deps: ShipyardBillingQuoteRouteDeps = defaultDeps,
) {
  try {
    const actor = await deps.requireActor()
    const body = parseBody(asRecord(await request.json().catch(() => ({}))))
    const cloudProvider = normalizeCloudProviderConfig(body.cloudProvider || {})

    if (cloudProvider.provider !== "hetzner") {
      throw new ShipyardBillingQuoteError("Only Hetzner cloud pricing is supported for this billing flow.")
    }

    const credentials = await deps.getCredentials(actor.userId)
    if (!credentials) {
      return NextResponse.json(
        {
          error: "Hetzner credentials are not configured.",
          code: "CLOUD_CREDENTIALS_MISSING",
        },
        { status: 400 },
      )
    }

    const [token, wallet] = await Promise.all([
      deps.resolveToken({
        userId: actor.userId,
        stored: credentials.tokenEnvelope,
      }),
      deps.getWallet(actor.userId),
    ])

    const catalog = await deps.loadCatalog({
      token,
      forceRefresh: body.forceRefresh,
    })

    const quote = buildShipyardCloudLaunchQuote({
      cloudProvider,
      catalog,
    })

    return NextResponse.json({
      wallet,
      quote: withWalletBalance(quote, wallet.balanceCents),
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    if (error instanceof ShipyardCloudVaultError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    if (error instanceof ShipyardBillingQuoteError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("Error generating Ship Yard billing quote:", error)
    return NextResponse.json(
      {
        error: "Failed to generate launch quote.",
        code: "BILLING_QUOTE_UNAVAILABLE",
      },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  return handlePostQuote(request)
}
