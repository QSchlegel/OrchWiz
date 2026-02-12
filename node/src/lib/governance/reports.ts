import { mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import type { GovernanceEventType } from "@prisma/client"
import { resolveSecurityAuditDirectory } from "@/lib/security/paths"

export interface GovernanceReportActorSnapshot {
  userId: string
  actingBridgeCrewId?: string | null
  actingBridgeCrewRole?: string | null
  actingBridgeCrewCallsign?: string | null
}

export interface GovernanceSecurityReportPayload {
  reportId: string
  createdAt: string
  ownerUserId: string
  eventType: GovernanceEventType
  rationale: string
  chainDecision: string
  actor: GovernanceReportActorSnapshot
  resource: Record<string, unknown>
  metadata?: Record<string, unknown> | null
  reportPathMd?: string
  reportPathJson?: string
}

function sanitizeUserId(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, "-")
}

export function buildGovernanceSecurityReportId(now = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-")
  return `gsec-${stamp}-${Math.random().toString(16).slice(2, 8)}`
}

function renderGovernanceSecurityMarkdown(report: GovernanceSecurityReportPayload): string {
  const lines: string[] = []

  lines.push(`# Access Governance Security Report: ${report.reportId}`)
  lines.push("")
  lines.push(`- Generated: ${report.createdAt}`)
  lines.push(`- Owner user: ${report.ownerUserId}`)
  lines.push(`- Event type: ${report.eventType}`)
  lines.push(`- Actor user: ${report.actor.userId}`)
  lines.push(`- Acting bridge crew: ${report.actor.actingBridgeCrewId || "none"}`)
  lines.push(`- Acting role: ${report.actor.actingBridgeCrewRole || "owner"}`)
  lines.push(`- Chain decision: ${report.chainDecision}`)
  lines.push("")
  lines.push("## Rationale")
  lines.push(report.rationale)
  lines.push("")
  lines.push("## Resource")
  lines.push("```json")
  lines.push(JSON.stringify(report.resource, null, 2))
  lines.push("```")

  if (report.metadata && Object.keys(report.metadata).length > 0) {
    lines.push("")
    lines.push("## Metadata")
    lines.push("```json")
    lines.push(JSON.stringify(report.metadata, null, 2))
    lines.push("```")
  }

  return `${lines.join("\n")}\n`
}

export async function writeGovernanceSecurityReport(args: {
  ownerUserId: string
  eventType: GovernanceEventType
  rationale: string
  chainDecision?: string
  actor: GovernanceReportActorSnapshot
  resource: Record<string, unknown>
  metadata?: Record<string, unknown> | null
}): Promise<GovernanceSecurityReportPayload> {
  const now = new Date()
  const reportId = buildGovernanceSecurityReportId(now)
  const createdAt = now.toISOString()

  const root = resolve(resolveSecurityAuditDirectory(), "Access-Grants")
  await mkdir(root, { recursive: true })

  const timestamp = createdAt.replace(/[:.]/g, "-")
  const baseName = `governance_${sanitizeUserId(args.ownerUserId)}_${timestamp}_${reportId}`
  const reportPathMd = resolve(root, `${baseName}.md`)
  const reportPathJson = resolve(root, `${baseName}.json`)

  const payload: GovernanceSecurityReportPayload = {
    reportId,
    createdAt,
    ownerUserId: args.ownerUserId,
    eventType: args.eventType,
    rationale: args.rationale,
    chainDecision: args.chainDecision
      || (args.actor.actingBridgeCrewRole === "xo"
        ? "acting_xo_authority"
        : args.actor.actingBridgeCrewId
          ? "assigned_bridge_crew_authority"
          : "owner_authority"),
    actor: args.actor,
    resource: args.resource,
    metadata: args.metadata || null,
    reportPathMd,
    reportPathJson,
  }

  await writeFile(reportPathMd, renderGovernanceSecurityMarkdown(payload), "utf8")
  await writeFile(reportPathJson, JSON.stringify(payload, null, 2), "utf8")

  return payload
}
