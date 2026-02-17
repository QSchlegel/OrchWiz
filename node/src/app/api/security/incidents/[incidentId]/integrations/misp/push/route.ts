import { NextRequest, NextResponse } from "next/server"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"
import { securityIncidentsEnabled } from "@/lib/security/incident-response/feature-flag"
import { getIncidentForActor, updateIncident } from "@/lib/security/incident-response/persistence"
import { nextRecid } from "@/lib/security/incident-response/recid"
import { writeSecurityIncidentEvidenceBlob } from "@/lib/security/incident-response/evidence-store"
import { getSecurityIntegrationSecretsSummary } from "@/lib/security/integrations/secret-vault"
import { addMispAttribute, createMispEvent, MispError } from "@/lib/security/integrations/misp"

export const dynamic = "force-dynamic"

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function inferHashType(hash: string): "md5" | "sha1" | "sha256" | null {
  const normalized = hash.trim().toLowerCase()
  if (normalized.length === 32) return "md5"
  if (normalized.length === 40) return "sha1"
  if (normalized.length === 64) return "sha256"
  return null
}

export async function POST(request: NextRequest, context: { params: Promise<{ incidentId: string }> }) {
  if (!securityIncidentsEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  try {
    const actor = await requireAccessActor()
    const { incidentId } = await context.params
    const body = await request.json().catch(() => ({}))

    const requestedGrids: Array<"malware" | "network"> =
      Array.isArray(body?.grids) && body.grids.every((g: unknown) => g === "malware" || g === "network")
        ? body.grids
        : ["malware", "network"]

    const incident = await getIncidentForActor({ actor, incidentId })
    const secrets = await getSecurityIntegrationSecretsSummary({ userId: actor.userId })
    const mispBaseUrl = secrets.resolved.misp_base_url
    const mispApiKey = secrets.resolved.misp_api_key

    if (!mispBaseUrl || !mispApiKey) {
      return NextResponse.json({ error: "MISP base URL and API key must be configured." }, { status: 400 })
    }

    const now = new Date()
    const caseFile = incident.caseFile

    let mispEventId = asStringOrNull(incident.incident.mispEventId) || asStringOrNull(caseFile.mispeventid)
    const rawResponses: Record<string, unknown> = {
      createdEvent: null,
      attributes: [],
      skipped: [],
    }

    if (!mispEventId) {
      const created = await createMispEvent({
        baseUrl: mispBaseUrl,
        apiKey: mispApiKey,
        info: `OrchWiz IR: ${incident.incident.title} (${incident.incident.id})`,
        published: false,
      })

      rawResponses.createdEvent = created.payload
      if (!created.ok || !created.eventId) {
        return NextResponse.json({ error: "Failed to create MISP event." }, { status: 502 })
      }
      mispEventId = created.eventId
    }

    const plannedAttributes: Array<{
      category: string
      type: string
      value: string
      comment?: string
      source: string
    }> = []

    if (requestedGrids.includes("malware")) {
      for (const record of caseFile.malware) {
        const hash = asNonEmptyString(record.md5)
        if (!hash) continue

        const hashType = inferHashType(hash)
        if (!hashType) {
          const noteId = nextRecid(caseFile.casenotes)
          caseFile.casenotes.push({
            recid: noteId,
            date_added: now.toISOString(),
            owner: actor.email || "orchwiz",
            note: `MISP push skipped malware recid=${record.recid}: unsupported hash length (${hash.length}).`,
          } as any)
          rawResponses.skipped = [
            ...(rawResponses.skipped as unknown[]),
            { grid: "malware", recid: record.recid, reason: "unsupported_hash", hash },
          ]
          continue
        }

        plannedAttributes.push({
          category: "Payload installation",
          type: hashType,
          value: hash,
          comment: asNonEmptyString(record.notes)?.slice(0, 500) || undefined,
          source: `malware:${record.recid}`,
        })
      }
    }

    if (requestedGrids.includes("network")) {
      for (const record of caseFile.network_indicators) {
        const ip = asNonEmptyString(record.ip)
        const domainOrUrl = asNonEmptyString(record.domainname)
        const comment = asNonEmptyString(record.context)?.slice(0, 500) || undefined

        if (ip) {
          plannedAttributes.push({
            category: "Network activity",
            type: "ip-dst",
            value: ip,
            comment,
            source: `network:${record.recid}:ip`,
          })
        }

        if (domainOrUrl) {
          const isUrl = domainOrUrl.includes("://")
          plannedAttributes.push({
            category: "Network activity",
            type: isUrl ? "url" : "domain",
            value: domainOrUrl,
            comment,
            source: `network:${record.recid}:${isUrl ? "url" : "domain"}`,
          })
        }
      }
    }

    const dedupe = new Set<string>()
    let pushedAttributeCount = 0

    for (const attribute of plannedAttributes) {
      const key = `${attribute.type}:${attribute.value}`
      if (dedupe.has(key)) continue
      dedupe.add(key)

      const result = await addMispAttribute({
        baseUrl: mispBaseUrl,
        apiKey: mispApiKey,
        eventId: mispEventId,
        value: attribute.value,
        category: attribute.category,
        type: attribute.type,
        comment: attribute.comment,
      })

      ;(rawResponses.attributes as unknown[]).push({
        request: attribute,
        response: result.payload,
        ok: result.ok,
        status: result.status,
      })

      if (result.ok) {
        pushedAttributeCount += 1
      }
    }

    // Persist raw API responses as evidence artifacts.
    const evidenceBlob = await writeSecurityIncidentEvidenceBlob({
      incidentId: incident.incident.id,
      provider: "misp",
      kind: `push_${requestedGrids.join("_")}`,
      payload: rawResponses,
      now,
    })

    const evidenceId = nextRecid(caseFile.evidence)
    caseFile.evidence.push({
      recid: evidenceId,
      date_acquired: now.toISOString(),
      type: "External Source",
      name: "MISP push",
      description: `Pushed ${pushedAttributeCount} attribute(s) to MISP event ${mispEventId}`,
      provider: "MISP",
      location: evidenceBlob.path,
    } as any)

    // Keep Aurora compatibility fields up to date (without persisting API keys).
    caseFile.mispserver = mispBaseUrl
    caseFile.mispeventid = mispEventId

    const updated = await updateIncident({
      actor,
      incidentId: incident.incident.id,
      caseFile,
      mispEventId,
      mispPushedAt: now.toISOString(),
      expectedUpdatedAt: incident.incident.updatedAt,
    })

    return NextResponse.json({
      ok: true,
      mispEventId,
      pushedAttributeCount,
      evidenceRecid: evidenceId,
      updatedAt: updated.updatedAt,
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    if (error instanceof MispError) {
      return NextResponse.json({ error: error.message, code: error.code, details: error.details ?? null }, { status: error.status })
    }

    const status = typeof (error as any)?.status === "number" ? (error as any).status : null
    if (status === 409) {
      return NextResponse.json({ error: "Incident has been updated elsewhere.", code: "CONFLICT" }, { status: 409 })
    }

    console.error("Error pushing incident indicators to MISP:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
