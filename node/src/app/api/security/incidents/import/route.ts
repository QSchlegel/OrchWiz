import { NextRequest, NextResponse } from "next/server"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"
import { securityIncidentsEnabled } from "@/lib/security/incident-response/feature-flag"
import { AuroraCaseFileNormalizeError } from "@/lib/security/incident-response/aurora-normalize"
import { createIncidentFromImport } from "@/lib/security/incident-response/persistence"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  if (!securityIncidentsEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  try {
    const actor = await requireAccessActor()
    const body = await request.json().catch(() => ({}))

    if (body?.caseFile === undefined) {
      return NextResponse.json({ error: "caseFile is required" }, { status: 400 })
    }

    const created = await createIncidentFromImport({ actor, caseFile: body.caseFile })
    return NextResponse.json({ id: created.id, sessionId: created.sessionId })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    if (error instanceof AuroraCaseFileNormalizeError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details ?? null },
        { status: error.status },
      )
    }

    console.error("Error importing security incident:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

