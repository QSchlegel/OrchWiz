import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getVaultSummaries } from "@/lib/vault"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const summaries = await getVaultSummaries()
    return NextResponse.json(summaries)
  } catch (error) {
    console.error("Error fetching vault summaries:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
