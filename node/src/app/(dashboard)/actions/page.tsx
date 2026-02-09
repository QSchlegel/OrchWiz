"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { FilterBar, InlineNotice, PageLayout, SurfaceCard, EmptyState } from "@/components/dashboard/PageLayout"
import { StatusPill } from "@/components/dashboard/StatusPill"
import { useEventStream } from "@/lib/realtime/useEventStream"

interface AgentAction {
  id: string
  sessionId: string
  type: string
  action: string
  details: Record<string, unknown>
  status: string | null
  result: Record<string, unknown>
  timestamp: string
  session: {
    id: string
    title: string | null
  }
  isForwarded?: boolean
  sourceNodeId?: string
  sourceNodeName?: string
}

export default function ActionsPage() {
  const [actions, setActions] = useState<AgentAction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filters, setFilters] = useState({ type: "", status: "" })
  const [includeForwarded, setIncludeForwarded] = useState(false)
  const [sourceNodeId, setSourceNodeId] = useState("")
  const [message, setMessage] = useState<{ type: "error" | "success" | "info"; text: string } | null>(null)

  const fetchActions = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.type) params.append("type", filters.type)
      if (filters.status) params.append("status", filters.status)
      if (includeForwarded) params.append("includeForwarded", "true")
      if (sourceNodeId.trim()) params.append("sourceNodeId", sourceNodeId.trim())

      const response = await fetch(`/api/actions?${params.toString()}`)
      const payload = await response.json()
      if (!response.ok) {
        setActions([])
        setMessage({ type: "error", text: payload?.error || "Unable to fetch actions" })
        return
      }

      setActions(Array.isArray(payload) ? payload : [])
    } catch (error) {
      console.error("Error fetching actions:", error)
      setMessage({ type: "error", text: "Unable to fetch actions" })
    } finally {
      setIsLoading(false)
    }
  }, [filters, includeForwarded, sourceNodeId])

  useEffect(() => {
    fetchActions()
  }, [fetchActions])

  useEventStream({
    enabled: true,
    types: ["forwarding.received", "session.prompted"],
    onEvent: () => fetchActions(),
  })

  return (
    <PageLayout
      title="Agent Actions"
      description="Audit integration actions including local and forwarded execution events."
    >
      <div className="space-y-4">
        {message && <InlineNotice variant={message.type}>{message.text}</InlineNotice>}

        <FilterBar>
          <select
            value={filters.type}
            onChange={(e) => setFilters((current) => ({ ...current, type: e.target.value }))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
          >
            <option value="">All Types</option>
            <option value="slack">slack</option>
            <option value="bigquery">bigquery</option>
            <option value="sentry">sentry</option>
            <option value="other">other</option>
          </select>

          <select
            value={filters.status}
            onChange={(e) => setFilters((current) => ({ ...current, status: e.target.value }))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
          >
            <option value="">All Statuses</option>
            <option value="success">success</option>
            <option value="error">error</option>
            <option value="pending">pending</option>
          </select>

          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 dark:border-white/15 dark:text-slate-300">
            <input
              type="checkbox"
              checked={includeForwarded}
              onChange={(e) => setIncludeForwarded(e.target.checked)}
            />
            Include forwarded
          </label>

          <input
            type="text"
            value={sourceNodeId}
            onChange={(e) => setSourceNodeId(e.target.value)}
            placeholder="Source node filter"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
          />
        </FilterBar>

        {isLoading ? (
          <SurfaceCard>Loading actions...</SurfaceCard>
        ) : actions.length === 0 ? (
          <EmptyState title="No actions found" description="Run sessions or ingest forwarded action events." />
        ) : (
          <div className="space-y-3">
            {actions.map((action) => (
              <SurfaceCard key={action.id}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill value={action.type} />
                      {action.status && <StatusPill value={action.status} />}
                      {action.isForwarded && (
                        <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[11px] text-indigo-700 dark:text-indigo-300">
                          Forwarded {action.sourceNodeName || action.sourceNodeId || "node"}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">{action.action}</p>
                    <Link href={`/sessions/${action.sessionId}`} className="mt-1 inline-block text-sm text-blue-600 hover:underline dark:text-blue-400">
                      Session: {action.session?.title || action.sessionId}
                    </Link>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{new Date(action.timestamp).toLocaleString()}</p>
                  </div>
                </div>

                {action.details && Object.keys(action.details).length > 0 && (
                  <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-2 text-xs text-slate-100">
                    {JSON.stringify(action.details, null, 2)}
                  </pre>
                )}

                {action.result && Object.keys(action.result).length > 0 && (
                  <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-2 text-xs text-slate-100">
                    {JSON.stringify(action.result, null, 2)}
                  </pre>
                )}
              </SurfaceCard>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  )
}
