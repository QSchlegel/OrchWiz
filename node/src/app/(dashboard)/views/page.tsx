"use client"

import type { ElementType } from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  AppWindow,
  ArrowRight,
  BadgeCheck,
  ListChecks,
  MonitorDot,
  RefreshCw,
  Zap,
} from "lucide-react"
import {
  FilterBar,
  InlineNotice,
  PageLayout,
  SurfaceCard,
} from "@/components/dashboard/PageLayout"
import { useEventStream } from "@/lib/realtime/useEventStream"

type ViewKey = "sessions" | "tasks" | "actions" | "verification" | "applications"

type ViewDefinition = {
  key: ViewKey
  label: string
  description: string
  href: string
  apiHref: string
  icon: ElementType
}

type ViewSummary = {
  ok: boolean
  total: number
  forwarded: number
  error?: string
}

type ForwardingConfigResponse = {
  sourceNode: {
    nodeId: string
    name: string | null
    lastSeenAt: string | null
    isActive: boolean
  } | null
}[]

const VIEW_DEFINITIONS: ViewDefinition[] = [
  {
    key: "sessions",
    label: "Sessions",
    description: "Aggregate orchestration sessions across local and forwarded nodes.",
    href: "/sessions",
    apiHref: "/api/sessions",
    icon: MonitorDot,
  },
  {
    key: "tasks",
    label: "Tasks",
    description: "Long-running task runs merged from forwarded telemetry.",
    href: "/tasks",
    apiHref: "/api/tasks",
    icon: ListChecks,
  },
  {
    key: "actions",
    label: "Actions",
    description: "Audit trail of tool and integration actions across nodes.",
    href: "/actions",
    apiHref: "/api/actions",
    icon: Zap,
  },
  {
    key: "verification",
    label: "Verification",
    description: "Verification workflows, including forwarded runs and results.",
    href: "/verification",
    apiHref: "/api/verification",
    icon: BadgeCheck,
  },
  {
    key: "applications",
    label: "Applications",
    description: "Application deployments aggregated across forwarded nodes.",
    href: "/applications",
    apiHref: "/api/applications",
    icon: AppWindow,
  },
]

function isForwardedRecord(value: unknown): boolean {
  if (!value || typeof value !== "object") return false
  const record = value as Record<string, unknown>

  if (record.isForwarded === true) return true

  const metadata = record.metadata
  if (metadata && typeof metadata === "object" && (metadata as Record<string, unknown>).isForwarded === true) {
    return true
  }

  return false
}

function renderSummaryBadge(summary: ViewSummary | null, includeForwarded: boolean) {
  if (!summary) return null
  if (!summary.ok) {
    return (
      <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:text-rose-300">
        Unavailable
      </span>
    )
  }

  if (!includeForwarded) {
    return (
      <span className="rounded-full border border-slate-300 bg-white/70 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:border-white/15 dark:bg-white/[0.06] dark:text-slate-300">
        Local-only
      </span>
    )
  }

  if (summary.forwarded <= 0) {
    return (
      <span className="rounded-full border border-slate-300 bg-white/70 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:border-white/15 dark:bg-white/[0.06] dark:text-slate-300">
        No forwarded data
      </span>
    )
  }

  return (
    <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:text-indigo-300">
      +{summary.forwarded} forwarded
    </span>
  )
}

