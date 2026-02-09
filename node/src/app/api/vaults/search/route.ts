import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { parseVaultId } from "@/lib/vault/config"
import { searchVaultNotes } from "@/lib/vault"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const vaultId = parseVaultId(searchParams.get("vault"))
    const query = searchParams.get("q") || ""

    if (!vaultId) {
      return NextResponse.json({ error: "Invalid vault id" }, { status: 400 })
    }

    const payload = await searchVaultNotes(vaultId, query)
    return NextResponse.json(payload)
  } catch (error) {
    console.error("Error searching vault notes:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
