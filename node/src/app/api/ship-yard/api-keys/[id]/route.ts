import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { AccessControlError, type AccessActor, requireAccessActor } from "@/lib/security/access-control"

export const dynamic = "force-dynamic"

function isShipyardApiKeySchemaUnavailable(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false
  }

  const code = (error as { code?: unknown }).code
  return code === "P2021" || code === "P2022"
}

function shipyardApiKeySchemaUnavailableResponse() {
  return NextResponse.json(
    {
      error:
        "Ship Yard API key storage is not ready. Sync your database schema (for local dev run `npm run db:push`).",
    },
    { status: 503 },
  )
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export interface ShipyardApiKeysByIdRouteDeps {
  requireActor: () => Promise<AccessActor>
  findApiKey: (args: { id: string; userId: string }) => Promise<{ id: string; revokedAt: Date | null } | null>
  revokeApiKey: (id: string) => Promise<void>
}

const defaultDeps: ShipyardApiKeysByIdRouteDeps = {
  requireActor: requireAccessActor,
  findApiKey: async (args) =>
    prisma.shipyardApiKey.findFirst({
      where: {
        id: args.id,
        userId: args.userId,
      },
      select: {
        id: true,
        revokedAt: true,
      },
    }),
  revokeApiKey: async (id) => {
    await prisma.shipyardApiKey.update({
      where: {
        id,
      },
      data: {
        revokedAt: new Date(),
      },
    })
  },
}

export async function handleDeleteShipyardApiKey(
  _request: NextRequest,
  context: {
    params: Promise<{ id: string }>
  },
  deps: ShipyardApiKeysByIdRouteDeps = defaultDeps,
) {
  try {
    const actor = await deps.requireActor()
    const params = await context.params
    const keyId = asNonEmptyString(params.id)
    if (!keyId) {
      return NextResponse.json({ error: "Invalid key id" }, { status: 400 })
    }

    const existing = await deps.findApiKey({
      id: keyId,
      userId: actor.userId,
    })

    if (!existing) {
      return NextResponse.json({ error: "API key not found" }, { status: 404 })
    }

    if (existing.revokedAt) {
      return NextResponse.json({
        revoked: true,
        alreadyRevoked: true,
      })
    }

    await deps.revokeApiKey(existing.id)

    return NextResponse.json({
      revoked: true,
      alreadyRevoked: false,
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    if (isShipyardApiKeySchemaUnavailable(error)) {
      return shipyardApiKeySchemaUnavailableResponse()
    }

    console.error("Error revoking Ship Yard API key:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  context: {
    params: Promise<{ id: string }>
  },
) {
  return handleDeleteShipyardApiKey(request, context)
}
