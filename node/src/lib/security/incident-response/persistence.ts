import type { Prisma } from "@prisma/client"
import type {
  SecurityIncidentSeverity,
  SecurityIncidentStatus,
} from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { AccessActor } from "@/lib/security/access-control"
import {
  AccessControlError,
  assertCanReadOwnedResource,
  assertCanWriteOwnedResource,
  ownerScopedWhere,
} from "@/lib/security/access-control"
import { buildEmptyAuroraCaseFile } from "./aurora-template"
import { normalizeImportedAuroraCaseFile } from "./aurora-normalize"
import { securityIncidentsEnabled } from "./feature-flag"
import { writeSecurityIncidentEvidenceBlob } from "./evidence-store"
import { nextRecid } from "./recid"
import type { AuroraCaseFile } from "./types"

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function listSecurityIncidents(args: {
  actor: AccessActor
  includeClosed?: boolean
}): Promise<
  Array<{
    id: string
    title: string
    status: SecurityIncidentStatus
    severity: SecurityIncidentSeverity
    updatedAt: string
    createdAt: string
    mispEventId: string | null
    sessionId: string | null
  }>
> {
  const includeClosed = args.includeClosed === true

  const incidents = await prisma.securityIncident.findMany({
    where: {
      ...ownerScopedWhere({ actor: args.actor }),
      ...(includeClosed ? {} : { status: { not: "closed" } }),
    },
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      id: true,
      title: true,
      status: true,
      severity: true,
      updatedAt: true,
      createdAt: true,
      mispEventId: true,
      sessionId: true,
    },
  })

  return incidents.map((incident) => ({
    id: incident.id,
    title: incident.title,
    status: incident.status,
    severity: incident.severity,
    updatedAt: incident.updatedAt.toISOString(),
    createdAt: incident.createdAt.toISOString(),
    mispEventId: incident.mispEventId || null,
    sessionId: incident.sessionId || null,
  }))
}

export async function createIncidentFromTemplate(args: {
  actor: AccessActor
  title: string
  severity?: SecurityIncidentSeverity
}): Promise<{ id: string; sessionId: string | null }> {
  const title = asNonEmptyString(args.title)
  if (!title) {
    throw new Error("title must be a non-empty string")
  }

  const session = await prisma.session.create({
    data: {
      userId: args.actor.userId,
      title: `Incident: ${title}`,
      description: "Security incident response case",
      status: "planning",
      mode: "plan",
      source: "web",
      metadata: {
        securityIncident: true,
      } as Prisma.InputJsonValue,
    },
    select: { id: true },
  })

  const incident = await prisma.securityIncident.create({
    data: {
      ownerUserId: args.actor.userId,
      title,
      severity: args.severity ?? "medium",
      status: "open",
      caseFile: buildEmptyAuroraCaseFile() as unknown as Prisma.InputJsonValue,
      sessionId: session.id,
    },
    select: {
      id: true,
      sessionId: true,
    },
  })

  return { id: incident.id, sessionId: incident.sessionId || null }
}

export async function createIncidentFromImport(args: {
  actor: AccessActor
  caseFile: unknown
}): Promise<{ id: string; sessionId: string | null }> {
  const normalized = normalizeImportedAuroraCaseFile(args.caseFile)

  const derivedTitle =
    asNonEmptyString(normalized.case_id) ||
    asNonEmptyString(normalized.client) ||
    "Imported Aurora Incident"

  const session = await prisma.session.create({
    data: {
      userId: args.actor.userId,
      title: `Incident: ${derivedTitle}`,
      description: "Imported Aurora case file",
      status: "planning",
      mode: "plan",
      source: "web",
      metadata: {
        securityIncident: true,
        importedAuroraCase: true,
      } as Prisma.InputJsonValue,
    },
    select: { id: true },
  })

  const incident = await prisma.securityIncident.create({
    data: {
      ownerUserId: args.actor.userId,
      title: derivedTitle,
      severity: "medium",
      status: "open",
      caseFile: normalized as unknown as Prisma.InputJsonValue,
      sessionId: session.id,
      mispEventId: asNonEmptyString(normalized.mispeventid),
    },
    select: {
      id: true,
      sessionId: true,
    },
  })

  return { id: incident.id, sessionId: incident.sessionId || null }
}

