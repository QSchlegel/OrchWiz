import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { publishNotificationUpdated } from "@/lib/realtime/notifications"
import { parseVaultId } from "@/lib/vault/config"
import { deleteVaultFile, getVaultFile, moveVaultFile, saveVaultFile, VaultRequestError } from "@/lib/vault"
import type { VaultDeleteMode, VaultFileReadMode } from "@/lib/vault/types"

export const dynamic = "force-dynamic"

function parseFileReadMode(value: string | null): VaultFileReadMode {
  return value === "full" ? "full" : "preview"
}

function parseDeleteMode(value: string | null): VaultDeleteMode {
  return value === "hard" ? "hard" : "soft"
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const vaultId = parseVaultId(searchParams.get("vault"))
    const notePath = searchParams.get("path")
    const mode = parseFileReadMode(searchParams.get("mode"))

    if (!vaultId) {
      return NextResponse.json({ error: "Invalid vault id" }, { status: 400 })
    }

    if (!notePath) {
      return NextResponse.json({ error: "path query parameter is required" }, { status: 400 })
    }

    const payload = await getVaultFile(vaultId, notePath, { mode })
    return NextResponse.json(payload)
  } catch (error) {
    if (error instanceof VaultRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error fetching vault note:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const vaultId = parseVaultId(typeof body?.vault === "string" ? body.vault : null)
    const fromPath = typeof body?.fromPath === "string" ? body.fromPath : null
    const toPath = typeof body?.toPath === "string" ? body.toPath : null

    if (!vaultId) {
      return NextResponse.json({ error: "Invalid vault id" }, { status: 400 })
    }

    if (!fromPath || !toPath) {
      return NextResponse.json({ error: "fromPath and toPath are required" }, { status: 400 })
    }

    const payload = await moveVaultFile(vaultId, fromPath, toPath)
    publishNotificationUpdated({
      userId: session.user.id,
      channel: "vault.topology",
      entityId: `${fromPath}->${toPath}`,
    })
    return NextResponse.json(payload)
  } catch (error) {
    if (error instanceof VaultRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error moving vault note:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const vaultId = parseVaultId(searchParams.get("vault"))
    const notePath = searchParams.get("path")
    const mode = parseDeleteMode(searchParams.get("mode"))

    if (!vaultId) {
      return NextResponse.json({ error: "Invalid vault id" }, { status: 400 })
    }

    if (!notePath) {
      return NextResponse.json({ error: "path query parameter is required" }, { status: 400 })
    }

    const payload = await deleteVaultFile(vaultId, notePath, mode)
    publishNotificationUpdated({
      userId: session.user.id,
      channel: "vault.explorer",
      entityId: notePath,
    })
    return NextResponse.json(payload)
  } catch (error) {
    if (error instanceof VaultRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error deleting vault note:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const vaultId = parseVaultId(typeof body?.vault === "string" ? body.vault : null)
    const notePath = typeof body?.path === "string" ? body.path : null
    const content = typeof body?.content === "string" ? body.content : null

    if (!vaultId) {
      return NextResponse.json({ error: "Invalid vault id" }, { status: 400 })
    }

    if (!notePath) {
      return NextResponse.json({ error: "path is required" }, { status: 400 })
    }

    if (content === null) {
      return NextResponse.json({ error: "content is required" }, { status: 400 })
    }

    const payload = await saveVaultFile(vaultId, notePath, content)
    publishNotificationUpdated({
      userId: session.user.id,
      channel: "vault.explorer",
      entityId: notePath,
    })
    return NextResponse.json(payload, { status: 201 })
  } catch (error) {
    if (error instanceof VaultRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error saving vault note:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
