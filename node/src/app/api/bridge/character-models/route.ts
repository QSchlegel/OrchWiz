import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import type { BridgeCrewRole } from "@prisma/client"
import { BRIDGE_CREW_ROLE_ORDER } from "@/lib/shipyard/bridge-crew"

export const dynamic = "force-dynamic"

export type CharacterModelsResponse = Record<BridgeCrewRole, string | null>

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const assets = await prisma.bridgeCharacterAsset.findMany({
      select: { role: true, modelUrl: true },
    })

    const byRole = new Map<BridgeCrewRole, string>(assets.map((a) => [a.role, a.modelUrl]))
    const result: CharacterModelsResponse = {} as CharacterModelsResponse
    for (const role of BRIDGE_CREW_ROLE_ORDER) {
      result[role] = byRole.get(role) ?? null
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Error loading bridge character models:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
