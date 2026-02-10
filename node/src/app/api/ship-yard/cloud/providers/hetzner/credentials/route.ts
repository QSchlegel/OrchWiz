import { NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"
import {
  ShipyardCloudVaultError,
  storeCloudCredentialEnvelope,
  summarizeCloudSecretEnvelope,
} from "@/lib/shipyard/cloud/vault"
import { asNonEmptyString, readJsonBody } from "@/lib/shipyard/cloud/http"

export const dynamic = "force-dynamic"

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

export async function GET() {
  try {
    const actor = await requireAccessActor()

    const credentials = await prisma.shipyardCloudCredential.findUnique({
      where: {
        userId_provider: {
          userId: actor.userId,
          provider: "hetzner",
        },
      },
    })

    if (!credentials) {
      return NextResponse.json({
        provider: "hetzner",
        configured: false,
      })
    }

    return NextResponse.json({
      provider: "hetzner",
      configured: true,
      credential: {
        id: credentials.id,
        updatedAt: credentials.updatedAt.toISOString(),
        lastValidatedAt: credentials.lastValidatedAt?.toISOString() || null,
        summary: summarizeCloudSecretEnvelope(credentials.tokenEnvelope),
      },
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("Error loading Hetzner cloud credentials:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const actor = await requireAccessActor()
    const body = await readJsonBody(request)

    const token = asNonEmptyString(body.token)
    if (!token) {
      return NextResponse.json({ error: "token is required" }, { status: 400 })
    }

    const envelope = await storeCloudCredentialEnvelope({
      userId: actor.userId,
      provider: "hetzner",
      token,
    })

    const credential = await prisma.shipyardCloudCredential.upsert({
      where: {
        userId_provider: {
          userId: actor.userId,
          provider: "hetzner",
        },
      },
      update: {
        tokenEnvelope: toInputJsonValue(envelope),
      },
      create: {
        userId: actor.userId,
        provider: "hetzner",
        tokenEnvelope: toInputJsonValue(envelope),
      },
    })

    return NextResponse.json({
      provider: "hetzner",
      configured: true,
      credential: {
        id: credential.id,
        updatedAt: credential.updatedAt.toISOString(),
        summary: summarizeCloudSecretEnvelope(credential.tokenEnvelope),
      },
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    if (error instanceof ShipyardCloudVaultError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("Error saving Hetzner cloud credentials:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const actor = await requireAccessActor()

    const deleted = await prisma.shipyardCloudCredential.deleteMany({
      where: {
        userId: actor.userId,
        provider: "hetzner",
      },
    })

    return NextResponse.json({
      provider: "hetzner",
      deleted: deleted.count > 0,
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("Error deleting Hetzner cloud credentials:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
