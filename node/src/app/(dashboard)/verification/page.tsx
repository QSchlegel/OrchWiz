"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { FilterBar, InlineNotice, PageLayout, SurfaceCard, EmptyState } from "@/components/dashboard/PageLayout"
import { StatusPill } from "@/components/dashboard/StatusPill"
import { useEventStream } from "@/lib/realtime/useEventStream"

interface VerificationRun {
  id: string
  sessionId: string
  type: string
  status: string | null
  result: Record<string, unknown>
  iterations: number | null
  feedback: string | null
  startedAt: string
  completedAt: string | null
  session: {
    id: string
    title: string | null
  }
  isForwarded?: boolean
  sourceNodeId?: string
  sourceNodeName?: string
}

interface SessionOption {
  id: string
  title: string | null
}

export default function VerificationPage() {
  const [runs, setRuns] = useState<VerificationRun[]>([])
  const [sessions, setSessions] = useState<SessionOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filters, setFilters] = useState({ type: "", status: "" })
  const [includeForwarded, setIncludeForwarded] = useState(false)
  const [sourceNodeId, setSourceNodeId] = useState("")
  const [message, setMessage] = useState<{ type: "error" | "success" | "info"; text: string } | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [createForm, setCreateForm] = useState({
    sessionId: "",
    type: "browser",
    status: "running",
    feedback: "",
    iterations: "0",
    result: "{}",
  })

  const fetchRuns = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.type) params.append("type", filters.type)
      if (filters.status) params.append("status", filters.status)
      if (includeForwarded) params.append("includeForwarded", "true")
      if (sourceNodeId.trim()) params.append("sourceNodeId", sourceNodeId.trim())

      const response = await fetch(`/api/verification?${params.toString()}`)
      const payload = await response.json()
      if (!response.ok) {
        setRuns([])
        setMessage({ type: "error", text: payload?.error || "Unable to fetch verification runs" })
        return
      }

      setRuns(Array.isArray(payload) ? payload : [])
    } catch (error) {
      console.error("Error fetching verification runs:", error)
      setMessage({ type: "error", text: "Unable to fetch verification runs" })
    } finally {
      setIsLoading(false)
    }
  }, [filters, includeForwarded, sourceNodeId])

  const fetchSessions = useCallback(async () => {
    try {
      const response = await fetch("/api/sessions")
      if (!response.ok) {
        return
      }

      const payload = await response.json()
      if (!Array.isArray(payload)) {
        return
      }

      setSessions(payload.map((session) => ({ id: session.id, title: session.title })))
      if (!createForm.sessionId && payload[0]?.id) {
        setCreateForm((current) => ({ ...current, sessionId: payload[0].id }))
      }
    } catch (error) {
      console.error("Failed to load sessions for verification form:", error)
    }
  }, [createForm.sessionId])

  useEffect(() => {
    fetchRuns()
  }, [fetchRuns])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  useEventStream({
    enabled: true,
    types: ["verification.updated", "forwarding.received"],
    onEvent: () => {
      fetchRuns()
    },
  })

  const createRun = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsCreating(true)
    setMessage(null)

    try {
      const result = createForm.result.trim() ? JSON.parse(createForm.result) : {}
      const response = await fetch("/api/verification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: createForm.sessionId,
          type: createForm.type,
          status: createForm.status,
          feedback: createForm.feedback || null,
          iterations: Number.parseInt(createForm.iterations || "0", 10) || 0,
          result,
        }),
      })

      const payload = await response.json()
      if (!response.ok) {
        setMessage({ type: "error", text: payload?.error || "Unable to create verification run" })
        return
      }

      setMessage({ type: "success", text: "Verification run created" })
      setShowCreateForm(false)
      setCreateForm((current) => ({ ...current, feedback: "", result: "{}", iterations: "0" }))
      fetchRuns()
    } catch (error) {
      console.error("Error creating verification run:", error)
      setMessage({ type: "error", text: "Unable to create verification run. Result must be valid JSON." })
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <PageLayout
      title="Verification Workflows"
      description="Track verification runs and create new checks for active sessions."
      actions={
        <button
          type="button"
          onClick={() => setShowCreateForm((current) => !current)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black dark:bg-white dark:text-slate-900"
        >
          {showCreateForm ? "Close" : "Create Run"}
        </button>
      }
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
            <option value="browser">browser</option>
            <option value="bash">bash</option>
            <option value="test_suite">test_suite</option>
            <option value="app_test">app_test</option>
          </select>

          <select
            value={filters.status}
            onChange={(e) => setFilters((current) => ({ ...current, status: e.target.value }))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
          >
            <option value="">All Statuses</option>
            <option value="running">running</option>
            <option value="passed">passed</option>
            <option value="success">success</option>
            <option value="failed">failed</option>
            <option value="error">error</option>
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

        {showCreateForm && (
          <SurfaceCard>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Create Verification Run</h2>
            <form onSubmit={createRun} className="mt-4 space-y-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Session</label>
                  <select
                    value={createForm.sessionId}
                    onChange={(e) => setCreateForm((current) => ({ ...current, sessionId: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                    required
                  >
                    <option value="">Select session</option>
                    {sessions.map((session) => (
                      <option key={session.id} value={session.id}>
                        {session.title || session.id}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Type</label>
                  <select
                    value={createForm.type}
                    onChange={(e) => setCreateForm((current) => ({ ...current, type: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                  >
                    <option value="browser">browser</option>
                    <option value="bash">bash</option>
                    <option value="test_suite">test_suite</option>
                    <option value="app_test">app_test</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Status</label>
                  <input
                    type="text"
                    value={createForm.status}
                    onChange={(e) => setCreateForm((current) => ({ ...current, status: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Iterations</label>
                  <input
                    type="number"
                    min={0}
                    value={createForm.iterations}
                    onChange={(e) => setCreateForm((current) => ({ ...current, iterations: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Feedback</label>
                <textarea
                  rows={3}
                  value={createForm.feedback}
                  onChange={(e) => setCreateForm((current) => ({ ...current, feedback: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Result (JSON)</label>
                <textarea
                  rows={4}
                  value={createForm.result}
                  onChange={(e) => setCreateForm((current) => ({ ...current, result: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                />
              </div>

              <button
                type="submit"
                disabled={isCreating}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-slate-900"
              >
                {isCreating ? "Creating..." : "Create run"}
              </button>
            </form>
          </SurfaceCard>
        )}

        {isLoading ? (
          <SurfaceCard>Loading verification runs...</SurfaceCard>
        ) : runs.length === 0 ? (
          <EmptyState title="No verification runs found" description="Create a run or ingest forwarded verification events." />
        ) : (
          <div className="space-y-3">
            {runs.map((run) => (
              <SurfaceCard key={run.id}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill value={run.type.replace("_", " ")} />
                      <StatusPill value={run.status || "pending"} />
                      {run.isForwarded && (
                        <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[11px] text-indigo-700 dark:text-indigo-300">
                          Forwarded {run.sourceNodeName || run.sourceNodeId || "node"}
                        </span>
                      )}
                    </div>
                    <Link href={`/sessions/${run.sessionId}`} className="mt-2 inline-block text-sm text-blue-600 hover:underline dark:text-blue-400">
                      Session: {run.session?.title || run.sessionId}
                    </Link>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Started: {new Date(run.startedAt).toLocaleString()}</p>
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-300">Iterations: {run.iterations ?? "N/A"}</div>
                </div>

                {run.feedback && <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">{run.feedback}</p>}

                {run.result && Object.keys(run.result).length > 0 && (
                  <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-2 text-xs text-slate-100">
                    {JSON.stringify(run.result, null, 2)}
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
