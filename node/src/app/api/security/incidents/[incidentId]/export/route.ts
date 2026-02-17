import { NextResponse } from "next/server"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"
import { securityIncidentsEnabled } from "@/lib/security/incident-response/feature-flag"
import { getIncidentForActor } from "@/lib/security/incident-response/persistence"

export const dynamic = "force-dynamic"

export async function GET(_request: Request, context: { params: Promise<{ incidentId: string }> }) {
  if (!securityIncidentsEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  try {
    const actor = await requireAccessActor()
    const { incidentId } = await context.params
    const incident = await getIncidentForActor({ actor, incidentId })

    const filename = `incident_${incident.incident.id}.fox`
    const body = JSON.stringify(incident.caseFile, null, 2)

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"${filename}\"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("Error exporting security incident:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

