import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { parseVaultId } from "@/lib/vault/config"
import { getVaultTree } from "@/lib/vault"
import { dataCoreDualReadVerifyEnabled, dataCoreEnabled } from "@/lib/data-core/config"
import { getVaultTreeFromDataCore } from "@/lib/data-core/vault-adapter"
import { logDualReadDrift } from "@/lib/data-core/dual-read"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const vaultId = parseVaultId(request.nextUrl.searchParams.get("vault"))
    if (!vaultId) {
      return NextResponse.json({ error: "Invalid vault id" }, { status: 400 })
    }

    let payload
    if (dataCoreEnabled()) {
      payload = await getVaultTreeFromDataCore({
        vaultId,
        userId: session.user.id,
      })
      if (dataCoreDualReadVerifyEnabled()) {
        const legacyPayload = await getVaultTree(vaultId).catch(() => null)
        if (legacyPayload) {
          logDualReadDrift({
            route: "/api/vaults/tree",
            key: vaultId,
            legacyPayload,
            dataCorePayload: payload,
          })
        }
      }
    } else {
      payload = await getVaultTree(vaultId)
    }
    return NextResponse.json(payload)
  } catch (error) {
    console.error("Error fetching vault tree:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
