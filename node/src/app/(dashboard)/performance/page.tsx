"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { EmptyState, FilterBar, InlineNotice, PageLayout, SurfaceCard } from "@/components/dashboard/PageLayout"

type PerformanceWindow = "1h" | "24h" | "7d"

interface AggregateSummary {
  count: number
  errorRate: number
  fallbackRate: number
  p50: number | null
  p95: number | null
}

interface RuntimeEconomicsSummary {
  samples: number
  economicsSamples: number
  estimatedCostUsd: number
  estimatedCostEur: number
  baselineMaxCostUsd: number
  baselineMaxCostEur: number
  estimatedSavingsUsd: number
  estimatedSavingsEur: number
  avgSavingsUsd: number | null
  avgSavingsEur: number | null
  rewardSamples: number
  avgRewardScore: number | null
  thresholdDriftSamples: number
  avgThresholdDrift: number | null
  avgAbsoluteThresholdDrift: number | null
}

interface RuntimeIntelligenceBucketSummary {
  key: string
  count: number
  rate: number
}

interface RuntimeIntelligenceSummary {
  samples: number
  byTier: RuntimeIntelligenceBucketSummary[]
  byExecutionKind: RuntimeIntelligenceBucketSummary[]
  byDecision: RuntimeIntelligenceBucketSummary[]
}

interface RuntimeRlStateSummary {
  usersTracked: number
  consolidatedUsers: number
  totalSampleCount: number
  avgThreshold: number | null
  avgExplorationRate: number | null
  avgLearningRate: number | null
  avgTargetReward: number | null
  avgEmaReward: number | null
  maxSampleCount: number
  lastConsolidatedAt: string | null
}

interface PerformanceSummaryPayload {
  window: PerformanceWindow
  from: string
  to: string
  rag: {
    total: AggregateSummary
    byBackend: Array<AggregateSummary & { backend: string }>
  }
  runtime: {
    total: AggregateSummary
    byProvider: Array<AggregateSummary & { provider: string }>
    economics: RuntimeEconomicsSummary
    intelligence: RuntimeIntelligenceSummary
    rlState: RuntimeRlStateSummary
  }
  recentFailures: Array<{
    type: "rag" | "runtime"
    createdAt: string
    userId: string | null
    sessionId: string | null
    shipDeploymentId: string | null
    route: string | null
    operation: string | null
    requestedBackend: string | null
    effectiveBackend: string | null
    source: string | null
    runtimeProfile: string | null
    provider: string | null
    executionKind: string | null
    intelligenceTier: string | null
    intelligenceDecision: string | null
    status: string
    errorCode: string | null
    durationMs: number
  }>
}

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

function formatLatency(value: number | null): string {
  return value === null ? "n/a" : `${Math.round(value)} ms`
}

function formatNumber(value: number | null, digits = 3): string {
  if (value === null || !Number.isFinite(value)) {
    return "n/a"
  }

  return value.toFixed(digits)
}

function formatMoney(value: number | null, currency: "USD" | "EUR"): string {
  if (value === null || !Number.isFinite(value)) {
    return "n/a"
  }

  const magnitude = Math.abs(value)
  const maximumFractionDigits = magnitude >= 1 ? 2 : magnitude >= 0.01 ? 4 : 6
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits,
  }).format(value)
}

