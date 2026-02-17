import { mkdir, writeFile } from "node:fs/promises"
import { resolve as resolvePath } from "node:path"
import { prisma } from "@/lib/prisma"
import { executeShipQuartermasterPrompt } from "@/lib/quartermaster/api"
import { ensureFleetQuartermasterSession } from "@/lib/quartermaster/service"
import {
  QUARTERMASTER_CALLSIGN,
  QUARTERMASTER_CHANNEL,
  QUARTERMASTER_RUNTIME_PROFILE,
} from "@/lib/quartermaster/constants"
import { executeSessionPrompt } from "@/lib/runtime/session-prompt"
import { resolveSecurityAuditReviewDirectory } from "@/lib/security/paths"
import type { SecurityAuditReport } from "./types"
import type { UnusualReading } from "./unusual-readings"

export interface QuartermasterSecurityAuditReview {
  status: "ok" | "error"
  generatedAt: string
  text: string
  provider: string | null
  fallbackUsed: boolean
  warnings: string[]
  vaultReviewPath: string | null
  quartermasterSessionId: string | null
  quartermasterInteractionId: string | null
  errorMessage: string | null
}

function sanitizeUserId(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, "-")
}

function renderUnusualReadings(readings: UnusualReading[]): string {
  if (!readings || readings.length === 0) {
    return "- None detected by system flags."
  }
  return readings
    .map((reading) => `- [${reading.level.toUpperCase()}] ${reading.code}: ${reading.message}`)
    .join("\n")
}

function renderTopFindings(report: SecurityAuditReport, limit = 12): string {
  if (!report.findings || report.findings.length === 0) {
    return "- None."
  }

  const severityRank: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
  }

  const sorted = [...report.findings].sort((left, right) => {
    const leftRank = severityRank[left.severity] ?? 99
    const rightRank = severityRank[right.severity] ?? 99
    if (leftRank !== rightRank) return leftRank - rightRank
    return left.title.localeCompare(right.title)
  })

  return sorted.slice(0, Math.max(1, limit)).map((finding) => {
    const controls = finding.controlIds.length > 0 ? ` (${finding.controlIds.join(", ")})` : ""
    const base = `- [${finding.severity.toUpperCase()}] ${finding.title}${controls}: ${finding.summary}`
    const recommendation = finding.recommendation ? `\n  - Recommendation: ${finding.recommendation}` : ""
    return `${base}${recommendation}`
  }).join("\n")
}

function buildQuartermasterPrompt(args: {
  report: SecurityAuditReport
  unusualReadings: UnusualReading[]
  trigger: "manual" | "cron"
  dayKey: string | null
}): string {
  const report = args.report
  const checks = report.checks
    .map((check) => `- ${check.name}: ${check.status.toUpperCase()} (${check.findings.length} findings)`)
    .join("\n")

  return [
    "You are QTM-LGR (Quartermaster): calm, kind, and practical.",
    "",
    "We just ran a Security Audit. Please review the log summary below and respond with:",
    "1) A 1-2 sentence status summary.",
    "2) Unusual readings:",
    "   - Start by listing every item in the 'System unusual readings' list (or say 'None').",
    "   - Add any additional unusual patterns you detect from the audit summary.",
    "3) Recommended next operator actions (numbered, safe + reversible).",
    "4) End with exactly: `Next Operator Action: ...`",
    "",
    `Trigger: ${args.trigger}${args.dayKey ? ` (dayKey=${args.dayKey})` : ""}`,
    `Report: ${report.reportId}`,
    `Created: ${report.createdAt}`,
    `Mode: ${report.mode}`,
    `Risk: ${report.riskScore.score} (${report.riskScore.level})`,
    `Risk delta: ${report.riskDelta === null ? "n/a" : report.riskDelta > 0 ? `+${report.riskDelta}` : `${report.riskDelta}`}`,
    `Previous risk: ${report.previousRiskScore === null ? "n/a" : report.previousRiskScore}`,
    `Severity counts: critical=${report.severityCounts.critical}, high=${report.severityCounts.high}, medium=${report.severityCounts.medium}, low=${report.severityCounts.low}, info=${report.severityCounts.info}`,
    "",
    "System unusual readings:",
    renderUnusualReadings(args.unusualReadings),
    "",
    "Check status:",
    checks || "- (no checks reported)",
    "",
    "Top findings:",
    renderTopFindings(report),
  ].join("\n")
}

