import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { decryptTraceFields } from "@/lib/observability"

export const dynamic = "force-dynamic"

function parseBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) {
    return null
  }

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

function decryptAdminToken(): string | null {
  const token = process.env.OBSERVABILITY_DECRYPT_ADMIN_TOKEN
  if (!token) {
    return null
  }
  const trimmed = token.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ traceId: string }> },
) {
  try {
    const bearer = parseBearerToken(request.headers.get("authorization"))
    const expectedAdminToken = decryptAdminToken()
    const isAdmin = Boolean(expectedAdminToken && bearer && bearer === expectedAdminToken)

    const session = isAdmin
      ? null
      : await auth.api.getSession({ headers: await headers() })

    if (!isAdmin && !session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { traceId } = await params
    const traceRecord = await prisma.observabilityTrace.findUnique({
      where: {
        traceId,
      },
    })

    if (!traceRecord) {
      return NextResponse.json({ error: "Trace not found" }, { status: 404 })
    }

    if (
      !isAdmin
      && (
        !traceRecord.userId
        || traceRecord.userId !== session?.user.id
      )
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const payload = traceRecord.payload
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return NextResponse.json({ error: "Trace payload is invalid" }, { status: 422 })
    }

    const decrypted = await decryptTraceFields({
      payload: payload as Record<string, unknown>,
    })

    await prisma.observabilityTraceDecryptAudit.create({
      data: {
        traceId: traceRecord.id,
        actorType: isAdmin ? "admin" : "user",
        actorId: isAdmin ? "admin-token" : (session?.user.id || "unknown"),
        actorEmail: isAdmin ? null : (session?.user.email || null),
      },
    })

    return NextResponse.json({
      traceId,
      payload: decrypted.payload,
      metadata: traceRecord.metadata,
      decryptedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Error decrypting observability trace", {
      code: "OBSERVABILITY_TRACE_DECRYPT_FAILED",
      message: (error as Error).message,
    })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