export default function PerformancePage() {
  const [window, setWindow] = useState<PerformanceWindow>("24h")
  const [summary, setSummary] = useState<PerformanceSummaryPayload | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [notice, setNotice] = useState<{ type: "info" | "error"; text: string } | null>(null)

  const loadSummary = useCallback(async () => {
    setIsLoading(true)
    setNotice(null)
    try {
      const response = await fetch(`/api/performance/summary?window=${encodeURIComponent(window)}`, {
        cache: "no-store",
      })
      const payload = (await response.json().catch(() => ({}))) as Partial<PerformanceSummaryPayload> & {
        error?: string
      }
      if (!response.ok) {
        setSummary(null)
        setNotice({
          type: "error",
          text: typeof payload.error === "string" ? payload.error : `Failed to load summary (${response.status})`,
        })
        return
      }

      setSummary(payload as PerformanceSummaryPayload)
    } catch (error) {
      console.error("Failed to load performance summary:", error)
      setSummary(null)
      setNotice({ type: "error", text: "Failed to load performance summary." })
    } finally {
      setIsLoading(false)
    }
  }, [window])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  const windowLabel = useMemo(() => {
    if (!summary) {
      return null
    }
    return `${new Date(summary.from).toLocaleString()} - ${new Date(summary.to).toLocaleString()}`
  }, [summary])

  return (
    <PageLayout
      title="Performance"
      description="Internal RAG and session runtime telemetry."
      actions={
        <select
          value={window}
          onChange={(event) => setWindow(event.target.value as PerformanceWindow)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
        >
          <option value="1h">Last 1 hour</option>
          <option value="24h">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
        </select>
      }
    >
      <div className="space-y-4">
        {notice ? <InlineNotice variant={notice.type === "error" ? "error" : "info"}>{notice.text}</InlineNotice> : null}

        <FilterBar>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Window: {windowLabel || "Loading..."}
          </p>
        </FilterBar>

        {isLoading ? (
          <SurfaceCard>
            <p className="text-sm text-slate-600 dark:text-slate-300">Loading performance summary...</p>
          </SurfaceCard>
        ) : null}

        {!isLoading && !summary ? (
          <EmptyState
            title="No performance data available"
            description="Generate RAG searches or runtime sessions, then refresh this page."
          />
        ) : null}

        {summary ? (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <SurfaceCard>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">RAG totals</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <p>Count: {summary.rag.total.count}</p>
                  <p>Error rate: {formatRate(summary.rag.total.errorRate)}</p>
                  <p>Fallback rate: {formatRate(summary.rag.total.fallbackRate)}</p>
                  <p>P50 / P95: {formatLatency(summary.rag.total.p50)} / {formatLatency(summary.rag.total.p95)}</p>
                </div>
              </SurfaceCard>

              <SurfaceCard>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Runtime totals</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <p>Count: {summary.runtime.total.count}</p>
                  <p>Error rate: {formatRate(summary.runtime.total.errorRate)}</p>
                  <p>Fallback rate: {formatRate(summary.runtime.total.fallbackRate)}</p>
                  <p>P50 / P95: {formatLatency(summary.runtime.total.p50)} / {formatLatency(summary.runtime.total.p95)}</p>
                </div>
              </SurfaceCard>

              <SurfaceCard>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Runtime economics</p>
                <div className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-200">
                  <p>Samples: {summary.runtime.economics.economicsSamples} / {summary.runtime.economics.samples}</p>
                  <p>Cost (USD): {formatMoney(summary.runtime.economics.estimatedCostUsd, "USD")}</p>
                  <p>Baseline (USD): {formatMoney(summary.runtime.economics.baselineMaxCostUsd, "USD")}</p>
                  <p>Savings (USD): {formatMoney(summary.runtime.economics.estimatedSavingsUsd, "USD")}</p>
                  <p>Savings (EUR): {formatMoney(summary.runtime.economics.estimatedSavingsEur, "EUR")}</p>
                </div>
              </SurfaceCard>

              <SurfaceCard>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">RL state</p>
                <div className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-200">
                  <p>Users tracked: {summary.runtime.rlState.usersTracked}</p>
                  <p>Total samples: {summary.runtime.rlState.totalSampleCount}</p>
                  <p>Avg threshold: {formatNumber(summary.runtime.rlState.avgThreshold, 4)}</p>
                  <p>Avg exploration: {formatNumber(summary.runtime.rlState.avgExplorationRate, 4)}</p>
                  <p>Avg reward: {formatNumber(summary.runtime.rlState.avgEmaReward, 4)}</p>
                </div>
              </SurfaceCard>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <SurfaceCard>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">RAG by backend</h2>
                <div className="mt-2 overflow-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="px-2 py-1">Backend</th>
                        <th className="px-2 py-1">Count</th>
                        <th className="px-2 py-1">Error</th>
                        <th className="px-2 py-1">Fallback</th>
                        <th className="px-2 py-1">P50 / P95</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.rag.byBackend.map((entry) => (
                        <tr key={entry.backend} className="border-t border-slate-200/80 dark:border-white/10">
                          <td className="px-2 py-1.5 text-slate-800 dark:text-slate-100">{entry.backend}</td>
                          <td className="px-2 py-1.5 text-slate-700 dark:text-slate-200">{entry.count}</td>
                          <td className="px-2 py-1.5 text-slate-700 dark:text-slate-200">{formatRate(entry.errorRate)}</td>
                          <td className="px-2 py-1.5 text-slate-700 dark:text-slate-200">{formatRate(entry.fallbackRate)}</td>
                          <td className="px-2 py-1.5 text-slate-700 dark:text-slate-200">
                            {formatLatency(entry.p50)} / {formatLatency(entry.p95)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SurfaceCard>

              <SurfaceCard>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Runtime by provider</h2>
                <div className="mt-2 overflow-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="px-2 py-1">Provider</th>
                        <th className="px-2 py-1">Count</th>
                        <th className="px-2 py-1">Error</th>
                        <th className="px-2 py-1">Fallback</th>
                        <th className="px-2 py-1">P50 / P95</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.runtime.byProvider.map((entry) => (
                        <tr key={entry.provider} className="border-t border-slate-200/80 dark:border-white/10">
                          <td className="px-2 py-1.5 text-slate-800 dark:text-slate-100">{entry.provider}</td>
                          <td className="px-2 py-1.5 text-slate-700 dark:text-slate-200">{entry.count}</td>
                          <td className="px-2 py-1.5 text-slate-700 dark:text-slate-200">{formatRate(entry.errorRate)}</td>
                          <td className="px-2 py-1.5 text-slate-700 dark:text-slate-200">{formatRate(entry.fallbackRate)}</td>
                          <td className="px-2 py-1.5 text-slate-700 dark:text-slate-200">
                            {formatLatency(entry.p50)} / {formatLatency(entry.p95)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SurfaceCard>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <SurfaceCard>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Intelligence adoption</h2>
                <div className="mt-2 overflow-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="px-2 py-1">Tier</th>
                        <th className="px-2 py-1">Count</th>
                        <th className="px-2 py-1">Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.runtime.intelligence.byTier.map((entry) => (
                        <tr key={`tier:${entry.key}`} className="border-t border-slate-200/80 dark:border-white/10">
                          <td className="px-2 py-1.5 text-slate-800 dark:text-slate-100">{entry.key}</td>
                          <td className="px-2 py-1.5 text-slate-700 dark:text-slate-200">{entry.count}</td>
                          <td className="px-2 py-1.5 text-slate-700 dark:text-slate-200">{formatRate(entry.rate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 overflow-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="px-2 py-1">Execution kind</th>
                        <th className="px-2 py-1">Count</th>
                        <th className="px-2 py-1">Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.runtime.intelligence.byExecutionKind.map((entry) => (
                        <tr key={`kind:${entry.key}`} className="border-t border-slate-200/80 dark:border-white/10">
                          <td className="px-2 py-1.5 text-slate-800 dark:text-slate-100">{entry.key}</td>
                          <td className="px-2 py-1.5 text-slate-700 dark:text-slate-200">{entry.count}</td>
                          <td className="px-2 py-1.5 text-slate-700 dark:text-slate-200">{formatRate(entry.rate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SurfaceCard>

              <SurfaceCard>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Decision and reward</h2>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <p>Reward samples: {summary.runtime.economics.rewardSamples}</p>
                  <p>Avg reward: {formatNumber(summary.runtime.economics.avgRewardScore, 4)}</p>
                  <p>Drift samples: {summary.runtime.economics.thresholdDriftSamples}</p>
                  <p>Avg threshold drift: {formatNumber(summary.runtime.economics.avgThresholdDrift, 4)}</p>
                  <p>Avg abs drift: {formatNumber(summary.runtime.economics.avgAbsoluteThresholdDrift, 4)}</p>
                  <p>Last consolidation: {summary.runtime.rlState.lastConsolidatedAt ? new Date(summary.runtime.rlState.lastConsolidatedAt).toLocaleString() : "n/a"}</p>
                </div>

                <div className="mt-3 overflow-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="px-2 py-1">Decision</th>
                        <th className="px-2 py-1">Count</th>
                        <th className="px-2 py-1">Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.runtime.intelligence.byDecision.map((entry) => (
                        <tr key={`decision:${entry.key}`} className="border-t border-slate-200/80 dark:border-white/10">
                          <td className="px-2 py-1.5 text-slate-800 dark:text-slate-100">{entry.key}</td>
                          <td className="px-2 py-1.5 text-slate-700 dark:text-slate-200">{entry.count}</td>
                          <td className="px-2 py-1.5 text-slate-700 dark:text-slate-200">{formatRate(entry.rate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SurfaceCard>
            </div>

            <SurfaceCard>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Recent failures</h2>
              {summary.recentFailures.length === 0 ? (
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">No failures in selected window.</p>
              ) : (
                <div className="mt-2 max-h-96 space-y-2 overflow-auto">
                  {summary.recentFailures.map((failure) => (
                    <div
                      key={`${failure.type}:${failure.createdAt}:${failure.sessionId || "none"}:${failure.errorCode || "none"}`}
                      className="rounded-md border border-slate-200/80 bg-white/80 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/[0.03]"
                    >
                      <p className="font-medium text-slate-800 dark:text-slate-100">
                        {failure.type.toUpperCase()} · {failure.status} · {failure.errorCode || "unknown_error"}
                      </p>
                      <p className="mt-1 text-slate-600 dark:text-slate-300">
                        {new Date(failure.createdAt).toLocaleString()} · {failure.durationMs} ms
                      </p>
                      <p className="mt-1 text-slate-600 dark:text-slate-300">
                        {failure.type === "rag"
                          ? `route=${failure.route || "n/a"} backend=${failure.effectiveBackend || "n/a"} op=${failure.operation || "n/a"}`
                          : `source=${failure.source || "n/a"} provider=${failure.provider || "n/a"} profile=${failure.runtimeProfile || "n/a"} kind=${failure.executionKind || "n/a"} tier=${failure.intelligenceTier || "n/a"}`}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </SurfaceCard>
          </>
        ) : null}
      </div>
    </PageLayout>
  )
}
