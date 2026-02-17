import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"

export const dynamic = "force-dynamic"

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asPositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(500, parsed)
}

function parseDecisionFilter(value: string | null): Array<"warn" | "block"> | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  if (normalized === "warn") return ["warn"]
  if (normalized === "block") return ["block"]
  if (normalized === "warn,block" || normalized === "block,warn" || normalized === "all") return ["warn", "block"]
  return null
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAccessActor()
    const url = new URL(request.url)

    const entityKey = asNonEmptyString(url.searchParams.get("entityKey"))
    const decisions = parseDecisionFilter(url.searchParams.get("decision"))
    const take = asPositiveInt(url.searchParams.get("take"), 50)

    const samples = await prisma.motionSample.findMany({
      where: {
        ownerUserId: actor.userId,
        ...(entityKey ? { entityKey } : {}),
        ...(decisions ? { decision: { in: decisions } } : {}),
      },
      orderBy: {
        createdAt: "desc",
      },
      take,
      select: {
        id: true,
        createdAt: true,
        decision: true,
        reasons: true,
        baselineReady: true,
        entityType: true,
        entityKey: true,
        eventType: true,
        shipDeploymentId: true,
        subagentId: true,
        stationKey: true,
        bridgeCrewId: true,
        sessionId: true,
        interactionId: true,
        responseInteractionId: true,
        traceId: true,
        commandExecutionId: true,
        incidentId: true,
        provider: true,
        runtimeProfile: true,
        executionKind: true,
      },
    })

    return NextResponse.json({
      samples: samples.map((sample) => ({
        ...sample,
        createdAt: sample.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("Error listing motion samples:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

