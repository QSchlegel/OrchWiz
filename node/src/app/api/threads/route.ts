import { NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  ensureStationThreadsForUser,
  drainBridgeMirrorJobsSafely,
} from "@/lib/bridge-chat/sync"
import { isBridgeStationKey } from "@/lib/bridge-chat/mapping"
import {
  readRequestedUserId,
  resolveBridgeChatActorFromRequest,
} from "@/lib/bridge-chat/auth"
import { getCurrentSessionUserWithRole } from "@/lib/session-user"

export const dynamic = "force-dynamic"

async function getBridgeChatSession() {
  const sessionUser = await getCurrentSessionUserWithRole()
  if (!sessionUser) {
    return null
  }

  return {
    user: {
      id: sessionUser.id,
      email: sessionUser.email,
      role: sessionUser.role,
    },
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {}
  }

  return value as Record<string, unknown>
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function GET(request: NextRequest) {
  try {
    const actorResolution = await resolveBridgeChatActorFromRequest(request, {
      adminToken: process.env.BRIDGE_ADMIN_TOKEN,
      getSession: getBridgeChatSession,
    })

    if (!actorResolution.ok) {
      return NextResponse.json({ error: actorResolution.error }, { status: actorResolution.status })
    }

    const actor = actorResolution.actor
    const view = request.nextUrl.searchParams.get("view")
    const stationKeyParam = request.nextUrl.searchParams.get("stationKey")
    const userScopeParam = asNonEmptyString(request.nextUrl.searchParams.get("userId"))

    if (actor.type === "user" && view === "station") {
      await ensureStationThreadsForUser(actor.userId)
    }

    await drainBridgeMirrorJobsSafely({ label: "threads.get" })

    const where: Prisma.BridgeThreadWhereInput = {}

    if (actor.type === "user") {
      where.userId = actor.userId
    } else if (userScopeParam) {
      where.userId = userScopeParam
    }

    if (stationKeyParam && isBridgeStationKey(stationKeyParam)) {
      where.stationKey = stationKeyParam
    }

    const threads = await prisma.bridgeThread.findMany({
      where,
      orderBy: {
        updatedAt: "desc",
      },
    })

    return NextResponse.json({ threads })
  } catch (error) {
    console.error("Error fetching bridge-chat threads:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
      },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const actorResolution = await resolveBridgeChatActorFromRequest(request, {
      adminToken: process.env.BRIDGE_ADMIN_TOKEN,
      getSession: getBridgeChatSession,
    })

    if (!actorResolution.ok) {
      return NextResponse.json({ error: actorResolution.error }, { status: actorResolution.status })
    }

    const body = asRecord(await request.json().catch(() => ({})))
    const title = asNonEmptyString(body.title) || "Bridge"
    const stationKey = isBridgeStationKey(body.stationKey) ? body.stationKey : null
    const sessionId = asNonEmptyString(body.sessionId)

    let ownerUserId: string | null
    if (actorResolution.actor.type === "user") {
      ownerUserId = actorResolution.actor.userId
    } else {
      ownerUserId = readRequestedUserId(request, body) || actorResolution.actor.userId || null
      if (!ownerUserId) {
        return NextResponse.json(
          {
            error: "Admin thread creation requires userId (body, query, or x-orchwiz-user-id header).",
          },
          { status: 400 },
        )
      }
    }

    const thread = await prisma.bridgeThread.create({
      data: {
        title,
        userId: ownerUserId,
        stationKey,
        sessionId,
      },
    })

    await drainBridgeMirrorJobsSafely({ label: "threads.post" })

    return NextResponse.json({ thread }, { status: 201 })
  } catch (error) {
    console.error("Error creating bridge-chat thread:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
      },
      { status: 500 },
    )
  }
}
