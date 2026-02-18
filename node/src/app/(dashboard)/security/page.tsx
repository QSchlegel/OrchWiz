"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { EmptyState, InlineNotice, PageLayout, SurfaceCard } from "@/components/dashboard/PageLayout"
import { ISO27001UtilityCard } from "@/components/security/ISO27001UtilityCard"
import { SeverityBar } from "@/components/security/SeverityBar"
import { TrendingDown, TrendingUp } from "lucide-react"

interface AuditSummary {
  reportId: string
  createdAt: string
  riskScore: {
    score: number
    level: string
  }
  severityCounts: {
    critical: number
    high: number
    medium: number
    low: number
    info: number
  }
  reportPathMd: string | null
  reportPathJson: string | null
  riskDelta: number | null
  checks?: Array<{ id: string; name: string; status: string; findingsCount: number }>
}

interface UnusualReading {
  code: string
  level: string
  message: string
}

interface QuartermasterReviewSummary {
  status: string | null
  generatedAt: string | null
  text: string | null
  provider: string | null
  fallbackUsed: boolean
  warnings: string[]
  vaultReviewPath: string | null
  quartermasterSessionId: string | null
  quartermasterInteractionId: string | null
  errorMessage: string | null
}

interface AutomatedAuditSummary {
  verificationRunId: string
  completedAt: string | null
  trigger: string
  dayKey: string | null
  reportId: string | null
  createdAt: string | null
  mode: string | null
  riskScore: AuditSummary["riskScore"] | null
  severityCounts: AuditSummary["severityCounts"] | null
  riskDelta: number | null
  previousRiskScore: number | null
  reportPathMd: string | null
  reportPathJson: string | null
  checks: Array<{ id: string; name: string; status: string; findingsCount: number }>
  unusualReadings: UnusualReading[]
  quartermasterReview: QuartermasterReviewSummary
}

interface BridgeCrewScorecard {
  overallScore: number
  perStationScores: Record<string, number>
  failingScenarios: string[]
  generatedAt: string
  sampleSize: number
}

interface IncidentSummaryRow {
  id: string
  title: string
  status: string
  severity: string
  updatedAt: string
  createdAt: string
  mispEventId: string | null
  sessionId: string | null
}

interface MotionConfigPayload {
  config: {
    mode: "observation" | "production" | "off"
    strictness: "lenient" | "standard" | "strict"
    failMode: "fail_open_alert" | "fail_closed" | "fail_open_silent"
    baselineMinSamples: number
    embeddingModel: string
    updatedAt: string
  }
  stats: {
    baselineTotal: number
    baselineReady: number
  }
}

interface MotionSampleRow {
  id: string
  createdAt: string
  decision: "allow" | "warn" | "block"
  entityKey: string
  entityType: string
  eventType: string
  reasons: unknown
  incidentId: string | null
  sessionId: string | null
  traceId: string | null
}

interface LockdownPayload {
  enabled: boolean
  reason: string | null
  updatedAt: string
}

