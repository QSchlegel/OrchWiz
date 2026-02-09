import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { parseVaultId } from "@/lib/vault/config"
import { getVaultFile, saveVaultFile, VaultRequestError } from "@/lib/vault"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const vaultId = parseVaultId(searchParams.get("vault"))
    const notePath = searchParams.get("path")

    if (!vaultId) {
      return NextResponse.json({ error: "Invalid vault id" }, { status: 400 })
    }

    if (!notePath) {
      return NextResponse.json({ error: "path query parameter is required" }, { status: 400 })
    }

    const payload = await getVaultFile(vaultId, notePath)
    return NextResponse.json(payload)
  } catch (error) {
    if (error instanceof VaultRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error fetching vault note:", error)
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
    return NextResponse.json(payload, { status: 201 })
  } catch (error) {
    if (error instanceof VaultRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error saving vault note:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
