import { NextRequest, NextResponse } from "next/server"
import {
  AccessControlError,
  requireAccessActor,
  type AccessActor,
} from "@/lib/security/access-control"
import {
  createShipBridgeAgentChatMessage,
  listShipBridgeAgentChatMessages,
} from "@/lib/bridge-agent-chat/service"
import { drainBridgeAgentChatReplyJobsSafely } from "@/lib/bridge-agent-chat/replies"
import { BridgeAgentChatError } from "@/lib/bridge-agent-chat/types"

export const dynamic = "force-dynamic"

interface MessagesRouteDeps {
  requireActor: () => Promise<AccessActor>
  listMessages: typeof listShipBridgeAgentChatMessages
  createMessage: typeof createShipBridgeAgentChatMessage
  drainReplyJobs: typeof drainBridgeAgentChatReplyJobsSafely
}

const defaultDeps: MessagesRouteDeps = {
  requireActor: requireAccessActor,
  listMessages: listShipBridgeAgentChatMessages,
  createMessage: createShipBridgeAgentChatMessage,
  drainReplyJobs: drainBridgeAgentChatReplyJobsSafely,
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((entry): entry is string => typeof entry === "string")
}

function asBoolean(value: unknown): boolean {
  return value === true
}

function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof AccessControlError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
      },
      { status: error.status },
    )
  }

  if (error instanceof BridgeAgentChatError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        ...(error.details ? { details: error.details } : {}),
      },
      { status: error.status },
    )
  }

  console.error("Bridge agent chat messages route failed:", error)
  return NextResponse.json({ error: "Internal server error" }, { status: 500 })
}

export async function handleGetMessages(
  request: NextRequest,
  shipDeploymentId: string,
  roomId: string,
  deps: MessagesRouteDeps = defaultDeps,
) {
  try {
    const actor = await deps.requireActor()
    const takeRaw = request.nextUrl.searchParams.get("take")
    const parsedTake = takeRaw ? Number.parseInt(takeRaw, 10) : NaN
    const take = Number.isFinite(parsedTake) && parsedTake > 0 ? parsedTake : undefined
    const cursor = request.nextUrl.searchParams.get("cursor") || undefined

    const result = await deps.listMessages({
      actor,
      shipDeploymentId,
      roomId,
      take,
      cursor,
    })

    return NextResponse.json(result)
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function handlePostMessages(
  request: NextRequest,
  shipDeploymentId: string,
  roomId: string,
  deps: MessagesRouteDeps = defaultDeps,
) {
  try {
    const actor = await deps.requireActor()
    const body = asRecord(await request.json().catch(() => ({})))

    const result = await deps.createMessage({
      actor,
      shipDeploymentId,
      roomId,
      input: {
        senderBridgeCrewId: typeof body.senderBridgeCrewId === "string" ? body.senderBridgeCrewId : "",
        content: typeof body.content === "string" ? body.content : "",
        autoReply: asBoolean(body.autoReply),
        autoReplyRecipientBridgeCrewIds: asStringArray(body.autoReplyRecipientBridgeCrewIds),
      },
    })

    if (result.queuedReplyJobs > 0) {
      void deps.drainReplyJobs({
        shipDeploymentId,
        limit: Math.max(8, result.queuedReplyJobs * 3),
        label: "ships.agent-chat.messages.post",
      })
    }

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; roomId: string }> },
) {
  const { id, roomId } = await params
  return handleGetMessages(request, id, roomId)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; roomId: string }> },
) {
  const { id, roomId } = await params
  return handlePostMessages(request, id, roomId)
}
