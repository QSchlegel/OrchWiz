import { prisma } from "@/lib/prisma"
import type { SecurityAuditCheckResult, SecurityAuditFinding } from "../types"

const RISKY_PROMPT_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: "ignore_previous_instructions", regex: /ignore\s+previous\s+instructions/i },
  { label: "bypass_policy", regex: /bypass\s+(?:security|policy|guardrails?)/i },
  { label: "exfiltrate_data", regex: /exfiltrat(?:e|ion)|leak\s+(?:data|secret)/i },
]

const RISKY_COMMAND_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: "destructive_rm", regex: /rm\s+-rf\s+\//i },
  { label: "blind_network_exfil", regex: /curl\s+https?:\/\//i },
  { label: "shell_exec_overrides", regex: /eval\s*\(/i },
]

export async function runPromptRiskAuditCheck(userId: string): Promise<SecurityAuditCheckResult> {
  const findings: SecurityAuditFinding[] = []

  const [subagents, commands] = await Promise.all([
    prisma.subagent.findMany({
      where: {
        ownerUserId: userId,
        isShared: false,
      },
      select: {
        id: true,
        name: true,
        content: true,
      },
      take: 250,
    }),
    prisma.command.findMany({
      where: {
        ownerUserId: userId,
      },
      select: {
        id: true,
        name: true,
        scriptContent: true,
      },
      take: 250,
    }),
  ])

  const riskySubagentHits: string[] = []
  for (const subagent of subagents) {
    for (const pattern of RISKY_PROMPT_PATTERNS) {
      if (pattern.regex.test(subagent.content)) {
        riskySubagentHits.push(`${subagent.id} (${subagent.name}) -> ${pattern.label}`)
      }
    }
  }

  const riskyCommandHits: string[] = []
  for (const command of commands) {
    for (const pattern of RISKY_COMMAND_PATTERNS) {
      if (pattern.regex.test(command.scriptContent)) {
        riskyCommandHits.push(`${command.id} (${command.name}) -> ${pattern.label}`)
      }
    }
  }

  const riskyTotal = riskySubagentHits.length + riskyCommandHits.length
  if (riskyTotal > 0) {
    findings.push({
      id: "PRM-RISKY-PATTERN-HITS",
      title: "Potential prompt/command risk patterns detected",
      summary:
        "Pattern-based evaluator found content that may increase hijack, exfiltration, or policy-bypass risk.",
      severity: riskyTotal > 15 ? "high" : "medium",
      threatIds: ["TM-01", "TM-03"],
      controlIds: ["CTRL-PROMPT-RISK"],
      recommendation: "Review highlighted prompts/scripts and add stricter policy boundaries before execution.",
      evidence: [...riskySubagentHits.slice(0, 15), ...riskyCommandHits.slice(0, 15)],
    })
  }

  return {
    id: "prompt-risk",
    name: "Prompt and Command Risk Evaluation",
    status: findings.some((finding) => finding.severity === "high" || finding.severity === "critical")
      ? "fail"
      : findings.length > 0
        ? "warn"
        : "pass",
    findings,
    metadata: {
      checkedSubagents: subagents.length,
      checkedCommands: commands.length,
      riskyPatternHits: riskyTotal,
    },
  }
}
