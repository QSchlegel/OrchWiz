import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { publishNotificationUpdated } from "@/lib/realtime/notifications"
import { installVaultSeedPack, VaultSeedPackInstallError } from "@/lib/vault/packs/install"
import { listVaultSeedPacks } from "@/lib/vault/packs"
import type { VaultSeedPackInstallResponse, VaultSeedPackSummary } from "@/lib/vault/types"

export const dynamic = "force-dynamic"

interface VaultPacksSession {
  user: {
    id: string
  }
}

export interface VaultPacksRouteDeps {
  getSession: () => Promise<VaultPacksSession | null>
  listPacks: () => VaultSeedPackSummary[]
  installPack: (args: { packId: string; userId: string }) => Promise<VaultSeedPackInstallResponse>
  notifyPackInstalled: (args: { userId: string; packId: string }) => void
}

const defaultDeps: VaultPacksRouteDeps = {
  getSession: async () =>
    (await auth.api.getSession({
      headers: await headers(),
    })) as VaultPacksSession | null,
  listPacks: () => listVaultSeedPacks(),
  installPack: ({ packId, userId }) => installVaultSeedPack({ packId, userId }),
  notifyPackInstalled: ({ userId, packId }) => {
    publishNotificationUpdated({
      userId,
      channel: "vault.explorer",
      entityId: `pack:${packId}`,
    })
  },
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

export async function handleGetVaultPacks(
  deps: VaultPacksRouteDeps = defaultDeps,
) {
  try {
    const session = await deps.getSession()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    return NextResponse.json({
      packs: deps.listPacks(),
    })
  } catch (error) {
    console.error("Error listing vault seed packs:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function handlePostVaultPackInstall(
  request: NextRequest,
  deps: VaultPacksRouteDeps = defaultDeps,
) {
  try {
    const session = await deps.getSession()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = asRecord(await request.json().catch(() => ({})))
    const packId = typeof body.packId === "string" ? body.packId.trim() : ""
    if (!packId) {
      return NextResponse.json({ error: "packId is required" }, { status: 400 })
    }

    const known = deps.listPacks().some((pack) => pack.id === packId)
    if (!known) {
      return NextResponse.json({ error: "Invalid packId" }, { status: 400 })
    }

    const payload = await deps.installPack({
      packId,
      userId: session.user.id,
    })

    deps.notifyPackInstalled({
      userId: session.user.id,
      packId,
    })

    return NextResponse.json(payload, { status: 201 })
  } catch (error) {
    if (error instanceof VaultSeedPackInstallError) {
      return NextResponse.json(
        {
          error: error.message,
          failedPath: error.failedPath,
          writtenPaths: error.writtenPaths,
        },
        { status: 500 },
      )
    }

    console.error("Error installing vault seed pack:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET() {
  return handleGetVaultPacks()
}

export async function POST(request: NextRequest) {
  return handlePostVaultPackInstall(request)
}
