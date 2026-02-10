import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getVaultSummaries } from "@/lib/vault"
import { dataCoreDualReadVerifyEnabled, dataCoreEnabled } from "@/lib/data-core/config"
import { getVaultSummariesFromDataCore } from "@/lib/data-core/vault-adapter"
import { logDualReadDrift } from "@/lib/data-core/dual-read"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let summaries
    if (dataCoreEnabled()) {
      summaries = await getVaultSummariesFromDataCore()
      if (dataCoreDualReadVerifyEnabled()) {
        const legacySummaries = await getVaultSummaries().catch(() => null)
        if (legacySummaries) {
          logDualReadDrift({
            route: "/api/vaults",
            key: "summaries",
            legacyPayload: legacySummaries,
            dataCorePayload: summaries,
          })
        }
      }
    } else {
      summaries = await getVaultSummaries()
    }
    return NextResponse.json(summaries)
  } catch (error) {
    console.error("Error fetching vault summaries:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