function buildDeterministicFallbackReview(args: {
  report: SecurityAuditReport
  unusualReadings: UnusualReading[]
  trigger: "manual" | "cron"
  dayKey: string | null
}): string {
  const report = args.report
  const unusual = args.unusualReadings

  const unusualSection = unusual.length === 0
    ? "None detected by system flags."
    : unusual.map((entry) => `- [${entry.level.toUpperCase()}] ${entry.code}: ${entry.message}`).join("\n")

  const nextAction = unusual.length > 0
    ? "Review the highest-severity flagged items above and inspect the associated checks/findings first."
    : "No unusual readings detected; review the audit summary and keep an eye on risk delta in the next run."

  return [
    `Security Audit Review (${args.trigger}${args.dayKey ? ` dayKey=${args.dayKey}` : ""})`,
    `- Report: ${report.reportId}`,
    `- Created: ${report.createdAt}`,
    `- Risk: ${report.riskScore.score} (${report.riskScore.level})`,
    `- Risk delta: ${report.riskDelta === null ? "n/a" : report.riskDelta > 0 ? `+${report.riskDelta}` : `${report.riskDelta}`}`,
    "",
    "Unusual readings:",
    unusualSection,
    "",
    "Next steps:",
    `1) ${nextAction}`,
    "2) If risk increased, triage newly introduced findings first.",
    "Next Operator Action: Open the Security dashboard and review the latest audit + unusual readings.",
  ].join("\n")
}

async function writeVaultReviewNote(args: {
  userId: string
  report: SecurityAuditReport
  unusualReadings: UnusualReading[]
  trigger: "manual" | "cron"
  dayKey: string | null
  quartermasterText: string
  provider: string | null
  fallbackUsed: boolean
  generatedAt: string
  errorMessage: string | null
}): Promise<string> {
  const root = resolveSecurityAuditReviewDirectory()
  await mkdir(root, { recursive: true })

  const timestamp = args.generatedAt.replace(/[:.]/g, "-")
  const prefix = `security_audit_review_${sanitizeUserId(args.userId)}_`
  const baseName = `${prefix}${timestamp}_${args.report.reportId}`
  const filePath = resolvePath(root, `${baseName}.md`)

  const header = [
    `# Security Audit Review: ${args.report.reportId}`,
    "",
    `- Generated: ${args.generatedAt}`,
    `- Trigger: ${args.trigger}${args.dayKey ? ` (dayKey=${args.dayKey})` : ""}`,
    `- User: ${args.userId}`,
    `- Risk: ${args.report.riskScore.score} (${args.report.riskScore.level})`,
    `- Risk delta: ${args.report.riskDelta === null ? "n/a" : args.report.riskDelta > 0 ? `+${args.report.riskDelta}` : `${args.report.riskDelta}`}`,
    `- Previous risk: ${args.report.previousRiskScore === null ? "n/a" : args.report.previousRiskScore}`,
    `- Severity counts: critical=${args.report.severityCounts.critical}, high=${args.report.severityCounts.high}, medium=${args.report.severityCounts.medium}, low=${args.report.severityCounts.low}, info=${args.report.severityCounts.info}`,
    "",
    "## Unusual Readings (System Flags)",
    renderUnusualReadings(args.unusualReadings),
    "",
    "## Report Paths",
    `- Markdown: ${args.report.reportPathMd || "(missing)"}`,
    `- JSON: ${args.report.reportPathJson || "(missing)"}`,
    "",
    "## Quartermaster Review",
    "",
    `- Status: ${args.errorMessage ? "error" : "ok"}`,
    `- Provider: ${args.provider || "n/a"}`,
    `- Fallback used: ${args.fallbackUsed ? "true" : "false"}`,
    ...(args.errorMessage ? [`- Error: ${args.errorMessage}`] : []),
    "",
    "```text",
    args.quartermasterText.trim(),
    "```",
    "",
  ].join("\n")

  await writeFile(filePath, `${header}\n`, "utf8")
  return filePath
}

