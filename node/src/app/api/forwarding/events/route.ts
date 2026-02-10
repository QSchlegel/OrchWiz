import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { publishRealtimeEvent } from "@/lib/realtime/events"
import { Prisma } from "@prisma/client"
import {
  buildDedupeKey,
  parseForwardingEventInput,
  resolveOccurredAt,
} from "@/lib/forwarding/validation"
import {
  isFreshTimestamp,
  verifyApiKeyHash,
  verifyForwardingSignature,
} from "@/lib/forwarding/security"
import { takeRateLimitToken } from "@/lib/forwarding/rate-limit"

export const dynamic = "force-dynamic"

function forwardingEnabled(): boolean {
  return process.env.ENABLE_FORWARDING_INGEST === "true"
}

export async function POST(request: NextRequest) {
  if (!forwardingEnabled()) {
    return NextResponse.json(
      {
        error: "Forwarding ingest is disabled.",
      },
      { status: 403 }
    )
  }

  const sourceNodeId = request.headers.get("x-orchwiz-source-node")
  const apiKey = request.headers.get("x-orchwiz-api-key")
  const timestamp = request.headers.get("x-orchwiz-timestamp")
  const nonce = request.headers.get("x-orchwiz-nonce")
  const signature = request.headers.get("x-orchwiz-signature")

  if (!sourceNodeId || !apiKey || !timestamp || !nonce || !signature) {
    return NextResponse.json(
      {
        error:
          "Missing required forwarding headers. Required: x-orchwiz-source-node, x-orchwiz-api-key, x-orchwiz-timestamp, x-orchwiz-nonce, x-orchwiz-signature",
      },
      { status: 400 }
    )
  }

  const requestIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  const rateLimit = takeRateLimitToken(`${sourceNodeId}:${requestIp}`)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Forwarding rate limit exceeded",
        retryAfterMs: rateLimit.retryAfterMs,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rateLimit.retryAfterMs / 1000)),
        },
      }
    )
  }

  if (!isFreshTimestamp(timestamp)) {
    return NextResponse.json(
      {
        error: "Stale forwarding timestamp",
      },
      { status: 400 }
    )
  }

  const sourceCandidates = await prisma.nodeSource.findMany({
    where: {
      nodeId: sourceNodeId,
      isActive: true,
    },
    select: {
      id: true,
      nodeId: true,
      apiKeyHash: true,
      ownerUserId: true,
    },
  })

  if (sourceCandidates.length === 0) {
    return NextResponse.json(
      {
        error: "Unknown or inactive forwarding source node",
      },
      { status: 401 }
    )
  }

  const source = sourceCandidates.find((candidate) => verifyApiKeyHash(apiKey, candidate.apiKeyHash))
  if (!source) {
    return NextResponse.json(
      {
        error: "Invalid forwarding API key",
      },
      { status: 401 }
    )
  }

  const rawBody = await request.text()
  if (!verifyForwardingSignature(timestamp, nonce, rawBody, signature, apiKey)) {
    return NextResponse.json(
      {
        error: "Invalid forwarding signature",
      },
      { status: 401 }
    )
  }

  const parsedTimestamp = Number.parseInt(timestamp, 10)
  const nonceTimestamp = Number.isFinite(parsedTimestamp) ? new Date(parsedTimestamp) : new Date()

  try {
    await prisma.forwardingNonce.create({
      data: {
        sourceNodeId: source.id,
        nonce,
        timestamp: nonceTimestamp,
      },
    })
  } catch (error) {
    const message = (error as { code?: string; message?: string }).code
    if (message === "P2002") {
      return NextResponse.json(
        {
          duplicate: true,
          error: "Replay nonce detected",
        },
        { status: 409 }
      )
    }

    console.error("Forwarding nonce persist failed:", error)
    return NextResponse.json(
      {
        error: "Failed to validate forwarding nonce",
      },
      { status: 500 }
    )
  }

  let parsedEvent
  try {
    const payload = JSON.parse(rawBody)
    parsedEvent = parseForwardingEventInput(payload)
  } catch (error) {
    return NextResponse.json(
      {
        error: "Invalid forwarding payload",
        details: (error as Error).message,
      },
      { status: 400 }
    )
  }

  const occurredAt = resolveOccurredAt(parsedEvent)
  const dedupeKey = buildDedupeKey(source.nodeId, parsedEvent, occurredAt)

  try {
    const forwardingEvent = await prisma.forwardingEvent.create({
      data: {
        sourceNodeId: source.id,
        dedupeKey,
        eventType: parsedEvent.eventType,
        payload: parsedEvent.payload as Prisma.InputJsonValue,
        metadata: (parsedEvent.metadata || {}) as Prisma.InputJsonValue,
        occurredAt,
      },
    })

    await prisma.nodeSource.update({
      where: {
        id: source.id,
      },
      data: {
        lastSeenAt: new Date(),
      },
    })

    publishRealtimeEvent({
      type: "forwarding.received",
      ...(source.ownerUserId
        ? {
            userId: source.ownerUserId,
          }
        : {}),
      payload: {
        eventId: forwardingEvent.id,
        sourceNodeId: source.nodeId,
        eventType: forwardingEvent.eventType,
      },
    })

    if (
      forwardingEvent.eventType === "bridge_station" ||
      forwardingEvent.eventType === "system_status"
    ) {
      publishRealtimeEvent({
        type: "bridge.updated",
        ...(source.ownerUserId
          ? {
              userId: source.ownerUserId,
            }
          : {}),
        payload: {
          eventId: forwardingEvent.id,
          sourceNodeId: source.nodeId,
          eventType: forwardingEvent.eventType,
        },
      })
    }

    return NextResponse.json({
      received: true,
      eventId: forwardingEvent.id,
      dedupeKey,
    })
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === "P2002") {
      return NextResponse.json({
        received: true,
        duplicate: true,
        dedupeKey,
      })
    }

    console.error("Forwarding event persist failed:", error)
    return NextResponse.json(
      {
        error: "Failed to persist forwarding event",
      },
      { status: 500 }
    )
  }
}