export default function ViewsPage() {
  const searchParams = useSearchParams()

  const [includeForwarded, setIncludeForwarded] = useState(() => {
    const value = searchParams.get("includeForwarded")
    if (value === null) return true
    return value === "true"
  })
  const [sourceNodeId, setSourceNodeId] = useState(() => searchParams.get("sourceNodeId") ?? "")
  const [knownSources, setKnownSources] = useState<
    { nodeId: string; name: string | null; lastSeenAt: string | null; isActive: boolean }[]
  >([])

  const [summaries, setSummaries] = useState<Record<ViewKey, ViewSummary>>(() => ({
    sessions: { ok: false, total: 0, forwarded: 0 },
    tasks: { ok: false, total: 0, forwarded: 0 },
    actions: { ok: false, total: 0, forwarded: 0 },
    verification: { ok: false, total: 0, forwarded: 0 },
    applications: { ok: false, total: 0, forwarded: 0 },
  }))
  const [isLoading, setIsLoading] = useState(true)
  const [notice, setNotice] = useState<{ type: "error" | "info"; text: string } | null>(null)

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (includeForwarded) {
      params.set("includeForwarded", "true")
      if (sourceNodeId.trim()) {
        params.set("sourceNodeId", sourceNodeId.trim())
      }
    }
    const qs = params.toString()
    return qs ? `?${qs}` : ""
  }, [includeForwarded, sourceNodeId])

  const buildViewHref = useCallback(
    (href: string) => `${href}${queryString}`,
    [queryString],
  )

  const loadKnownSources = useCallback(async () => {
    try {
      const response = await fetch("/api/forwarding/config", { cache: "no-store" })
      if (!response.ok) {
        return
      }
      const payload = (await response.json()) as unknown
      if (!Array.isArray(payload)) {
        return
      }

      const configs = payload as ForwardingConfigResponse
      const byNodeId = new Map<string, { nodeId: string; name: string | null; lastSeenAt: string | null; isActive: boolean }>()
      configs.forEach((config) => {
        if (!config?.sourceNode?.nodeId) return
        byNodeId.set(config.sourceNode.nodeId, {
          nodeId: config.sourceNode.nodeId,
          name: config.sourceNode.name,
          lastSeenAt: config.sourceNode.lastSeenAt,
          isActive: config.sourceNode.isActive,
        })
      })

      setKnownSources(Array.from(byNodeId.values()).sort((a, b) => a.nodeId.localeCompare(b.nodeId)))
    } catch (error) {
      console.error("Failed to load forwarding config sources:", error)
    }
  }, [])

  const loadSummaries = useCallback(async () => {
    setIsLoading(true)
    setNotice(null)

    const qs = queryString.startsWith("?") ? queryString : ""

    try {
      const results = await Promise.all(
        VIEW_DEFINITIONS.map(async (definition) => {
          const response = await fetch(`${definition.apiHref}${qs}`, { cache: "no-store" })
          const payload = await response.json().catch(() => null)

          if (!response.ok) {
            const errorText = payload?.error && typeof payload.error === "string"
              ? payload.error
              : `HTTP ${response.status}`
            return {
              key: definition.key,
              summary: {
                ok: false,
                total: 0,
                forwarded: 0,
                error: errorText,
              } satisfies ViewSummary,
            }
          }

          const items = Array.isArray(payload) ? payload : []
          const forwarded = items.filter(isForwardedRecord).length
          return {
            key: definition.key,
            summary: {
              ok: true,
              total: items.length,
              forwarded,
            } satisfies ViewSummary,
          }
        }),
      )

      setSummaries((current) => {
        const next = { ...current }
        results.forEach(({ key, summary }) => {
          next[key] = summary
        })
        return next
      })
    } catch (error) {
      console.error("Failed to load aggregate view summaries:", error)
      setNotice({ type: "error", text: "Unable to load aggregate summaries right now." })
    } finally {
      setIsLoading(false)
    }
  }, [queryString])

  useEffect(() => {
    void loadKnownSources()
  }, [loadKnownSources])

  useEffect(() => {
    void loadSummaries()
  }, [loadSummaries])

  useEventStream({
    enabled: true,
    types: [
      "forwarding.received",
      "session.prompted",
      "task.updated",
      "verification.updated",
      "application.updated",
      "ship.application.updated",
    ],
    onEvent: () => {
      void loadSummaries()
    },
  })

  const allUnavailable = useMemo(
    () => VIEW_DEFINITIONS.every((def) => summaries[def.key] && !summaries[def.key].ok),
    [summaries],
  )

  return (
    <PageLayout
      title="Aggregate Views"
      description="Jump into multi-node dashboards powered by forwarded telemetry."
      actions={
        <button
          type="button"
          onClick={() => void loadSummaries()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-200 dark:hover:bg-white/[0.08]"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      }
    >
      <div className="space-y-4">
        {notice && <InlineNotice variant={notice.type}>{notice.text}</InlineNotice>}

        <FilterBar>
          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 dark:border-white/15 dark:text-slate-300">
            <input
              type="checkbox"
              checked={includeForwarded}
              onChange={(e) => setIncludeForwarded(e.target.checked)}
            />
            Include forwarded
          </label>

          <div className="flex min-w-[240px] flex-1 items-center gap-2">
            <input
              type="text"
              value={sourceNodeId}
              onChange={(e) => setSourceNodeId(e.target.value)}
              placeholder="Source node filter (optional)"
              list={knownSources.length > 0 ? "orchwiz-source-nodes" : undefined}
              disabled={!includeForwarded}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:opacity-60 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
            />
          </div>

          {knownSources.length > 0 && (
            <datalist id="orchwiz-source-nodes">
              {knownSources.map((source) => (
                <option key={source.nodeId} value={source.nodeId}>
                  {source.name ? `${source.name} (${source.nodeId})` : source.nodeId}
                </option>
              ))}
            </datalist>
          )}
        </FilterBar>

        {isLoading ? (
          <SurfaceCard>Loading view summaries...</SurfaceCard>
        ) : allUnavailable ? (
          <SurfaceCard>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              Summaries are currently unavailable. You can still open a view directly:
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {VIEW_DEFINITIONS.map((definition) => (
                <Link
                  key={definition.key}
                  href={buildViewHref(definition.href)}
                  className="rounded-full border border-slate-300 bg-white/70 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:bg-white/[0.06] dark:text-slate-200 dark:hover:bg-white/[0.08]"
                >
                  {definition.label}
                </Link>
              ))}
            </div>
          </SurfaceCard>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {VIEW_DEFINITIONS.map((definition) => {
              const summary = summaries[definition.key] ?? null
              const Icon = definition.icon
              return (
                <Link key={definition.key} href={buildViewHref(definition.href)} className="group block">
                  <SurfaceCard className="h-full transition-all group-hover:-translate-y-0.5 group-hover:border-slate-300 group-hover:bg-white/90 group-hover:shadow-md dark:group-hover:border-white/15 dark:group-hover:bg-white/[0.06]">
                    <div className="flex items-start gap-3">
                      <div className="rounded-xl border border-slate-200/70 bg-white/60 p-2 text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-200">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                            {definition.label}
                          </h2>
                          {renderSummaryBadge(summary, includeForwarded)}
                        </div>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                          {definition.description}
                        </p>
                      </div>
                      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-1 dark:text-slate-500" />
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-slate-200/70 bg-white/60 px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">
                          Total
                        </p>
                        <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
                          {summary?.ok ? summary.total : "—"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200/70 bg-white/60 px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">
                          Forwarded
                        </p>
                        <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
                          {summary?.ok && includeForwarded ? summary.forwarded : "—"}
                        </p>
                      </div>
                    </div>

                    {!summary?.ok && summary?.error ? (
                      <p className="mt-3 text-xs text-rose-700 dark:text-rose-300">
                        {summary.error}
                      </p>
                    ) : null}
                  </SurfaceCard>
                </Link>
              )
            })}
          </div>
        )}

        <SurfaceCard>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Tip: Share a filtered aggregate link by copying the URL once you open a view. OrchWiz will now honor
            <span className="font-mono"> ?includeForwarded=true</span> and
            <span className="font-mono"> &amp;sourceNodeId=&lt;node-id&gt;</span> on the supported dashboards.
          </p>
        </SurfaceCard>
      </div>
    </PageLayout>
  )
}

