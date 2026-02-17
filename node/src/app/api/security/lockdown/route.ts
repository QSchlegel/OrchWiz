import { NextRequest, NextResponse } from "next/server"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"
import { getOrCreateSecurityLockdownConfig, setSecurityLockdown } from "@/lib/security/lockdown"
import { publishRealtimeEvent } from "@/lib/realtime/events"

export const dynamic = "force-dynamic"

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function GET() {
  try {
    const actor = await requireAccessActor()
    const config = await getOrCreateSecurityLockdownConfig({ ownerUserId: actor.userId })
    return NextResponse.json({
      enabled: config.enabled,
      reason: config.reason || null,
      updatedAt: config.updatedAt.toISOString(),
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("Error loading security lockdown config:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAccessActor()
    const body = await request.json().catch(() => ({}))

    const enabled = body?.enabled === true
    const confirm = asNonEmptyString(body?.confirm)
    const reason = typeof body?.reason === "string" ? body.reason : null

    if (enabled) {
      if (confirm !== "ENABLE_LOCKDOWN") {
        return NextResponse.json({ error: "confirm must be ENABLE_LOCKDOWN" }, { status: 400 })
      }
    } else {
      if (confirm !== "DISABLE_LOCKDOWN") {
        return NextResponse.json({ error: "confirm must be DISABLE_LOCKDOWN" }, { status: 400 })
      }
    }

    const updated = await setSecurityLockdown({
      ownerUserId: actor.userId,
      enabled,
      reason,
    })

    publishRealtimeEvent({
      type: "security.lockdown.updated",
      userId: actor.userId,
      payload: updated,
    })

    return NextResponse.json({ ok: true, ...updated })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("Error updating security lockdown config:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

