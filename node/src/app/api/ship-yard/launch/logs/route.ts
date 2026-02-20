import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { AccessControlError } from "@/lib/security/access-control"
import { requireShipyardRequestActor } from "@/lib/shipyard/request-actor"
import { readShipLaunchLogs } from "@/lib/shipyard/launch-reports"

export const dynamic = "force-dynamic"

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function parseNonNegativeInt(raw: string | null): number | undefined {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return undefined
  }
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) {
    return undefined
  }
  return Math.max(0, parsed)
}

function extractLaunchRequestId(metadataInput: unknown): string | null {
  const metadata = asObject(metadataInput)
  const launchLogs = asObject(metadata.launchLogs)
  return asString(launchLogs.requestId)
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireShipyardRequestActor(request, {
      allowLegacyTokenAuth: true,
    })

    const requestIdParam = asString(request.nextUrl.searchParams.get("requestId"))
    const deploymentId = asString(request.nextUrl.searchParams.get("deploymentId"))
    const cursor = parseNonNegativeInt(request.nextUrl.searchParams.get("cursor"))
    const limit = parseNonNegativeInt(request.nextUrl.searchParams.get("limit"))

    let resolvedRequestId = requestIdParam

    if (!resolvedRequestId && deploymentId) {
      const deployment = await prisma.agentDeployment.findFirst({
        where: {
          id: deploymentId,
          userId: actor.userId,
          deploymentType: "ship",
        },
        select: {
          id: true,
          metadata: true,
        },
      })
      if (!deployment) {
        return NextResponse.json({ error: "Ship not found" }, { status: 404 })
      }
      resolvedRequestId = extractLaunchRequestId(deployment.metadata)
      if (!resolvedRequestId) {
        return NextResponse.json(
          {
            error: "No launch log report is attached to this deployment yet.",
            deploymentId: deployment.id,
          },
          { status: 404 },
        )
      }
    }

    if (!resolvedRequestId) {
      return NextResponse.json(
        {
          error: "Provide requestId or deploymentId.",
        },
        { status: 400 },
      )
    }

    const logs = await readShipLaunchLogs({
      ownerUserId: actor.userId,
      requestId: resolvedRequestId,
      cursor,
      limit,
    })
    if (!logs) {
      return NextResponse.json(
        {
          error: "Launch logs not found.",
          requestId: resolvedRequestId,
        },
        { status: 404 },
      )
    }

    return NextResponse.json({
      requestId: resolvedRequestId,
      deploymentId: deploymentId || logs.report?.deploymentId || null,
      cursor: cursor ?? 0,
      nextCursor: logs.nextCursor,
      totalLines: logs.totalLines,
      hasMore: logs.hasMore,
      entries: logs.entries,
      report: logs.report,
      paths: logs.paths,
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error("Error fetching ship launch logs:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