export async function getIncidentForActor(args: {
  actor: AccessActor
  incidentId: string
}): Promise<{
  incident: {
    id: string
    ownerUserId: string
    title: string
    summary: string | null
    status: SecurityIncidentStatus
    severity: SecurityIncidentSeverity
    isShared: boolean
    sessionId: string | null
    mispEventId: string | null
    mispPushedAt: string | null
    createdAt: string
    updatedAt: string
    closedAt: string | null
  }
  caseFile: AuroraCaseFile
}> {
  const incident = await prisma.securityIncident.findUnique({
    where: { id: args.incidentId },
  })

  if (!incident) {
    throw new AccessControlError("Not found", 404, "NOT_FOUND")
  }

  assertCanReadOwnedResource({
    actor: args.actor,
    ownerUserId: incident.ownerUserId,
    isShared: incident.isShared,
    allowSharedRead: true,
  })

  return {
    incident: {
      id: incident.id,
      ownerUserId: incident.ownerUserId,
      title: incident.title,
      summary: incident.summary,
      status: incident.status,
      severity: incident.severity,
      isShared: incident.isShared,
      sessionId: incident.sessionId,
      mispEventId: incident.mispEventId,
      mispPushedAt: incident.mispPushedAt ? incident.mispPushedAt.toISOString() : null,
      createdAt: incident.createdAt.toISOString(),
      updatedAt: incident.updatedAt.toISOString(),
      closedAt: incident.closedAt ? incident.closedAt.toISOString() : null,
    },
    caseFile: normalizeImportedAuroraCaseFile(incident.caseFile),
  }
}

export async function updateIncident(args: {
  actor: AccessActor
  incidentId: string
  title?: string
  summary?: string | null
  status?: SecurityIncidentStatus
  severity?: SecurityIncidentSeverity
  caseFile?: unknown
  mispEventId?: string | null
  mispPushedAt?: string | null
  expectedUpdatedAt?: string | null
}): Promise<{ updatedAt: string }> {
  const incident = await prisma.securityIncident.findUnique({
    where: { id: args.incidentId },
    select: { ownerUserId: true, updatedAt: true },
  })

  if (!incident) {
    throw new AccessControlError("Not found", 404, "NOT_FOUND")
  }

  assertCanWriteOwnedResource({
    actor: args.actor,
    ownerUserId: incident.ownerUserId,
  })

  if (args.expectedUpdatedAt) {
    const expected = new Date(args.expectedUpdatedAt)
    if (Number.isNaN(expected.getTime())) {
      throw new Error("expectedUpdatedAt must be an ISO date string")
    }
    if (incident.updatedAt.toISOString() !== expected.toISOString()) {
      const error = new Error("Conflict")
      ;(error as any).status = 409
      throw error
    }
  }

  const data: Prisma.SecurityIncidentUpdateInput = {}

  const title = asNonEmptyString(args.title)
  if (title) {
    data.title = title
  }

  if (typeof args.summary === "string") {
    data.summary = args.summary.trim() || null
  } else if (args.summary === null) {
    data.summary = null
  }

  if (args.status) {
    data.status = args.status
    if (args.status === "closed") {
      data.closedAt = new Date()
    }
  }

  if (args.severity) {
    data.severity = args.severity
  }

  if (args.caseFile !== undefined) {
    data.caseFile = normalizeImportedAuroraCaseFile(args.caseFile) as unknown as Prisma.InputJsonValue
  }

  if (typeof args.mispEventId === "string") {
    const trimmed = args.mispEventId.trim()
    data.mispEventId = trimmed.length > 0 ? trimmed : null
  } else if (args.mispEventId === null) {
    data.mispEventId = null
  }

  if (typeof args.mispPushedAt === "string") {
    const parsed = new Date(args.mispPushedAt)
    if (!Number.isNaN(parsed.getTime())) {
      data.mispPushedAt = parsed
    }
  } else if (args.mispPushedAt === null) {
    data.mispPushedAt = null
  }

  const updated = await prisma.securityIncident.update({
    where: { id: args.incidentId },
    data,
    select: { updatedAt: true },
  })

  return { updatedAt: updated.updatedAt.toISOString() }
}

