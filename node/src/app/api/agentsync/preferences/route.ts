import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { defaultAgentSyncNightlyHour } from "@/lib/agentsync/constants"
import { asRecord, normalizeNightlyHour, normalizeTimezone } from "@/lib/agentsync/route-helpers"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const preference = await prisma.agentSyncPreference.findUnique({
      where: {
        userId: session.user.id,
      },
    })

    return NextResponse.json(
      preference || {
        timezone: "UTC",
        nightlyEnabled: true,
        nightlyHour: defaultAgentSyncNightlyHour(),
        lastNightlyRunAt: null,
      },
    )
  } catch (error) {
    console.error("Error loading AgentSync preferences:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = asRecord(await request.json().catch(() => ({})))
    const timezone = normalizeTimezone(body.timezone)
    const nightlyEnabled = body.nightlyEnabled === undefined ? true : body.nightlyEnabled === true
    const nightlyHour = normalizeNightlyHour(body.nightlyHour)

    const preference = await prisma.agentSyncPreference.upsert({
      where: {
        userId: session.user.id,
      },
      create: {
        userId: session.user.id,
        timezone,
        nightlyEnabled,
        nightlyHour,
      },
      update: {
        timezone,
        nightlyEnabled,
        nightlyHour,
      },
    })

    return NextResponse.json(preference)
  } catch (error) {
    console.error("Error updating AgentSync preferences:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
