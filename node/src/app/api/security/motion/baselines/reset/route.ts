import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"

export const dynamic = "force-dynamic"

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAccessActor()
    const body = await request.json().catch(() => ({}))

    const entityKey = asNonEmptyString(body?.entityKey)
    if (!entityKey) {
      return NextResponse.json({ error: "entityKey is required" }, { status: 400 })
    }

    const confirm = asNonEmptyString(body?.confirm)
    if (confirm !== "RESET_BASELINE") {
      return NextResponse.json({ error: "confirm must be RESET_BASELINE" }, { status: 400 })
    }

    const existing = await prisma.motionBaseline.findUnique({
      where: {
        ownerUserId_entityKey: {
          ownerUserId: actor.userId,
          entityKey,
        },
      },
      select: { id: true },
    })

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    await prisma.motionBaseline.delete({
      where: {
        ownerUserId_entityKey: {
          ownerUserId: actor.userId,
          entityKey,
        },
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("Error resetting motion baseline:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

