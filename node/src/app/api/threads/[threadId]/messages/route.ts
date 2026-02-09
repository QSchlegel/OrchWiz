import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { normalizeBridgeChatRole } from "@/lib/bridge-chat/mapping"
import {
  drainBridgeMirrorJobsSafely,
  enqueueThreadToSessionMirrorJob,
} from "@/lib/bridge-chat/sync"
import { resolveBridgeChatActorFromRequest } from "@/lib/bridge-chat/auth"

export const dynamic = "force-dynamic"

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

async function resolveThread(threadId: string, userId?: string) {
  return prisma.bridgeThread.findFirst({
    where: {
      id: threadId,
      ...(userId ? { userId } : {}),
    },
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  try {
    const actorResolution = await resolveBridgeChatActorFromRequest(request, {
      adminToken: process.env.BRIDGE_ADMIN_TOKEN,
      getSession: async () => {
        const session = await auth.api.getSession({ headers: await headers() })
        if (!session) {
          return null
        }

        return {
          user: {
            id: session.user.id,
            email: session.user.email,
          },
        }
      },
    })

    if (!actorResolution.ok) {
      return NextResponse.json({ error: actorResolution.error }, { status: actorResolution.status })
    }

    const { threadId } = await params
    const userScope = actorResolution.actor.type === "user" ? actorResolution.actor.userId : undefined

    const thread = await resolveThread(threadId, userScope)
    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 })
    }

    await drainBridgeMirrorJobsSafely({ label: "thread-messages.get" })

    const messages = await prisma.bridgeMessage.findMany({
      where: {
        threadId,
      },
      orderBy: {
        createdAt: "asc",
      },
      take: 200,
    })

    return NextResponse.json({ messages })
  } catch (error) {
    console.error("Error fetching bridge-chat messages:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
      },
      { status: 500 },
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  try {
    const actorResolution = await resolveBridgeChatActorFromRequest(request, {
      adminToken: process.env.BRIDGE_ADMIN_TOKEN,
      getSession: async () => {
        const session = await auth.api.getSession({ headers: await headers() })
        if (!session) {
          return null
        }

        return {
          user: {
            id: session.user.id,
            email: session.user.email,
          },
        }
      },
    })

    if (!actorResolution.ok) {
      return NextResponse.json({ error: actorResolution.error }, { status: actorResolution.status })
    }

    const { threadId } = await params
    const userScope = actorResolution.actor.type === "user" ? actorResolution.actor.userId : undefined

    const thread = await resolveThread(threadId, userScope)
    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 })
    }

    const body = asRecord(await request.json().catch(() => ({})))
    const role = normalizeBridgeChatRole(body.role)
    const content = asNonEmptyString(body.content)

    if (!content) {
      return NextResponse.json({ error: "content required" }, { status: 400 })
    }

    const message = await prisma.bridgeMessage.create({
      data: {
        threadId,
        role,
        content,
      },
    })

    try {
      await enqueueThreadToSessionMirrorJob({
        messageId: message.id,
        threadId,
      })
      await drainBridgeMirrorJobsSafely({ label: "thread-messages.post" })
    } catch (mirrorError) {
      console.error("Bridge-chat mirror enqueue failed:", mirrorError)
    }

    return NextResponse.json({ message }, { status: 201 })
  } catch (error) {
    console.error("Error creating bridge-chat message:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
      },
      { status: 500 },
    )
  }
}
