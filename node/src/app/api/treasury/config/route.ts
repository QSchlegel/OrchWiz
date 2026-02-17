import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { isPrismaSchemaUnavailableError, prismaSchemaUnavailableResponse } from "@/lib/prisma-errors"
import { AccessControlError, type AccessActor, requireAccessActor } from "@/lib/security/access-control"

export const dynamic = "force-dynamic"

const TREASURY_CONFIG_KEY = "default"
const DEFAULT_MESH_BASE_URL = "https://multisig.meshjs.dev"
const DEFAULT_NETWORK = "preprod" as const

const putBodySchema = z.object({
  meshBaseUrl: z
    .string()
    .trim()
    .url()
    .refine((value) => value.startsWith("https://"), { message: "meshBaseUrl must be an https URL" }),
  network: z.enum(["preview", "preprod", "mainnet"]),
  meshWalletId: z.string().trim().min(1, "meshWalletId is required"),
})

function normalizeBaseUrl(input: string): string {
  const url = new URL(input.trim())
  if (url.protocol !== "https:") {
    throw new Error("meshBaseUrl must be an https URL")
  }
  // Remove trailing slash for stable storage.
  return url.toString().replace(/\/$/u, "")
}

type TreasuryConfigApiResponse = {
  exists: boolean
  config: {
    meshBaseUrl: string
    network: "preview" | "preprod" | "mainnet"
    meshWalletId: string
    updatedAt: string | null
  }
  canEdit: boolean
}

export interface TreasuryConfigRouteDeps {
  requireActor: () => Promise<AccessActor>
  getConfig: () => Promise<{
    meshBaseUrl: string
    network: "preview" | "preprod" | "mainnet"
    meshWalletId: string
    updatedAt: Date
  } | null>
  upsertConfig: (input: {
    meshBaseUrl: string
    network: "preview" | "preprod" | "mainnet"
    meshWalletId: string
    updatedByUserId: string
  }) => Promise<{
    meshBaseUrl: string
    network: "preview" | "preprod" | "mainnet"
    meshWalletId: string
    updatedAt: Date
  }>
}

const defaultDeps: TreasuryConfigRouteDeps = {
  requireActor: () => requireAccessActor(),
  getConfig: async () => {
    const config = await prisma.treasuryConfig.findUnique({ where: { key: TREASURY_CONFIG_KEY } })
    if (!config) return null
    return {
      meshBaseUrl: config.meshBaseUrl,
      network: config.network as "preview" | "preprod" | "mainnet",
      meshWalletId: config.meshWalletId,
      updatedAt: config.updatedAt,
    }
  },
  upsertConfig: async (input) => {
    const config = await prisma.treasuryConfig.upsert({
      where: { key: TREASURY_CONFIG_KEY },
      create: {
        key: TREASURY_CONFIG_KEY,
        backend: "mesh_multisig",
        meshBaseUrl: input.meshBaseUrl,
        network: input.network,
        meshWalletId: input.meshWalletId,
        updatedByUserId: input.updatedByUserId,
      },
      update: {
        meshBaseUrl: input.meshBaseUrl,
        network: input.network,
        meshWalletId: input.meshWalletId,
        updatedByUserId: input.updatedByUserId,
      },
    })

    return {
      meshBaseUrl: config.meshBaseUrl,
      network: config.network as "preview" | "preprod" | "mainnet",
      meshWalletId: config.meshWalletId,
      updatedAt: config.updatedAt,
    }
  },
}

export async function handleGetTreasuryConfig(
  _request: NextRequest,
  deps: TreasuryConfigRouteDeps = defaultDeps,
): Promise<NextResponse> {
  try {
    const actor = await deps.requireActor()
    const config = await deps.getConfig()

    const response: TreasuryConfigApiResponse = config
      ? {
          exists: true,
          config: {
            meshBaseUrl: config.meshBaseUrl,
            network: config.network,
            meshWalletId: config.meshWalletId,
            updatedAt: config.updatedAt.toISOString(),
          },
          canEdit: actor.isAdmin,
        }
      : {
          exists: false,
          config: {
            meshBaseUrl: DEFAULT_MESH_BASE_URL,
            network: DEFAULT_NETWORK,
            meshWalletId: "",
            updatedAt: null,
          },
          canEdit: actor.isAdmin,
        }

    return NextResponse.json(response)
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    if (isPrismaSchemaUnavailableError(error)) {
      return prismaSchemaUnavailableResponse()
    }

    console.error("Error loading treasury config:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function handlePutTreasuryConfig(
  request: NextRequest,
  deps: TreasuryConfigRouteDeps = defaultDeps,
): Promise<NextResponse> {
  try {
    const actor = await deps.requireActor()
    if (!actor.isAdmin) {
      return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const parsed = putBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", code: "INVALID_BODY", details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    let meshBaseUrl: string
    try {
      meshBaseUrl = normalizeBaseUrl(parsed.data.meshBaseUrl)
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "meshBaseUrl must be an https URL", code: "INVALID_BASE_URL" },
        { status: 400 },
      )
    }

    const updated = await deps.upsertConfig({
      meshBaseUrl,
      network: parsed.data.network,
      meshWalletId: parsed.data.meshWalletId.trim(),
      updatedByUserId: actor.userId,
    })

    const response: TreasuryConfigApiResponse = {
      exists: true,
      config: {
        meshBaseUrl: updated.meshBaseUrl,
        network: updated.network,
        meshWalletId: updated.meshWalletId,
        updatedAt: updated.updatedAt.toISOString(),
      },
      canEdit: actor.isAdmin,
    }

    return NextResponse.json(response)
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    if (isPrismaSchemaUnavailableError(error)) {
      return prismaSchemaUnavailableResponse()
    }

    console.error("Error updating treasury config:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return handleGetTreasuryConfig(request)
}

export async function PUT(request: NextRequest) {
  return handlePutTreasuryConfig(request)
}
