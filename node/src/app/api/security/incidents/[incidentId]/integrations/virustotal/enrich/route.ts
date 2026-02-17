import { NextRequest, NextResponse } from "next/server"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"
import { securityIncidentsEnabled } from "@/lib/security/incident-response/feature-flag"
import { getIncidentForActor, updateIncident } from "@/lib/security/incident-response/persistence"
import { nextRecid } from "@/lib/security/incident-response/recid"
import { writeSecurityIncidentEvidenceBlob } from "@/lib/security/incident-response/evidence-store"
import { getSecurityIntegrationSecretsSummary } from "@/lib/security/integrations/secret-vault"
import {
  extractVirusTotalMaliciousCount,
  fetchVirusTotalDomainInfo,
  fetchVirusTotalFileInfo,
  fetchVirusTotalIpInfo,
  fetchVirusTotalUrlInfo,
  VirusTotalError,
} from "@/lib/security/integrations/virustotal"

export const dynamic = "force-dynamic"

function toRecid(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function vtStatusFromResponse(args: { ok: boolean; status: number; payload: unknown }): "infected" | "clean" | "noresult" | "unknown" {
  if (!args.ok && args.status === 404) {
    return "noresult"
  }
  if (!args.ok) {
    return "unknown"
  }

  const malicious = extractVirusTotalMaliciousCount(args.payload)
  if (malicious === null) {
    return "unknown"
  }
  return malicious > 0 ? "infected" : "clean"
}

export async function POST(request: NextRequest, context: { params: Promise<{ incidentId: string }> }) {
  if (!securityIncidentsEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  try {
    const actor = await requireAccessActor()
    const { incidentId } = await context.params
    const body = await request.json().catch(() => ({}))

    const grid = body?.grid === "malware" || body?.grid === "network" ? body.grid : null
    const recid = toRecid(body?.recid)
    if (!grid || !recid) {
      return NextResponse.json({ error: "grid and recid are required" }, { status: 400 })
    }

    const incident = await getIncidentForActor({ actor, incidentId })
    const secrets = await getSecurityIntegrationSecretsSummary({ userId: actor.userId })
    const vtKey = secrets.resolved.virustotal_api_key
    if (!vtKey) {
      return NextResponse.json({ error: "VirusTotal API key not configured." }, { status: 400 })
    }

    const caseFile = incident.caseFile
    const evidenceRecids: number[] = []
    const now = new Date()

    if (grid === "malware") {
      const record = caseFile.malware.find((r) => r.recid === recid)
      if (!record) {
        return NextResponse.json({ error: "Malware record not found." }, { status: 404 })
      }

      const hash = asNonEmptyString(record.md5)
      if (!hash) {
        return NextResponse.json({ error: "Malware record is missing md5/hash." }, { status: 400 })
      }

      const vt = await fetchVirusTotalFileInfo({ apiKey: vtKey, id: hash })
      const status = vtStatusFromResponse(vt)
      record.vt = status

      const blob = await writeSecurityIncidentEvidenceBlob({
        incidentId: incident.incident.id,
        provider: "vt",
        kind: `file_${hash.slice(0, 12)}`,
        payload: vt.payload,
        now,
      })

      const evidenceId = nextRecid(caseFile.evidence)
      caseFile.evidence.push({
        recid: evidenceId,
        date_acquired: now.toISOString(),
        type: "External Source",
        name: `VirusTotal file lookup`,
        description: `VirusTotal enrichment for malware recid=${recid} hash=${hash}`,
        hash,
        provider: "VirusTotal",
        location: blob.path,
      } as any)
      evidenceRecids.push(evidenceId)
    }

    if (grid === "network") {
      const record = caseFile.network_indicators.find((r) => r.recid === recid)
      if (!record) {
        return NextResponse.json({ error: "Network record not found." }, { status: 404 })
      }

      const ip = asNonEmptyString(record.ip)
      const domainOrUrl = asNonEmptyString(record.domainname)

      if (!ip && !domainOrUrl) {
        return NextResponse.json({ error: "Network record must include ip and/or domainname." }, { status: 400 })
      }

      let status: "infected" | "clean" | "noresult" | "unknown" = "unknown"

      if (ip) {
        const vt = await fetchVirusTotalIpInfo({ apiKey: vtKey, ip })
        status = vtStatusFromResponse(vt)

        const blob = await writeSecurityIncidentEvidenceBlob({
          incidentId: incident.incident.id,
          provider: "vt",
          kind: `ip_${ip.replace(/[^0-9a-fA-F.:-]/g, "-")}`,
          payload: vt.payload,
          now,
        })

        const evidenceId = nextRecid(caseFile.evidence)
        caseFile.evidence.push({
          recid: evidenceId,
          date_acquired: now.toISOString(),
          type: "External Source",
          name: `VirusTotal IP lookup`,
          description: `VirusTotal enrichment for network recid=${recid} ip=${ip}`,
          provider: "VirusTotal",
          location: blob.path,
        } as any)
        evidenceRecids.push(evidenceId)
      }

      if (domainOrUrl) {
        const isUrl = domainOrUrl.includes("://")
        const vt = isUrl
          ? await fetchVirusTotalUrlInfo({ apiKey: vtKey, urlOrId: domainOrUrl })
          : await fetchVirusTotalDomainInfo({ apiKey: vtKey, domain: domainOrUrl })

        const domainStatus = vtStatusFromResponse(vt)
        // Keep the "worst" status if we enriched both IP and domain.
        if (status === "infected" || domainStatus === "infected") {
          status = "infected"
        } else if (status === "noresult" && domainStatus === "clean") {
          status = "clean"
        } else if (status === "clean" && domainStatus === "noresult") {
          status = "clean"
        } else if (status === "unknown") {
          status = domainStatus
        }

        const blob = await writeSecurityIncidentEvidenceBlob({
          incidentId: incident.incident.id,
          provider: "vt",
          kind: isUrl ? "url" : "domain",
          payload: vt.payload,
          now,
        })

        const evidenceId = nextRecid(caseFile.evidence)
        caseFile.evidence.push({
          recid: evidenceId,
          date_acquired: now.toISOString(),
          type: "External Source",
          name: isUrl ? `VirusTotal URL lookup` : `VirusTotal domain lookup`,
          description: `VirusTotal enrichment for network recid=${recid} value=${domainOrUrl}`,
          provider: "VirusTotal",
          location: blob.path,
        } as any)
        evidenceRecids.push(evidenceId)
      }

      ;(record as any).vt = status
    }

    const updated = await updateIncident({
      actor,
      incidentId: incident.incident.id,
      caseFile,
      expectedUpdatedAt: incident.incident.updatedAt,
    })

    return NextResponse.json({ ok: true, evidenceRecids, updatedAt: updated.updatedAt })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    if (error instanceof VirusTotalError) {
      return NextResponse.json({ error: error.message, code: error.code, details: error.details ?? null }, { status: error.status })
    }

    const status = typeof (error as any)?.status === "number" ? (error as any).status : null
    if (status === 409) {
      return NextResponse.json({ error: "Incident has been updated elsewhere.", code: "CONFLICT" }, { status: 409 })
    }

    console.error("Error enriching incident with VirusTotal:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
