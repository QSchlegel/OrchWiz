import crypto from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { signForwardingPayload } from "@/lib/forwarding/security"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()

    const targetUrl = typeof body?.targetUrl === "string" ? body.targetUrl : null
    const sourceNodeId = typeof body?.sourceNodeId === "string" ? body.sourceNodeId : null
    const sourceApiKey = typeof body?.sourceApiKey === "string" ? body.sourceApiKey : null

    if (!targetUrl || !sourceNodeId || !sourceApiKey) {
      return NextResponse.json(
        { error: "targetUrl, sourceNodeId, and sourceApiKey are required" },
        { status: 400 }
      )
    }

    const timestamp = String(Date.now())
    const nonce = crypto.randomUUID()
    const payload = {
      eventType: "system_status",
      payload: {
        status: "ok",
        message: "Forwarding connection test",
        requestedBy: session.user.email,
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
        "x-orchwiz-source-node": sourceNodeId,
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
    console.error("Forwarding test failed:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
