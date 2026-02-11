import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { AccessControlError, type AccessActor, requireAccessActor } from "@/lib/security/access-control"
import {
  createShipyardUserApiKey,
  shipyardUserApiKeyFingerprintFromHash,
  shipyardUserApiKeyPreview,
} from "@/lib/shipyard/user-api-keys"

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

function mapApiKeyRecord(record: {
  id: string
  name: string | null
  keyId: string
  keyHash: string
  createdAt: Date
  updatedAt: Date
  lastUsedAt: Date | null
  revokedAt: Date | null
}) {
  return {
    id: record.id,
    name: record.name,
    keyId: record.keyId,
    preview: shipyardUserApiKeyPreview(record.keyId),
    fingerprint: shipyardUserApiKeyFingerprintFromHash(record.keyHash),
    status: record.revokedAt ? "revoked" : "active",
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    lastUsedAt: record.lastUsedAt?.toISOString() || null,
    revokedAt: record.revokedAt?.toISOString() || null,
  }
}

interface ShipyardApiKeyRecord {
  id: string
  name: string | null
  keyId: string
  keyHash: string
  createdAt: Date
  updatedAt: Date
  lastUsedAt: Date | null
  revokedAt: Date | null
}

export interface ShipyardApiKeysRouteDeps {
  requireActor: () => Promise<AccessActor>
  listApiKeys: (userId: string) => Promise<ShipyardApiKeyRecord[]>
  createApiKey: (args: { userId: string; name: string | null; keyId: string; keyHash: string }) => Promise<ShipyardApiKeyRecord>
}

const defaultDeps: ShipyardApiKeysRouteDeps = {
  requireActor: requireAccessActor,
  listApiKeys: async (userId) =>
    prisma.shipyardApiKey.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        name: true,
        keyId: true,
        keyHash: true,
        createdAt: true,
        updatedAt: true,
        lastUsedAt: true,
        revokedAt: true,
      },
    }),
  createApiKey: async (args) =>
    prisma.shipyardApiKey.create({
      data: {
        userId: args.userId,
        name: args.name,
        keyId: args.keyId,
        keyHash: args.keyHash,
      },
      select: {
        id: true,
        name: true,
        keyId: true,
        keyHash: true,
        createdAt: true,
        updatedAt: true,
        lastUsedAt: true,
        revokedAt: true,
      },
    }),
}

export async function handleGetShipyardApiKeys(
  deps: ShipyardApiKeysRouteDeps = defaultDeps,
) {
  try {
    const actor = await deps.requireActor()
    const keys = await deps.listApiKeys(actor.userId)

    return NextResponse.json({
      keys: keys.map(mapApiKeyRecord),
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    if (isShipyardApiKeySchemaUnavailable(error)) {
      return shipyardApiKeySchemaUnavailableResponse()
    }

    console.error("Error loading Ship Yard API keys:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function handlePostShipyardApiKeys(
  request: NextRequest,
  deps: ShipyardApiKeysRouteDeps = defaultDeps,
) {
  try {
    const actor = await deps.requireActor()
    const body = await request.json().catch(() => ({}))
    const name = asNonEmptyString(body?.name)

    const generated = createShipyardUserApiKey()
    const created = await deps.createApiKey({
      userId: actor.userId,
      name,
      keyId: generated.keyId,
      keyHash: generated.keyHash,
    })

    return NextResponse.json(
      {
        key: mapApiKeyRecord(created),
        plaintextKey: generated.plaintextKey,
      },
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    if (isShipyardApiKeySchemaUnavailable(error)) {
      return shipyardApiKeySchemaUnavailableResponse()
    }

    console.error("Error creating Ship Yard API key:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET() {
  return handleGetShipyardApiKeys()
}

export async function POST(request: NextRequest) {
  return handlePostShipyardApiKeys(request)
}
