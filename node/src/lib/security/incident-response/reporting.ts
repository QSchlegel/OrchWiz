import { mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { resolveSecurityIncidentDirectory } from "@/lib/security/paths"
import type { AuroraCaseFile } from "./types"

function safeStamp(now = new Date()): string {
  return now.toISOString().replace(/[:.]/g, "-")
}

function asDisplayString(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (typeof value === "object" && !Array.isArray(value)) {
    const maybeText = (value as { text?: unknown }).text
    if (typeof maybeText === "string") return maybeText
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function summarizeCaseFile(caseFile: AuroraCaseFile): string[] {
  const lines: string[] = []
  lines.push("## Case Metadata")
  lines.push(`- case_id: ${asDisplayString(caseFile.case_id)}`)
  lines.push(`- client: ${asDisplayString(caseFile.client)}`)
  lines.push(`- start_date: ${asDisplayString(caseFile.start_date)}`)
  lines.push(`- summary: ${asDisplayString(caseFile.summary)}`)
  return lines
}

function renderTimeline(caseFile: AuroraCaseFile): string[] {
  const lines: string[] = []
  lines.push("## Timeline")

  const records = [...(caseFile.timeline || [])]
  records.sort((a, b) => asDisplayString(a.date_time).localeCompare(asDisplayString(b.date_time)))

  if (records.length === 0) {
    lines.push("- (none)")
    return lines
  }

  for (const record of records) {
    const dateTime = asDisplayString(record.date_time)
    const eventType = asDisplayString(record.event_type)
    const host = asDisplayString(record.event_host)
    const sourceHost = asDisplayString(record.event_source_host)
    const direction = asDisplayString(record.direction)
    const killchain = asDisplayString(record.killchain)
    const eventData = asDisplayString(record.event_data)
    const notes = asDisplayString(record.notes)

    const bits = [
      dateTime ? `**${dateTime}**` : "**(no time)**",
      eventType ? `\`${eventType}\`` : null,
      host ? `host=${host}` : null,
      direction ? `dir=${direction}` : null,
      sourceHost ? `src=${sourceHost}` : null,
      killchain ? `kc=${killchain}` : null,
    ].filter(Boolean)

    lines.push(`- ${bits.join(" ")}: ${eventData || "(no event data)"}`)
    if (notes) {
      lines.push(`  - Notes: ${notes}`)
    }
  }

  return lines
}

function renderMalware(caseFile: AuroraCaseFile): string[] {
  const lines: string[] = []
  lines.push("## Malware / Tools")

  const records = caseFile.malware || []
  if (records.length === 0) {
    lines.push("- (none)")
    return lines
  }

  for (const record of records) {
    const filename = asDisplayString(record.text)
    const host = asDisplayString(record.hostname)
    const hash = asDisplayString(record.md5)
    const vt = asDisplayString(record.vt)
    const notes = asDisplayString(record.notes)

    lines.push(`- ${filename || "(no filename)"}${hash ? ` (hash=${hash})` : ""}${host ? ` host=${host}` : ""}${vt ? ` vt=${vt}` : ""}`)
    if (notes) {
      lines.push(`  - Notes: ${notes}`)
    }
  }

  return lines
}

function renderNetwork(caseFile: AuroraCaseFile): string[] {
  const lines: string[] = []
  lines.push("## Network Indicators")

  const records = caseFile.network_indicators || []
  if (records.length === 0) {
    lines.push("- (none)")
    return lines
  }

  for (const record of records) {
    const ip = asDisplayString(record.ip)
    const domain = asDisplayString(record.domainname)
    const port = asDisplayString(record.port)
    const vt = asDisplayString((record as any).vt)
    const context = asDisplayString(record.context)

    const target = [ip, domain].filter(Boolean).join(" ")
    lines.push(`- ${target || "(no indicator)"}${port ? ` port=${port}` : ""}${vt ? ` vt=${vt}` : ""}`)
    if (context) {
      lines.push(`  - Context: ${context}`)
    }
  }

  return lines
}

function renderActions(caseFile: AuroraCaseFile): string[] {
  const lines: string[] = []
  lines.push("## Actions")

  const records = caseFile.actions || []
  if (records.length === 0) {
    lines.push("- (none)")
    return lines
  }

  for (const record of records) {
    const due = asDisplayString(record.date_due)
    const status = asDisplayString(record.status)
    const owner = asDisplayString(record.owner)
    const task = asDisplayString(record.task)
    lines.push(`- ${task || "(no task)"}${status ? ` status=${status}` : ""}${due ? ` due=${due}` : ""}${owner ? ` owner=${owner}` : ""}`)
  }

  return lines
}

function renderCaseNotes(caseFile: AuroraCaseFile): string[] {
  const lines: string[] = []
  lines.push("## Case Notes")

  const records = caseFile.casenotes || []
  if (records.length === 0) {
    lines.push("- (none)")
    return lines
  }

  for (const record of records) {
    const date = asDisplayString(record.date_added)
    const owner = asDisplayString(record.owner)
    const note = asDisplayString(record.note)
    lines.push(`- ${date ? `**${date}** ` : ""}${owner ? `(${owner}) ` : ""}${note || "(empty note)"}`)
  }

  return lines
}

function renderEvidence(caseFile: AuroraCaseFile): string[] {
  const lines: string[] = []
  lines.push("## Evidence")

  const records = caseFile.evidence || []
  if (records.length === 0) {
    lines.push("- (none)")
    return lines
  }

  for (const record of records) {
    const date = asDisplayString(record.date_acquired)
    const type = asDisplayString(record.type)
    const name = asDisplayString(record.name)
    const hash = asDisplayString(record.hash)
    const provider = asDisplayString(record.provider)
    const location = asDisplayString(record.location)
    lines.push(`- ${date ? `**${date}** ` : ""}${name || "(evidence)"}${type ? ` type=${type}` : ""}${hash ? ` hash=${hash}` : ""}${provider ? ` provider=${provider}` : ""}`)
    if (location) {
      lines.push(`  - Location: ${location}`)
    }
  }

  return lines
}

function renderSecurityIncidentMarkdown(args: {
  incident: {
    id: string
    title: string
    status: string
    severity: string
    createdAt: string
    updatedAt: string
    closedAt: string | null
    sessionId: string | null
    mispEventId: string | null
  }
  caseFile: AuroraCaseFile
  reportPathMd: string
  reportPathJson: string
}): string {
  const lines: string[] = []
  lines.push(`# Security Incident Snapshot: ${args.incident.title}`)
  lines.push("")
  lines.push(`- Incident ID: ${args.incident.id}`)
  lines.push(`- Status: ${args.incident.status}`)
  lines.push(`- Severity: ${args.incident.severity}`)
  lines.push(`- Created: ${args.incident.createdAt}`)
  lines.push(`- Updated: ${args.incident.updatedAt}`)
  lines.push(`- Closed: ${args.incident.closedAt || "n/a"}`)
  lines.push(`- Session: ${args.incident.sessionId || "n/a"}`)
  lines.push(`- MISP Event: ${args.incident.mispEventId || "n/a"}`)
  lines.push("")
  lines.push(`- Snapshot Markdown: ${args.reportPathMd}`)
  lines.push(`- Snapshot JSON: ${args.reportPathJson}`)
  lines.push("")

  lines.push(...summarizeCaseFile(args.caseFile))
  lines.push("")
  lines.push(...renderTimeline(args.caseFile))
  lines.push("")
  lines.push(...renderMalware(args.caseFile))
  lines.push("")
  lines.push(...renderNetwork(args.caseFile))
  lines.push("")
  lines.push(...renderActions(args.caseFile))
  lines.push("")
  lines.push(...renderCaseNotes(args.caseFile))
  lines.push("")
  lines.push(...renderEvidence(args.caseFile))

  return `${lines.join("\n")}\n`
}

export async function writeSecurityIncidentSnapshot(args: {
  incident: {
    id: string
    title: string
    status: string
    severity: string
    createdAt: string
    updatedAt: string
    closedAt: string | null
    sessionId: string | null
    mispEventId: string | null
  }
  caseFile: AuroraCaseFile
  now?: Date
}): Promise<{ reportPathMd: string; reportPathJson: string }> {
  const root = resolveSecurityIncidentDirectory()
  await mkdir(root, { recursive: true })

  const stamp = safeStamp(args.now)
  const baseName = `security_incident_${args.incident.id}_${stamp}`
  const reportPathMd = resolve(root, `${baseName}.md`)
  const reportPathJson = resolve(root, `${baseName}.json`)

  const snapshotPayload = {
    incident: args.incident,
    caseFile: args.caseFile,
    reportPathMd,
    reportPathJson,
    createdAt: stamp,
  }

  const markdown = renderSecurityIncidentMarkdown({
    incident: args.incident,
    caseFile: args.caseFile,
    reportPathMd,
    reportPathJson,
  })

  await writeFile(reportPathMd, markdown, "utf8")
  await writeFile(reportPathJson, JSON.stringify(snapshotPayload, null, 2), "utf8")

  return { reportPathMd, reportPathJson }
}