export default function SecurityPage() {
  const [audit, setAudit] = useState<AuditSummary | null>(null)
  const [automatedAudit, setAutomatedAudit] = useState<AutomatedAuditSummary | null>(null)
  const [scorecard, setScorecard] = useState<BridgeCrewScorecard | null>(null)
  const [incidentSummary, setIncidentSummary] = useState<{
    openCount: number
    totalShown: number
    lastUpdatedAt: string | null
  } | null>(null)
  const [lockdown, setLockdown] = useState<LockdownPayload | null>(null)
  const [motion, setMotion] = useState<MotionConfigPayload | null>(null)
  const [motionAnomalies, setMotionAnomalies] = useState<MotionSampleRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRunningAudit, setIsRunningAudit] = useState(false)
  const [isRunningStress, setIsRunningStress] = useState(false)
  const [isUpdatingLockdown, setIsUpdatingLockdown] = useState(false)
  const [isUpdatingMotion, setIsUpdatingMotion] = useState(false)
  const [notice, setNotice] = useState<{ type: "info" | "success" | "error"; text: string } | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [
        auditResponse,
        cronResponse,
        scorecardResponse,
        incidentResponse,
        lockdownResponse,
        motionResponse,
        motionSamplesResponse,
      ] = await Promise.all([
        fetch("/api/security/audits/latest", { cache: "no-store" }),
        fetch("/api/security/audits/cron/latest", { cache: "no-store" }),
        fetch("/api/security/bridge-crew/scorecard", { cache: "no-store" }),
        fetch("/api/security/incidents?includeClosed=false", { cache: "no-store" }),
        fetch("/api/security/lockdown", { cache: "no-store" }),
        fetch("/api/security/motion", { cache: "no-store" }),
        fetch("/api/security/motion/samples?decision=warn,block&take=10", { cache: "no-store" }),
      ])

      if (auditResponse.ok) {
        setAudit((await auditResponse.json()) as AuditSummary)
      } else {
        setAudit(null)
      }

      if (cronResponse.ok) {
        setAutomatedAudit((await cronResponse.json()) as AutomatedAuditSummary)
      } else {
        setAutomatedAudit(null)
      }

      if (scorecardResponse.ok) {
        setScorecard((await scorecardResponse.json()) as BridgeCrewScorecard)
      } else {
        setScorecard(null)
      }

      if (incidentResponse.ok) {
        const payload = (await incidentResponse.json().catch(() => ({}))) as { incidents?: IncidentSummaryRow[] }
        const incidents = Array.isArray(payload.incidents) ? payload.incidents : []
        const openCount = incidents.filter((i) => i.status !== "closed").length
        const lastUpdatedAt = incidents.length > 0 ? incidents[0].updatedAt : null
        setIncidentSummary({ openCount, totalShown: incidents.length, lastUpdatedAt })
      } else {
        setIncidentSummary(null)
      }

      if (lockdownResponse.ok) {
        setLockdown((await lockdownResponse.json()) as LockdownPayload)
      } else {
        setLockdown(null)
      }

      if (motionResponse.ok) {
        setMotion((await motionResponse.json()) as MotionConfigPayload)
      } else {
        setMotion(null)
      }

      if (motionSamplesResponse.ok) {
        const payload = (await motionSamplesResponse.json().catch(() => ({}))) as { samples?: MotionSampleRow[] }
        const samples = Array.isArray(payload.samples) ? payload.samples : []
        setMotionAnomalies(samples)
      } else {
        setMotionAnomalies([])
      }
    } catch (error) {
      console.error("Failed to load security dashboard data:", error)
      setNotice({ type: "error", text: "Failed to load security reports." })
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const runAudit = async () => {
    setIsRunningAudit(true)
    setNotice(null)
    try {
      const response = await fetch("/api/security/audits/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          includeBridgeCrewStress: true,
          mode: "safe_sim",
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setNotice({ type: "error", text: payload?.error || "Security audit failed." })
        return
      }

      setNotice({ type: "success", text: `Security audit ${payload.reportId} completed.` })
      await loadData()
    } catch (error) {
      console.error("Error running security audit:", error)
      setNotice({ type: "error", text: "Security audit failed." })
    } finally {
      setIsRunningAudit(false)
    }
  }

  const runStress = async () => {
    setIsRunningStress(true)
    setNotice(null)
    try {
      const response = await fetch("/api/security/bridge-crew/stress", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scenarioPack: "core",
          mode: "safe_sim",
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setNotice({ type: "error", text: payload?.error || "Bridge crew stress run failed." })
        return
      }

      setNotice({ type: "success", text: "Bridge crew stress scorecard refreshed." })
      await loadData()
    } catch (error) {
      console.error("Error running bridge crew stress:", error)
      setNotice({ type: "error", text: "Bridge crew stress run failed." })
    } finally {
      setIsRunningStress(false)
    }
  }

  const updateLockdown = async (enabled: boolean) => {
    setIsUpdatingLockdown(true)
    setNotice(null)
    try {
      const confirmPrompt = enabled ? "Type ENABLE_LOCKDOWN to enable lockdown:" : "Type DISABLE_LOCKDOWN to disable lockdown:"
      const confirm = window.prompt(confirmPrompt)
      const reason = enabled ? window.prompt("Optional reason for lockdown (recommended):") : null

      const response = await fetch("/api/security/lockdown", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          enabled,
          confirm,
          ...(enabled && reason ? { reason } : {}),
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setNotice({ type: "error", text: payload?.error || "Failed to update lockdown." })
        return
      }

      setNotice({ type: "success", text: enabled ? "Lockdown enabled." : "Lockdown disabled." })
      await loadData()
    } catch (error) {
      console.error("Error updating lockdown:", error)
      setNotice({ type: "error", text: "Failed to update lockdown." })
    } finally {
      setIsUpdatingLockdown(false)
    }
  }

  const updateMotionMode = async (mode: "observation" | "production") => {
    setIsUpdatingMotion(true)
    setNotice(null)
    try {
      const body: Record<string, unknown> = { mode }
      if (mode === "production") {
        const confirm = window.prompt("Type ENABLE_PRODUCTION to enable production blocking mode:")
        body.confirm = confirm
      }

      const response = await fetch("/api/security/motion", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setNotice({ type: "error", text: payload?.error || "Failed to update motion supervision." })
        return
      }

      setNotice({ type: "success", text: `Motion supervision set to ${mode}.` })
      await loadData()
    } catch (error) {
      console.error("Error updating motion supervision:", error)
      setNotice({ type: "error", text: "Failed to update motion supervision." })
    } finally {
      setIsUpdatingMotion(false)
    }
  }

  const reasonSummary = (reasons: unknown): string => {
    if (!Array.isArray(reasons) || reasons.length === 0) {
      return "n/a"
    }

    const first = reasons[0] as any
    if (first && typeof first === "object" && typeof first.code === "string") {
      return first.code
    }

    return "unknown"
  }

  type Priority = "critical" | "high" | "medium" | "info"
  interface Recommendation {
    id: string
    priority: Priority
    title: string
    description: string
    action?: string
  }

  const recommendations: Recommendation[] = (() => {
    if (isLoading) return []
    const recs: Recommendation[] = []

    // --- No audit ever run ---
    if (!audit && !automatedAudit) {
      recs.push({
        id: "no-audit",
        priority: "high",
        title: "Run your first security audit",
        description: "No audit report exists yet. Running an audit generates a threat-model-aligned risk score and surfaces findings.",
        action: "Run Security Audit",
      })
    }

    // --- Critical / high findings ---
    const counts = audit?.severityCounts ?? automatedAudit?.severityCounts
    if (counts) {
      if (counts.critical > 0) {
        recs.push({
          id: "critical-findings",
          priority: "critical",
          title: `${counts.critical} critical finding${counts.critical > 1 ? "s" : ""} require immediate attention`,
          description: "Critical-severity findings represent exploitable vulnerabilities or severe misconfigurations that could lead to compromise.",
          action: "Review Audit Report",
        })
      }
      if (counts.high > 0) {
        recs.push({
          id: "high-findings",
          priority: "high",
          title: `${counts.high} high-severity finding${counts.high > 1 ? "s" : ""} should be remediated`,
          description: "High-severity findings pose significant risk and should be addressed in the current sprint cycle.",
        })
      }
    }

    // --- Risk trending up ---
    const delta = audit?.riskDelta ?? automatedAudit?.riskDelta ?? null
    if (delta !== null && delta > 0) {
      recs.push({
        id: "risk-increasing",
        priority: "high",
        title: "Risk score is trending upward",
        description: `Risk increased by +${delta} since the previous audit. Investigate new findings to prevent further regression.`,
      })
    }

    // --- Risk level warnings ---
    const riskLevel = (audit?.riskScore?.level ?? automatedAudit?.riskScore?.level ?? "").toLowerCase()
    if (riskLevel === "critical") {
      recs.push({
        id: "risk-critical",
        priority: "critical",
        title: "Overall risk level is CRITICAL",
        description: "The platform risk score has crossed into the critical band. Consider enabling lockdown while remediating top findings.",
      })
    } else if (riskLevel === "high") {
      recs.push({
        id: "risk-high",
        priority: "high",
        title: "Overall risk level is HIGH",
        description: "The risk score is elevated. Prioritize remediating critical and high findings to lower the score.",
      })
    }

    // --- Motion supervision not in production ---
    if (motion && motion.config.mode !== "production") {
      const baselineReady = motion.stats.baselineReady >= motion.stats.baselineTotal && motion.stats.baselineTotal > 0
      if (baselineReady) {
        recs.push({
          id: "motion-promote",
          priority: "medium",
          title: "Motion supervision baselines are ready — promote to production",
          description: `All ${motion.stats.baselineTotal} baselines have sufficient samples. Switching to production mode will actively block anomalous agent requests.`,
          action: "Enable Production Mode",
        })
      } else {
        recs.push({
          id: "motion-observe",
          priority: "info",
          title: "Motion supervision is still learning baselines",
          description: `${motion.stats.baselineReady}/${motion.stats.baselineTotal} baselines ready. Keep observation mode active until all baselines reach the minimum sample threshold.`,
        })
      }
    }

    // --- Open incidents ---
    if (incidentSummary && incidentSummary.openCount > 0) {
      recs.push({
        id: "open-incidents",
        priority: incidentSummary.openCount >= 3 ? "high" : "medium",
        title: `${incidentSummary.openCount} open incident${incidentSummary.openCount > 1 ? "s" : ""} awaiting resolution`,
        description: "Open security incidents should be triaged, investigated, and closed promptly to maintain operational awareness.",
        action: "View Incidents",
      })
    }

    // --- Bridge crew score low ---
    if (scorecard) {
      if (scorecard.overallScore < 60) {
        recs.push({
          id: "bridge-score-low",
          priority: "high",
          title: `Bridge crew score is ${scorecard.overallScore} — below acceptable threshold`,
          description: "A score below 60 indicates significant gaps in bridge-crew scenario handling. Run targeted stress tests and review failing scenarios.",
        })
      } else if (scorecard.failingScenarios.length > 0) {
        recs.push({
          id: "bridge-failing",
          priority: "medium",
          title: `${scorecard.failingScenarios.length} bridge-crew scenario${scorecard.failingScenarios.length > 1 ? "s" : ""} failing`,
          description: `Failing: ${scorecard.failingScenarios.join(", ")}. Investigate each scenario and retrain or reconfigure the affected stations.`,
        })
      }
    }

    // --- Unusual readings from automated audit ---
    if (automatedAudit && automatedAudit.unusualReadings.length > 0) {
      const critCount = automatedAudit.unusualReadings.filter((r) => r.level.toLowerCase() === "critical").length
      if (critCount > 0) {
        recs.push({
          id: "unusual-critical",
          priority: "critical",
          title: `${critCount} critical unusual reading${critCount > 1 ? "s" : ""} flagged`,
          description: "The automated audit flagged critical anomalies that may indicate active compromise or severe misconfiguration.",
        })
      }
    }

    // --- No automated audit (cron not configured) ---
    if (!automatedAudit && audit) {
      recs.push({
        id: "no-cron",
        priority: "medium",
        title: "Enable automated nightly audits",
        description: "Only manual audits are running. Configure the cron runner with SECURITY_AUDIT_CRON_TOKEN for continuous posture monitoring.",
      })
    }

    // --- Good posture ---
    if (recs.length === 0) {
      recs.push({
        id: "posture-good",
        priority: "info",
        title: "Security posture looks healthy",
        description: "No critical or high issues detected. Continue running regular audits and monitoring motion supervision.",
      })
    }

    // Sort: critical > high > medium > info
    const order: Record<Priority, number> = { critical: 0, high: 1, medium: 2, info: 3 }
    return recs.sort((a, b) => order[a.priority] - order[b.priority])
  })()

  const priorityStyles: Record<Priority, { border: string; badge: string; badgeText: string }> = {
    critical: {
      border: "border-l-rose-500",
      badge: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300",
      badgeText: "Critical",
    },
    high: {
      border: "border-l-amber-500",
      badge: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
      badgeText: "High",
    },
    medium: {
      border: "border-l-sky-500",
      badge: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300",
      badgeText: "Medium",
    },
    info: {
      border: "border-l-slate-400",
      badge: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300",
      badgeText: "Info",
    },
  }

  return (
    <PageLayout
      title="Security"
      description="Threat-model aligned audits, risk scoring, and bridge-crew stress scorecards."
      actions={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={runStress}
            disabled={isRunningStress}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/[0.06]"
          >
            {isRunningStress ? "Running Stress..." : "Run Bridge Stress"}
          </button>
          <button
            type="button"
            onClick={runAudit}
            disabled={isRunningAudit}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900"
          >
            {isRunningAudit ? "Running Audit..." : "Run Security Audit"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {notice ? <InlineNotice variant={notice.type}>{notice.text}</InlineNotice> : null}

        {isLoading ? (
          <SurfaceCard>
            <p className="text-sm text-slate-600 dark:text-slate-400">Loading security telemetry...</p>
          </SurfaceCard>
        ) : null}

        {!isLoading && recommendations.length > 0 ? (
          <SurfaceCard>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Recommendations</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Actionable steps to improve your security posture, derived from current telemetry.
            </p>
            <ul className="mt-3 space-y-2">
              {recommendations.map((rec) => {
                const style = priorityStyles[rec.priority]
                return (
                  <li
                    key={rec.id}
                    className={`rounded-lg border border-slate-200 border-l-4 ${style.border} bg-white/60 p-3 dark:border-white/10 dark:bg-white/[0.02]`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase leading-tight ${style.badge}`}>
                        {style.badgeText}
                      </span>
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{rec.title}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{rec.description}</p>
                    {rec.action ? (
                      <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                        Suggested action: {rec.action}
                      </p>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </SurfaceCard>
        ) : null}

        {!isLoading ? <ISO27001UtilityCard /> : null}

        {!isLoading && !audit && !automatedAudit ? (
          <EmptyState
            title="No security audit report yet"
            description="Run the first security audit to generate threat findings and risk scores."
          />
        ) : null}

        {audit ? (
          <SurfaceCard>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Latest Audit</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
              <p>
                <span className="font-medium">Report:</span> {audit.reportId}
              </p>
              <p>
                <span className="font-medium">Created:</span> {new Date(audit.createdAt).toLocaleString()}
              </p>
              <p>
                <span className="font-medium">Risk:</span>{" "}
                <span
                  className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
                    audit.riskScore.level === "critical"
                      ? "bg-rose-500/20 text-rose-700 dark:text-rose-300"
                      : audit.riskScore.level === "high"
                        ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                        : audit.riskScore.level === "medium"
                          ? "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300"
                          : "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                  }`}
                >
                  {audit.riskScore.score} ({audit.riskScore.level})
                </span>
              </p>
              <p>
                <span className="font-medium">Risk delta:</span>{" "}
                {audit.riskDelta === null ? (
                  "n/a"
                ) : audit.riskDelta > 0 ? (
                  <span className="inline-flex items-center gap-0.5 text-rose-600 dark:text-rose-400">
                    <TrendingUp className="h-3.5 w-3.5" />
                    +{audit.riskDelta}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                    <TrendingDown className="h-3.5 w-3.5" />
                    {audit.riskDelta}
                  </span>
                )}
              </p>
            </div>

            <div className="mt-4">
              <SeverityBar counts={audit.severityCounts} label="Findings by severity" />
            </div>

            {audit.checks && audit.checks.length > 0 ? (
              <div className="mt-4">
                <h3 className="mb-2 text-sm font-medium text-slate-900 dark:text-slate-100">Check status</h3>
                <ul className="space-y-1.5">
                  {audit.checks.map((check) => (
                    <li
                      key={check.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200/80 bg-slate-50/50 px-2.5 py-1.5 text-sm dark:border-white/10 dark:bg-white/5"
                    >
                      <span className="text-slate-700 dark:text-slate-300">{check.name}</span>
                      <span className="flex items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                            check.status === "fail"
                              ? "bg-rose-500/20 text-rose-700 dark:text-rose-300"
                              : check.status === "warn"
                                ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                                : "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                          }`}
                        >
                          {check.status}
                        </span>
                        {check.findingsCount > 0 ? (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {check.findingsCount} finding{check.findingsCount !== 1 ? "s" : ""}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-4 space-y-1 text-xs text-slate-500 dark:text-slate-400">
              {audit.reportPathMd ? <p>Markdown: {audit.reportPathMd}</p> : null}
              {audit.reportPathJson ? <p>JSON: {audit.reportPathJson}</p> : null}
            </div>
          </SurfaceCard>
        ) : null}

        {!isLoading ? (
          <SurfaceCard>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Automated Audit (Cron)</h2>
            {automatedAudit ? (
              <>
                <div className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                  <p>
                    <span className="font-medium">Report:</span> {automatedAudit.reportId || "n/a"}
                  </p>
                  <p>
                    <span className="font-medium">Completed:</span>{" "}
                    {automatedAudit.completedAt ? new Date(automatedAudit.completedAt).toLocaleString() : "n/a"}
                  </p>
                  <p>
                    <span className="font-medium">Risk:</span>{" "}
                    {automatedAudit.riskScore ? `${automatedAudit.riskScore.score} (${automatedAudit.riskScore.level})` : "n/a"}
                  </p>
                  <p>
                    <span className="font-medium">Risk delta:</span>{" "}
                    {automatedAudit.riskDelta === null ? "n/a" : `${automatedAudit.riskDelta > 0 ? "+" : ""}${automatedAudit.riskDelta}`}
                  </p>
                </div>

                <div className="mt-3 text-sm text-slate-700 dark:text-slate-300">
                  {automatedAudit.severityCounts ? (
                    <p>
                      Severity counts: critical={automatedAudit.severityCounts.critical}, high={automatedAudit.severityCounts.high}, medium=
                      {automatedAudit.severityCounts.medium}, low={automatedAudit.severityCounts.low}, info={automatedAudit.severityCounts.info}
                    </p>
                  ) : (
                    <p>Severity counts: n/a</p>
                  )}
                </div>

                <div className="mt-4">
                  <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">Unusual Readings</h3>
                  {automatedAudit.unusualReadings.length === 0 ? (
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">No unusual readings detected by system flags.</p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {automatedAudit.unusualReadings.map((reading) => {
                        const level = (reading.level || "").toLowerCase()
                        const borderClass =
                          level === "critical"
                            ? "border-l-rose-500"
                            : level === "warn"
                              ? "border-l-amber-500"
                              : "border-l-slate-400"
                        return (
                          <li key={reading.code} className={`rounded-md border border-slate-200 border-l-4 p-3 ${borderClass} dark:border-white/10`}>
                            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                              {reading.code} <span className="font-normal text-slate-500 dark:text-slate-400">({reading.level})</span>
                            </p>
                            <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{reading.message}</p>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>

                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-medium text-slate-900 dark:text-slate-100">
                    Quartermaster Review
                  </summary>
                  <div className="mt-2 grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                    <p>
                      <span className="font-medium">Status:</span> {automatedAudit.quartermasterReview.status || "n/a"}
                    </p>
                    <p>
                      <span className="font-medium">Generated:</span>{" "}
                      {automatedAudit.quartermasterReview.generatedAt
                        ? new Date(automatedAudit.quartermasterReview.generatedAt).toLocaleString()
                        : "n/a"}
                    </p>
                    <p>
                      <span className="font-medium">Provider:</span> {automatedAudit.quartermasterReview.provider || "n/a"}
                    </p>
                    <p>
                      <span className="font-medium">Fallback used:</span> {automatedAudit.quartermasterReview.fallbackUsed ? "true" : "false"}
                    </p>
                  </div>

                  {automatedAudit.quartermasterReview.vaultReviewPath ? (
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      Vault review note: {automatedAudit.quartermasterReview.vaultReviewPath}
                    </p>
                  ) : null}

                  {automatedAudit.quartermasterReview.text ? (
                    <pre className="mt-3 whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-xs text-slate-800 dark:bg-white/5 dark:text-slate-100">
                      {automatedAudit.quartermasterReview.text}
                    </pre>
                  ) : (
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">No Quartermaster review text available yet.</p>
                  )}

                  {automatedAudit.quartermasterReview.warnings.length > 0 ? (
                    <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                      <p className="font-medium text-slate-700 dark:text-slate-300">Warnings</p>
                      <ul className="mt-1 list-disc pl-4">
                        {automatedAudit.quartermasterReview.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </details>

                <div className="mt-3 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                  {automatedAudit.reportPathMd ? <p>Markdown: {automatedAudit.reportPathMd}</p> : null}
                  {automatedAudit.reportPathJson ? <p>JSON: {automatedAudit.reportPathJson}</p> : null}
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                No automated audit run detected yet. Enable the cron runner and set `SECURITY_AUDIT_CRON_TOKEN`.
              </p>
            )}
          </SurfaceCard>
        ) : null}

        {scorecard ? (
          <SurfaceCard>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Bridge Crew Scorecard</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
              <p>
                <span className="font-medium">Overall score:</span> {scorecard.overallScore}
              </p>
              <p>
                <span className="font-medium">Sample size:</span> {scorecard.sampleSize}
              </p>
              <p>
                <span className="font-medium">Generated:</span> {new Date(scorecard.generatedAt).toLocaleString()}
              </p>
              <p>
                <span className="font-medium">Failing scenarios:</span>{" "}
                {scorecard.failingScenarios.length > 0 ? scorecard.failingScenarios.join(", ") : "none"}
              </p>
            </div>

            <div className="mt-3 text-sm text-slate-700 dark:text-slate-300">
              <p>
                XO {scorecard.perStationScores.xo ?? 0} · OPS {scorecard.perStationScores.ops ?? 0} · ENG{" "}
                {scorecard.perStationScores.eng ?? 0} · SEC {scorecard.perStationScores.sec ?? 0} · MED{" "}
                {scorecard.perStationScores.med ?? 0} · COU {scorecard.perStationScores.cou ?? 0}
              </p>
            </div>
          </SurfaceCard>
        ) : null}

        <SurfaceCard>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Lockdown</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Human kill switch. When enabled, all runtime prompts and command executions are blocked (423 LOCKDOWN_ENABLED).
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isUpdatingLockdown || !lockdown || lockdown.enabled}
                onClick={() => updateLockdown(true)}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Enable
              </button>
              <button
                type="button"
                disabled={isUpdatingLockdown || !lockdown || !lockdown.enabled}
                onClick={() => updateLockdown(false)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/[0.06]"
              >
                Disable
              </button>
            </div>
          </div>

          {lockdown ? (
            <div className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
              <p>
                <span className="font-medium">Status:</span>{" "}
                {lockdown.enabled ? (
                  <span className="font-semibold text-rose-700 dark:text-rose-300">ENABLED</span>
                ) : (
                  <span className="font-semibold text-slate-700 dark:text-slate-200">disabled</span>
                )}
              </p>
              <p>
                <span className="font-medium">Updated:</span> {new Date(lockdown.updatedAt).toLocaleString()}
              </p>
              <p className="md:col-span-2">
                <span className="font-medium">Reason:</span> {lockdown.reason || "n/a"}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
              Lockdown config unavailable (schema may be missing).
            </p>
          )}
        </SurfaceCard>

        <SurfaceCard>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Motion Supervision</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Observation records agent range-of-motion; Production blocks requests that are too far outside baseline.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isUpdatingMotion || !motion || motion.config.mode === "observation"}
                onClick={() => updateMotionMode("observation")}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/[0.06]"
              >
                Observation
              </button>
              <button
                type="button"
                disabled={isUpdatingMotion || !motion || motion.config.mode === "production"}
                onClick={() => updateMotionMode("production")}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900"
              >
                Production
              </button>
            </div>
          </div>

          {motion ? (
            <div className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
              <p>
                <span className="font-medium">Mode:</span> {motion.config.mode}
              </p>
              <p>
                <span className="font-medium">Strictness:</span> {motion.config.strictness}
              </p>
              <p>
                <span className="font-medium">Baselines ready:</span> {motion.stats.baselineReady}/{motion.stats.baselineTotal}
              </p>
              <p>
                <span className="font-medium">Min samples:</span> {motion.config.baselineMinSamples}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
              Motion supervision config unavailable (schema may be missing).
            </p>
          )}

          {motionAnomalies.length > 0 ? (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Recent Anomalies</h3>
              <div className="mt-2 space-y-2 text-sm">
                {motionAnomalies.map((row) => (
                  <div
                    key={row.id}
                    className="rounded-lg border border-slate-200 bg-white/70 p-3 text-slate-800 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">
                        {row.decision.toUpperCase()} · {row.eventType}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {new Date(row.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <p className="mt-1 break-all text-xs text-slate-600 dark:text-slate-400">{row.entityKey}</p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                      Reason: {reasonSummary(row.reasons)}
                      {row.incidentId ? ` · Incident ${row.incidentId}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">No recent motion anomalies.</p>
          )}
        </SurfaceCard>

        <SurfaceCard>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Incident Response</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Aurora-compatible incident cases with Vault snapshots and integrations.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/security/incidents"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/[0.06]"
              >
                Incidents
              </Link>
              <Link
                href="/security/integrations"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/[0.06]"
              >
                Integrations
              </Link>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
            <p>
              <span className="font-medium">Open incidents:</span>{" "}
              {incidentSummary ? incidentSummary.openCount : "n/a"}
            </p>
            <p>
              <span className="font-medium">Last updated:</span>{" "}
              {incidentSummary?.lastUpdatedAt ? new Date(incidentSummary.lastUpdatedAt).toLocaleString() : "n/a"}
            </p>
          </div>

          {incidentSummary ? (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Showing {incidentSummary.totalShown} most-recent incident case(s).
            </p>
          ) : (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Incident Response module may be disabled (set `ENABLE_SECURITY_INCIDENTS=true`).
            </p>
          )}
        </SurfaceCard>
      </div>
    </PageLayout>
  )
}
