import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { parseVaultId } from "@/lib/vault/config"
import { searchVaultNotes } from "@/lib/vault"
import { resolveVaultRagMode } from "@/lib/vault/rag"

export const dynamic = "force-dynamic"

function parseTopK(value: string | null): number | undefined {
  if (!value) return undefined
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return undefined
  return Math.max(1, Math.min(100, parsed))
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const vaultId = parseVaultId(searchParams.get("vault"))
    const query = searchParams.get("q") || ""
    const mode = resolveVaultRagMode(searchParams.get("mode"))
    const k = parseTopK(searchParams.get("k"))

    if (!vaultId) {
      return NextResponse.json({ error: "Invalid vault id" }, { status: 400 })
    }

    const payload = await searchVaultNotes(vaultId, query, { mode, k })
    return NextResponse.json(payload)
  } catch (error) {
    console.error("Error searching vault notes:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