export async function upsertMotionIncident(args: {
  ownerUserId: string
  entityKey: string
  entityType: string
  decision: "warn" | "block"
  reasons: unknown
  now?: Date
  shipDeploymentId?: string | null
  subagentId?: string | null
  stationKey?: string | null
  bridgeCrewId?: string | null
  traceId?: string | null
  sessionId?: string | null
  interactionId?: string | null
  responseInteractionId?: string | null
  motionSampleId?: string | null
}): Promise<{ incidentId: string; evidencePath: string | null; created: boolean } | null> {
  if (!securityIncidentsEnabled()) {
    return null
  }

  const now = args.now || new Date()
  const dedupeKey = `motion:${args.ownerUserId}:${args.entityKey}`
  const title = `Motion anomaly: ${args.entityKey}`

  const evidencePayload = {
    kind: "motion_supervision_anomaly",
    at: now.toISOString(),
    entityKey: args.entityKey,
    entityType: args.entityType,
    decision: args.decision,
    reasons: args.reasons,
    refs: {
      motionSampleId: args.motionSampleId ?? null,
      traceId: args.traceId ?? null,
      sessionId: args.sessionId ?? null,
      interactionId: args.interactionId ?? null,
      responseInteractionId: args.responseInteractionId ?? null,
    },
    context: {
      shipDeploymentId: args.shipDeploymentId ?? null,
      subagentId: args.subagentId ?? null,
      stationKey: args.stationKey ?? null,
      bridgeCrewId: args.bridgeCrewId ?? null,
    },
  }

  let evidencePath: string | null = null
  const timelineEntry = {
    recid: 0,
    date_time: now.toISOString(),
    event_type: { id: 10, text: "Misc" },
    attribution: "motion-supervision",
    event_data: JSON.stringify(
      {
        decision: args.decision,
        entityKey: args.entityKey,
        entityType: args.entityType,
        shipDeploymentId: args.shipDeploymentId ?? null,
        subagentId: args.subagentId ?? null,
        stationKey: args.stationKey ?? null,
        bridgeCrewId: args.bridgeCrewId ?? null,
        refs: {
          motionSampleId: args.motionSampleId ?? null,
          traceId: args.traceId ?? null,
          sessionId: args.sessionId ?? null,
          interactionId: args.interactionId ?? null,
          responseInteractionId: args.responseInteractionId ?? null,
        },
        reasons: args.reasons,
      },
      null,
      2,
    ),
    followup: args.decision === "block",
    visual: false,
  }

  const existing = await prisma.securityIncident.findUnique({
    where: {
      dedupeKey,
    },
    select: {
      id: true,
      status: true,
      caseFile: true,
    },
  })

  if (!existing) {
    const caseFile = buildEmptyAuroraCaseFile()
    timelineEntry.recid = nextRecid(caseFile.timeline)
    caseFile.timeline.push(timelineEntry as any)

    const created = await prisma.securityIncident.create({
      data: {
        ownerUserId: args.ownerUserId,
        dedupeKey,
        title,
        severity: args.decision === "block" ? "high" : "medium",
        status: "open",
        caseFile: caseFile as unknown as Prisma.InputJsonValue,
      },
      select: {
        id: true,
      },
    })

    try {
      const written = await writeSecurityIncidentEvidenceBlob({
        incidentId: created.id,
        provider: "supervision",
        kind: "motion",
        payload: evidencePayload,
        now,
      })
      evidencePath = written.path
    } catch (error) {
      console.error("Failed to write supervision evidence blob (fail-open):", error)
    }

    return { incidentId: created.id, evidencePath, created: true }
  }

  const normalized = normalizeImportedAuroraCaseFile(existing.caseFile)
  timelineEntry.recid = nextRecid(normalized.timeline)
  normalized.timeline.push(timelineEntry as any)

  const updated = await prisma.securityIncident.update({
    where: {
      id: existing.id,
    },
    data: {
      status: existing.status === "closed" ? "open" : existing.status,
      ...(existing.status === "closed" ? { closedAt: null } : {}),
      severity: args.decision === "block" ? "high" : undefined,
      caseFile: normalized as unknown as Prisma.InputJsonValue,
    },
    select: {
      id: true,
    },
  })

  try {
    const written = await writeSecurityIncidentEvidenceBlob({
      incidentId: updated.id,
      provider: "supervision",
      kind: "motion",
      payload: evidencePayload,
      now,
    })
    evidencePath = written.path
  } catch (error) {
    console.error("Failed to write supervision evidence blob (fail-open):", error)
  }

  return { incidentId: updated.id, evidencePath, created: false }
}
