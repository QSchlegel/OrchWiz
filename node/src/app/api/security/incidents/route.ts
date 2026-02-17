import { NextRequest, NextResponse } from "next/server"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"
import { securityIncidentsEnabled } from "@/lib/security/incident-response/feature-flag"
import { createIncidentFromTemplate, listSecurityIncidents } from "@/lib/security/incident-response/persistence"

export const dynamic = "force-dynamic"

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseSeverity(value: unknown): "low" | "medium" | "high" | "critical" | null {
  if (value === "low" || value === "medium" || value === "high" || value === "critical") {
    return value
  }
  return null
}

export async function GET(request: NextRequest) {
  if (!securityIncidentsEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  try {
    const actor = await requireAccessActor()
    const url = new URL(request.url)
    const includeClosed = url.searchParams.get("includeClosed") === "true"

    const incidents = await listSecurityIncidents({ actor, includeClosed })
    return NextResponse.json({ incidents })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("Error listing security incidents:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  if (!securityIncidentsEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  try {
    const actor = await requireAccessActor()
    const body = await request.json().catch(() => ({}))

    const title = asNonEmptyString(body?.title)
    if (!title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 })
    }

    const severity = parseSeverity(body?.severity) ?? undefined
    const created = await createIncidentFromTemplate({ actor, title, severity })

    return NextResponse.json({
      id: created.id,
      sessionId: created.sessionId,
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("Error creating security incident:", error)
    return NextResponse.json({ error: (error as Error).message || "Internal server error" }, { status: 500 })
  }
}

