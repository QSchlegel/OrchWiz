import crypto from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { hashApiKey } from "@/lib/forwarding/security"
import {
  ForwardingSecretsError,
  storeForwardingTargetApiKey,
  summarizeStoredForwardingTargetApiKey,
} from "@/lib/forwarding/secrets"
import type { ForwardingEventType, ForwardingTargetStatus } from "@prisma/client"

export const dynamic = "force-dynamic"

const DEFAULT_EVENT_TYPES: ForwardingEventType[] = [
  "session",
  "task",
  "command_execution",
  "verification",
  "action",
  "deployment",
  "application",
]

function generateApiKey(): string {
  return `owz_${crypto.randomBytes(18).toString("hex")}`
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function mapForwardingConfigForResponse<T extends { targetApiKey: string | null }>(config: T) {
  return {
    ...config,
    targetApiKey: summarizeStoredForwardingTargetApiKey(config.targetApiKey),
  }
}

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const configs = await prisma.forwardingConfig.findMany({
      where: {
        userId: session.user.id,
      },
      include: {
        sourceNode: {
          select: {
            id: true,
            nodeId: true,
            name: true,
            nodeType: true,
            nodeUrl: true,
            isActive: true,
            lastSeenAt: true,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    })

    return NextResponse.json(configs.map(mapForwardingConfigForResponse))
  } catch (error) {
    console.error("Error fetching forwarding config:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const targetUrl = body?.targetUrl
    const targetApiKeyInput = asNonEmptyString(body?.targetApiKey)
    const enabled = body?.enabled === true
    const eventTypes = Array.isArray(body?.eventTypes)
      ? (body.eventTypes as ForwardingEventType[])
      : DEFAULT_EVENT_TYPES
    const status = (body?.status as ForwardingTargetStatus) || (enabled ? "active" : "paused")

    if (!targetUrl || typeof targetUrl !== "string") {
      return NextResponse.json({ error: "targetUrl is required" }, { status: 400 })
    }

    const sourceNodeInput = body?.sourceNode
    let sourceNodeId: string | null = null
    let sourceApiKey: string | null = null

    if (sourceNodeInput && typeof sourceNodeInput === "object") {
      const requestedApiKey =
        typeof sourceNodeInput.apiKey === "string" && sourceNodeInput.apiKey.length > 0
          ? sourceNodeInput.apiKey
          : generateApiKey()

      sourceApiKey = requestedApiKey
      const nodeId =
        typeof sourceNodeInput.nodeId === "string" && sourceNodeInput.nodeId.trim().length > 0
          ? sourceNodeInput.nodeId.trim()
          : `node-${crypto.randomUUID().slice(0, 8)}`

      const sourceNode = await prisma.nodeSource.upsert({
        where: {
          nodeId,
        },
        update: {
          name: typeof sourceNodeInput.name === "string" ? sourceNodeInput.name : null,
          nodeType: sourceNodeInput.nodeType || null,
          nodeUrl: typeof sourceNodeInput.nodeUrl === "string" ? sourceNodeInput.nodeUrl : null,
          apiKeyHash: hashApiKey(requestedApiKey),
          isActive: sourceNodeInput.isActive !== false,
        },
        create: {
          nodeId,
          name: typeof sourceNodeInput.name === "string" ? sourceNodeInput.name : null,
          nodeType: sourceNodeInput.nodeType || null,
          nodeUrl: typeof sourceNodeInput.nodeUrl === "string" ? sourceNodeInput.nodeUrl : null,
          apiKeyHash: hashApiKey(requestedApiKey),
          isActive: sourceNodeInput.isActive !== false,
        },
      })

      sourceNodeId = sourceNode.id
    } else if (typeof body?.sourceNodeId === "string" && body.sourceNodeId.length > 0) {
      const sourceNode = await prisma.nodeSource.findUnique({
        where: {
          id: body.sourceNodeId,
        },
      })
      if (!sourceNode) {
        return NextResponse.json({ error: "sourceNodeId not found" }, { status: 404 })
      }
      sourceNodeId = sourceNode.id
    }

    const targetApiKeyContextId = crypto.randomUUID()
    const storedTargetApiKey = targetApiKeyInput
      ? await storeForwardingTargetApiKey({
          configId: targetApiKeyContextId,
          targetApiKey: targetApiKeyInput,
        })
      : null

    const config = await prisma.forwardingConfig.create({
      data: {
        userId: session.user.id,
        sourceNodeId,
        targetUrl,
        targetApiKey: storedTargetApiKey,
        enabled,
        eventTypes,
        status,
      },
      include: {
        sourceNode: {
          select: {
            id: true,
            nodeId: true,
            name: true,
            nodeType: true,
            nodeUrl: true,
            isActive: true,
            lastSeenAt: true,
          },
        },
      },
    })

    return NextResponse.json(
      {
        ...mapForwardingConfigForResponse(config),
        sourceApiKey,
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof ForwardingSecretsError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        { status: error.status },
      )
    }

    console.error("Error creating forwarding config:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