export async function runQuartermasterSecurityAuditReview(args: {
  userId: string
  report: SecurityAuditReport
  unusualReadings: UnusualReading[]
  trigger: "manual" | "cron"
  dayKey: string | null
}): Promise<QuartermasterSecurityAuditReview> {
  const generatedAt = new Date().toISOString()
  const prompt = buildQuartermasterPrompt(args)
  const fallbackReview = buildDeterministicFallbackReview(args)

  let reviewText = fallbackReview
  let provider: string | null = null
  let fallbackUsed = true
  let warnings: string[] = []
  let quartermasterSessionId: string | null = null
  let quartermasterInteractionId: string | null = null
  let errorMessage: string | null = null

  try {
    const latestShip = await prisma.agentDeployment.findFirst({
      where: {
        userId: args.userId,
        deploymentType: "ship",
      },
      select: {
        id: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
    })

    if (latestShip) {
      const result = await executeShipQuartermasterPrompt({
        userId: args.userId,
        shipDeploymentId: latestShip.id,
        prompt,
        requestedBackend: "auto",
        autoProvisionIfMissing: true,
        routePath: "/api/security/audits/nightly",
      })

      reviewText = result.responseInteraction.content
      provider = result.provider
      fallbackUsed = result.fallbackUsed
      warnings = result.warnings || []
      quartermasterSessionId = result.sessionId
      quartermasterInteractionId = result.responseInteraction.id
    } else {
      const fleet = await ensureFleetQuartermasterSession({ userId: args.userId })
      const result = await executeSessionPrompt({
        userId: args.userId,
        sessionId: fleet.sessionId,
        prompt,
        metadata: {
          runtime: {
            profile: QUARTERMASTER_RUNTIME_PROFILE,
            executionKind: "security_audit_review",
          },
          quartermaster: {
            channel: QUARTERMASTER_CHANNEL,
            callsign: QUARTERMASTER_CALLSIGN,
            subagentId: fleet.subagentId,
          },
          securityAudit: {
            trigger: args.trigger,
            dayKey: args.dayKey,
            reportId: args.report.reportId,
          },
        },
      })

      reviewText = result.responseInteraction.content
      provider = result.provider
      fallbackUsed = result.fallbackUsed
      warnings = result.warnings || []
      quartermasterSessionId = fleet.sessionId
      quartermasterInteractionId = result.responseInteraction.id
    }
  } catch (error) {
    errorMessage = (error as Error)?.message || "Quartermaster review failed."
  }

  let vaultReviewPath: string | null = null
  try {
    vaultReviewPath = await writeVaultReviewNote({
      userId: args.userId,
      report: args.report,
      unusualReadings: args.unusualReadings,
      trigger: args.trigger,
      dayKey: args.dayKey,
      quartermasterText: reviewText,
      provider,
      fallbackUsed,
      generatedAt,
      errorMessage,
    })
  } catch (error) {
    warnings = [...warnings, `Failed to write vault review note: ${(error as Error)?.message || "unknown error"}`]
  }

  return {
    status: errorMessage ? "error" : "ok",
    generatedAt,
    text: reviewText,
    provider,
    fallbackUsed,
    warnings,
    vaultReviewPath,
    quartermasterSessionId,
    quartermasterInteractionId,
    errorMessage,
  }
}

