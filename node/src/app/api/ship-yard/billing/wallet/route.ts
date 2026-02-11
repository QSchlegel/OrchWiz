import { NextRequest, NextResponse } from "next/server"
import type { AccessActor } from "@/lib/security/access-control"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"
import {
  SHIPYARD_BILLING_CONVENIENCE_FEE_PERCENT_DISPLAY,
  SHIPYARD_BILLING_MIN_TOPUP_CENTS,
  SHIPYARD_BILLING_QUOTE_HOURS,
} from "@/lib/shipyard/billing/constants"
import { getOrCreateWallet } from "@/lib/shipyard/billing/wallet"
import { requireShipyardRequestActor } from "@/lib/shipyard/request-actor"

export const dynamic = "force-dynamic"

interface WalletShape {
  id: string
  userId: string
  balanceCents: number
  currency: "eur"
}

export interface ShipyardBillingWalletRouteDeps {
  requireActor: () => Promise<AccessActor>
  getWallet: (userId: string) => Promise<WalletShape>
}

const defaultDeps: ShipyardBillingWalletRouteDeps = {
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
}

export async function handleGetWallet(deps: ShipyardBillingWalletRouteDeps = defaultDeps) {
  try {
    const actor = await deps.requireActor()
    const wallet = await deps.getWallet(actor.userId)

    return NextResponse.json({
      wallet,
      policy: {
        minTopupCents: SHIPYARD_BILLING_MIN_TOPUP_CENTS,
        quoteHours: SHIPYARD_BILLING_QUOTE_HOURS,
        convenienceFeePercent: SHIPYARD_BILLING_CONVENIENCE_FEE_PERCENT_DISPLAY,
      },
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("Error loading Ship Yard billing wallet:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return handleGetWallet({
    ...defaultDeps,
    requireActor: async () => requireShipyardRequestActor(request),
  })
}
