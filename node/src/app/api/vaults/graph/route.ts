import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { parseVaultId } from "@/lib/vault/config"
import { getVaultGraph, VaultRequestError } from "@/lib/vault"
import { dataCoreDualReadVerifyEnabled, dataCoreEnabled } from "@/lib/data-core/config"
import { getVaultGraphFromDataCore } from "@/lib/data-core/vault-adapter"
import { logDualReadDrift } from "@/lib/data-core/dual-read"

export const dynamic = "force-dynamic"

function parseBoolean(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback
  const normalized = value.trim().toLowerCase()
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true
  if (normalized === "false" || normalized === "0" || normalized === "no") return false
  return fallback
}

function parseDepth(value: string | null): number | undefined {
  if (!value) return undefined
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return undefined
  return parsed
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const vaultId = parseVaultId(searchParams.get("vault"))

    if (!vaultId) {
      return NextResponse.json({ error: "Invalid vault id" }, { status: 400 })
    }

    const includeUnresolved = parseBoolean(searchParams.get("includeUnresolved"), true)
    const legacyOptions = {
      focusPath: searchParams.get("focusPath"),
      depth: parseDepth(searchParams.get("depth")),
      includeUnresolved,
      includeTrash: parseBoolean(searchParams.get("includeTrash"), false),
      query: searchParams.get("q") || "",
    }

    let payload
    if (dataCoreEnabled()) {
      payload = await getVaultGraphFromDataCore({
        vaultId,
        includeUnresolved,
        userId: session.user.id,
      })
      if (dataCoreDualReadVerifyEnabled()) {
        const legacyPayload = await getVaultGraph(vaultId, legacyOptions).catch(() => null)
        if (legacyPayload) {
          logDualReadDrift({
            route: "/api/vaults/graph",
            key: vaultId,
            legacyPayload,
            dataCorePayload: payload,
          })
        }
      }
    } else {
      payload = await getVaultGraph(vaultId, legacyOptions)
    }

    return NextResponse.json(payload)
  } catch (error) {
    if (error instanceof VaultRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error fetching vault graph:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
