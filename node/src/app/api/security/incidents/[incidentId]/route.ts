import { NextRequest, NextResponse } from "next/server"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"
import { securityIncidentsEnabled } from "@/lib/security/incident-response/feature-flag"
import { getIncidentForActor, updateIncident } from "@/lib/security/incident-response/persistence"
import { AuroraCaseFileNormalizeError } from "@/lib/security/incident-response/aurora-normalize"
import { writeSecurityIncidentSnapshot } from "@/lib/security/incident-response/reporting"

export const dynamic = "force-dynamic"

function isIncidentStatus(value: unknown): value is
  | "open"
  | "investigating"
  | "contained"
  | "eradicated"
  | "recovered"
  | "closed" {
  return (
    value === "open" ||
    value === "investigating" ||
    value === "contained" ||
    value === "eradicated" ||
    value === "recovered" ||
    value === "closed"
  )
}

function isIncidentSeverity(value: unknown): value is "low" | "medium" | "high" | "critical" {
  return value === "low" || value === "medium" || value === "high" || value === "critical"
}

export async function GET(_request: NextRequest, context: { params: Promise<{ incidentId: string }> }) {
  if (!securityIncidentsEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  try {
    const actor = await requireAccessActor()
    const { incidentId } = await context.params
    const result = await getIncidentForActor({ actor, incidentId })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("Error loading security incident:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ incidentId: string }> }) {
  if (!securityIncidentsEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  try {
    const actor = await requireAccessActor()
    const { incidentId } = await context.params
    const body = await request.json().catch(() => ({}))

    const title = typeof body?.title === "string" ? body.title : undefined
    const summary = typeof body?.summary === "string" || body?.summary === null ? body.summary : undefined
    const status = isIncidentStatus(body?.status) ? body.status : undefined
    const severity = isIncidentSeverity(body?.severity) ? body.severity : undefined
    const caseFile = body?.caseFile
    const expectedUpdatedAt = typeof body?.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : null
    const writeSnapshot = body?.writeSnapshot === true

    const hasAnyChange =
      title !== undefined ||
      summary !== undefined ||
      status !== undefined ||
      severity !== undefined ||
      caseFile !== undefined

    let updatedAt: string | null = null
    if (hasAnyChange) {
      const updated = await updateIncident({
        actor,
        incidentId,
        title,
        summary,
        status,
        severity,
        caseFile,
        expectedUpdatedAt,
      })
      updatedAt = updated.updatedAt
    }

    let reportPathMd: string | undefined
    let reportPathJson: string | undefined

    if (writeSnapshot) {
      const current = await getIncidentForActor({ actor, incidentId })
      const snapshot = await writeSecurityIncidentSnapshot({
        incident: {
          id: current.incident.id,
          title: current.incident.title,
          status: current.incident.status,
          severity: current.incident.severity,
          createdAt: current.incident.createdAt,
          updatedAt: current.incident.updatedAt,
          closedAt: current.incident.closedAt,
          sessionId: current.incident.sessionId,
          mispEventId: current.incident.mispEventId,
        },
        caseFile: current.caseFile,
      })

      reportPathMd = snapshot.reportPathMd
      reportPathJson = snapshot.reportPathJson
      updatedAt = current.incident.updatedAt
    }

    const currentUpdatedAt = updatedAt || (await getIncidentForActor({ actor, incidentId })).incident.updatedAt

    return NextResponse.json({
      updatedAt: currentUpdatedAt,
      reportPathMd: reportPathMd || null,
      reportPathJson: reportPathJson || null,
    })
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

    const status = typeof (error as any)?.status === "number" ? (error as any).status : null
    if (status === 409) {
      return NextResponse.json({ error: "Incident has been updated elsewhere.", code: "CONFLICT" }, { status: 409 })
    }

    console.error("Error updating security incident:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ incidentId: string }> }) {
  if (!securityIncidentsEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  try {
    const actor = await requireAccessActor()
    const { incidentId } = await context.params
    const updated = await updateIncident({
      actor,
      incidentId,
      status: "closed",
      expectedUpdatedAt: null,
    })

    return NextResponse.json({ ok: true, updatedAt: updated.updatedAt })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("Error closing security incident:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

