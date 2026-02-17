import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"

export const dynamic = "force-dynamic"

function asBridgeCrewRole(value: string | null): "xo" | "ops" | "eng" | "sec" | "med" | "cou" | null {
  if (value === "xo" || value === "ops" || value === "eng" || value === "sec" || value === "med" || value === "cou") {
    return value
  }
  return null
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAccessActor()
    const url = new URL(request.url)

    const shipDeploymentId = asNonEmptyString(url.searchParams.get("shipDeploymentId"))
    const subagentId = asNonEmptyString(url.searchParams.get("subagentId"))
    const stationKey = asBridgeCrewRole(url.searchParams.get("stationKey"))

    const config = await prisma.motionSupervisionConfig.upsert({
      where: { ownerUserId: actor.userId },
      create: { ownerUserId: actor.userId },
      update: {},
    })

    const baselines = await prisma.motionBaseline.findMany({
      where: {
        ownerUserId: actor.userId,
        ...(shipDeploymentId ? { shipDeploymentId } : {}),
        ...(subagentId ? { subagentId } : {}),
        ...(stationKey ? { stationKey } : {}),
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 200,
    })

    return NextResponse.json({
      baselines: baselines.map((baseline) => ({
        id: baseline.id,
        entityType: baseline.entityType,
        entityKey: baseline.entityKey,
        shipDeploymentId: baseline.shipDeploymentId,
        subagentId: baseline.subagentId,
        stationKey: baseline.stationKey,
        sampleCount: baseline.sampleCount,
        ready: baseline.sampleCount >= config.baselineMinSamples,
        updatedAt: baseline.updatedAt.toISOString(),
        createdAt: baseline.createdAt.toISOString(),
      })),
      baselineMinSamples: config.baselineMinSamples,
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("Error listing motion baselines:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
