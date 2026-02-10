import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { resolveSecurityAuditDirectory } from "@/lib/security/paths"
import type { SecurityAuditFinding, SecurityAuditReport } from "./types"

function sanitizeUserId(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, "-")
}

function reportPrefix(userId: string): string {
  return `security_audit_${sanitizeUserId(userId)}_`
}

export function buildSecurityAuditReportId(now = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-")
  return `sec-${stamp}-${Math.random().toString(16).slice(2, 8)}`
}

function summarizeFinding(finding: SecurityAuditFinding): string {
  const controls = finding.controlIds.length > 0 ? ` (${finding.controlIds.join(", ")})` : ""
  return `- **${finding.severity.toUpperCase()}** ${finding.title}${controls}: ${finding.summary}`
}

function renderSecurityAuditMarkdown(report: SecurityAuditReport): string {
  const sections: string[] = []

  sections.push(`# Security Audit Report: ${report.reportId}`)
  sections.push("")
  sections.push(`- Generated: ${report.createdAt}`)
  sections.push(`- User: ${report.userId}`)
  sections.push(`- Mode: ${report.mode}`)
  sections.push(`- Threat model version: ${report.threatModelVersion}`)
  sections.push(`- Risk score: ${report.riskScore.score} (${report.riskScore.level})`)
  sections.push(
    `- Severity counts: critical=${report.severityCounts.critical}, high=${report.severityCounts.high}, medium=${report.severityCounts.medium}, low=${report.severityCounts.low}, info=${report.severityCounts.info}`,
  )

  if (report.riskDelta !== null) {
    const sign = report.riskDelta > 0 ? "+" : ""
    sections.push(`- Risk delta vs previous report: ${sign}${report.riskDelta}`)
  }

  sections.push("")
  sections.push("## Findings")

  if (report.findings.length === 0) {
    sections.push("- No findings. Current posture checks passed.")
  } else {
    for (const finding of report.findings) {
      sections.push(summarizeFinding(finding))
      if (finding.recommendation) {
        sections.push(`  - Recommendation: ${finding.recommendation}`)
      }
      if (finding.evidence && finding.evidence.length > 0) {
        sections.push(`  - Evidence: ${finding.evidence.join("; ")}`)
      }
    }
  }

  sections.push("")
  sections.push("## Check Status")
  for (const check of report.checks) {
    sections.push(`- ${check.name}: ${check.status.toUpperCase()} (${check.findings.length} findings)`)
  }

  sections.push("")
  sections.push("## Bridge Crew Scorecard")
  if (!report.bridgeCrewScorecard) {
    sections.push("- Not included in this run.")
  } else {
    sections.push(`- Overall score: ${report.bridgeCrewScorecard.overallScore}`)
    if (report.bridgeCrewScoreDelta !== null) {
      const sign = report.bridgeCrewScoreDelta > 0 ? "+" : ""
      sections.push(`- Score delta vs previous: ${sign}${report.bridgeCrewScoreDelta}`)
    }
    sections.push(`- Sample size: ${report.bridgeCrewScorecard.sampleSize}`)
    sections.push(`- Failing scenarios: ${report.bridgeCrewScorecard.failingScenarios.join(", ") || "none"}`)
  }

  return `${sections.join("\n")}\n`
}

export async function writeSecurityAuditReport(args: {
  report: SecurityAuditReport
}): Promise<{ reportPathMd: string; reportPathJson: string }> {
  const root = resolveSecurityAuditDirectory()
  await mkdir(root, { recursive: true })

  const timestamp = args.report.createdAt.replace(/[:.]/g, "-")
  const prefix = reportPrefix(args.report.userId)
  const baseName = `${prefix}${timestamp}_${args.report.reportId}`
  const reportPathMd = resolve(root, `${baseName}.md`)
  const reportPathJson = resolve(root, `${baseName}.json`)

  const reportWithPaths: SecurityAuditReport = {
    ...args.report,
    reportPathMd,
    reportPathJson,
  }

  const markdown = renderSecurityAuditMarkdown(reportWithPaths)
  await writeFile(reportPathMd, markdown, "utf8")
  await writeFile(reportPathJson, JSON.stringify(reportWithPaths, null, 2), "utf8")

  return {
    reportPathMd,
    reportPathJson,
  }
}

export async function readLatestSecurityAuditReport(args: {
  userId: string
}): Promise<SecurityAuditReport | null> {
  const root = resolveSecurityAuditDirectory()

  let files: string[]
  try {
    files = await readdir(root)
  } catch {
    return null
  }

  const prefix = reportPrefix(args.userId)
  const candidates = files
    .filter((file) => file.startsWith(prefix) && file.endsWith(".json"))
    .sort()
    .reverse()

  for (const candidate of candidates) {
    try {
      const raw = await readFile(resolve(root, candidate), "utf8")
      const parsed = JSON.parse(raw) as SecurityAuditReport
      if (parsed.userId === args.userId) {
        return parsed
      }
    } catch {
      // Ignore malformed reports and continue.
    }
  }

  return null
}
