"use client"

import { useCallback, useEffect, useState } from "react"
import { EmptyState, InlineNotice, PageLayout, SurfaceCard } from "@/components/dashboard/PageLayout"

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
}

interface BridgeCrewScorecard {
  overallScore: number
  perStationScores: Record<string, number>
  failingScenarios: string[]
  generatedAt: string
  sampleSize: number
}

export default function SecurityPage() {
  const [audit, setAudit] = useState<AuditSummary | null>(null)
  const [scorecard, setScorecard] = useState<BridgeCrewScorecard | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRunningAudit, setIsRunningAudit] = useState(false)
  const [isRunningStress, setIsRunningStress] = useState(false)
  const [notice, setNotice] = useState<{ type: "info" | "success" | "error"; text: string } | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [auditResponse, scorecardResponse] = await Promise.all([
        fetch("/api/security/audits/latest", { cache: "no-store" }),
        fetch("/api/security/bridge-crew/scorecard", { cache: "no-store" }),
      ])

      if (auditResponse.ok) {
        setAudit((await auditResponse.json()) as AuditSummary)
      } else {
        setAudit(null)
      }

      if (scorecardResponse.ok) {
        setScorecard((await scorecardResponse.json()) as BridgeCrewScorecard)
      } else {
        setScorecard(null)
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

        {!isLoading && !audit ? (
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
                <span className="font-medium">Risk:</span> {audit.riskScore.score} ({audit.riskScore.level})
              </p>
              <p>
                <span className="font-medium">Risk delta:</span>{" "}
                {audit.riskDelta === null ? "n/a" : `${audit.riskDelta > 0 ? "+" : ""}${audit.riskDelta}`}
              </p>
            </div>

            <div className="mt-3 text-sm text-slate-700 dark:text-slate-300">
              <p>
                Severity counts: critical={audit.severityCounts.critical}, high={audit.severityCounts.high}, medium=
                {audit.severityCounts.medium}, low={audit.severityCounts.low}, info={audit.severityCounts.info}
              </p>
            </div>

            <div className="mt-3 space-y-1 text-xs text-slate-500 dark:text-slate-400">
              {audit.reportPathMd ? <p>Markdown: {audit.reportPathMd}</p> : null}
              {audit.reportPathJson ? <p>JSON: {audit.reportPathJson}</p> : null}
            </div>
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
      </div>
    </PageLayout>
  )
}
