import crypto from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { signForwardingPayload } from "@/lib/forwarding/security"
import { verifyApiKeyHash } from "@/lib/forwarding/security"
import { prisma } from "@/lib/prisma"
import { configuredForwardingTestTargetAllowlist, isForwardingTestTargetAllowed } from "@/lib/forwarding/test-targets"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAccessActor()

    const body = await request.json()

    const targetUrlInput = typeof body?.targetUrl === "string" ? body.targetUrl.trim() : null
    const sourceNodeId = typeof body?.sourceNodeId === "string" ? body.sourceNodeId : null
    const sourceApiKey = typeof body?.sourceApiKey === "string" ? body.sourceApiKey : null

    if (!sourceNodeId || !sourceApiKey) {
      return NextResponse.json(
        { error: "sourceNodeId and sourceApiKey are required" },
        { status: 400 }
      )
    }

    const sourceNode = await prisma.nodeSource.findFirst({
      where: actor.isAdmin
        ? {
            id: sourceNodeId,
          }
        : {
            id: sourceNodeId,
            ownerUserId: actor.userId,
          },
      select: {
        id: true,
        nodeId: true,
        apiKeyHash: true,
      },
    })
    if (!sourceNode) {
      return NextResponse.json({ error: "sourceNodeId not found" }, { status: 404 })
    }
    if (!verifyApiKeyHash(sourceApiKey, sourceNode.apiKeyHash)) {
      return NextResponse.json({ error: "sourceApiKey mismatch" }, { status: 401 })
    }

    let targetUrl = targetUrlInput
    if (!targetUrl) {
      const forwardingConfig = await prisma.forwardingConfig.findFirst({
        where: {
          userId: actor.userId,
          sourceNodeId: sourceNode.id,
        },
        orderBy: {
          updatedAt: "desc",
        },
        select: {
          targetUrl: true,
        },
      })
      if (!forwardingConfig) {
        return NextResponse.json(
          { error: "targetUrl is required when no forwarding config exists for this source node" },
          { status: 400 },
        )
      }

      targetUrl = forwardingConfig.targetUrl
    }

    const allowlist = configuredForwardingTestTargetAllowlist()
    if (!isForwardingTestTargetAllowed(targetUrl, allowlist)) {
      return NextResponse.json(
        {
          error: "targetUrl is not allowed for forwarding test mode",
          allowlist,
        },
        { status: 403 },
      )
    }

    const timestamp = String(Date.now())
    const nonce = crypto.randomUUID()
    const payload = {
      eventType: "system_status",
      payload: {
        status: "ok",
        message: "Forwarding connection test",
        requestedBy: actor.email || actor.userId,
      },
      metadata: {
        test: true,
      },
      occurredAt: new Date().toISOString(),
    }

    const rawBody = JSON.stringify(payload)
    const signature = signForwardingPayload(timestamp, nonce, rawBody, sourceApiKey)

    const response = await fetch(`${targetUrl.replace(/\/$/, "")}/api/forwarding/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-orchwiz-source-node": sourceNode.nodeId,
        "x-orchwiz-api-key": sourceApiKey,
        "x-orchwiz-timestamp": timestamp,
        "x-orchwiz-nonce": nonce,
        "x-orchwiz-signature": signature,
      },
      body: rawBody,
    })

    const responsePayload = await response.json().catch(() => null)

    return NextResponse.json({
      ok: response.ok,
      status: response.status,
      response: responsePayload,
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Forwarding test failed:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
