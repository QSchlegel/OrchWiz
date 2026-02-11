import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { AccessControlError } from "@/lib/security/access-control"
import { getCloudProviderHandler } from "@/lib/shipyard/cloud/providers/registry"
import {
  resolveCloudCredentialToken,
  ShipyardCloudVaultError,
} from "@/lib/shipyard/cloud/vault"
import { requireShipyardRequestActor } from "@/lib/shipyard/request-actor"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const actor = await requireShipyardRequestActor(request)

    const credentials = await prisma.shipyardCloudCredential.findUnique({
      where: {
        userId_provider: {
          userId: actor.userId,
          provider: "hetzner",
        },
      },
    })

    if (!credentials) {
      return NextResponse.json(
        {
          error: "Hetzner credentials are not configured.",
          code: "CLOUD_CREDENTIALS_MISSING",
        },
        { status: 400 },
      )
    }

    const token = await resolveCloudCredentialToken({
      userId: actor.userId,
      provider: "hetzner",
      stored: credentials.tokenEnvelope,
    })

    const handler = getCloudProviderHandler("hetzner")
    const forceRefresh = request.nextUrl.searchParams.get("force") === "true"
    const catalog = await handler.catalog({
      token,
      forceRefresh,
    })

    return NextResponse.json({
      provider: "hetzner",
      catalog,
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    if (error instanceof ShipyardCloudVaultError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("Error loading Hetzner cloud catalog:", error)
    return NextResponse.json(
      {
        error: (error as Error).message || "Internal server error",
      },
      { status: 500 },
    )
  }
}
