"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { FilterBar, InlineNotice, PageLayout, SurfaceCard, EmptyState } from "@/components/dashboard/PageLayout"
import { StatusPill } from "@/components/dashboard/StatusPill"
import { useEventStream } from "@/lib/realtime/useEventStream"

interface Task {
  id: string
  sessionId: string
  name: string
  status: string
  duration: number | null
  tokenCount: number | null
  strategy: string | null
  permissionMode: string | null
  metadata: Record<string, unknown>
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

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [sessions, setSessions] = useState<SessionOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState("")
  const [includeForwarded, setIncludeForwarded] = useState(false)
  const [sourceNodeId, setSourceNodeId] = useState("")
  const [message, setMessage] = useState<{ type: "error" | "success" | "info"; text: string } | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createForm, setCreateForm] = useState({
    sessionId: "",
    name: "",
    status: "running",
    strategy: "background_agent",
    permissionMode: "ask",
    metadata: "{}",
  })

  const fetchTasks = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.append("status", statusFilter)
      if (includeForwarded) params.append("includeForwarded", "true")
      if (sourceNodeId.trim()) params.append("sourceNodeId", sourceNodeId.trim())

      const response = await fetch(`/api/tasks?${params.toString()}`)
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        setMessage({ type: "error", text: payload?.error || "Failed to load tasks" })
        setTasks([])
        return
      }

      const data = await response.json()
      setTasks(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error("Error fetching tasks:", error)
      setMessage({ type: "error", text: "Failed to load tasks" })
    } finally {
      setIsLoading(false)
    }
  }, [statusFilter, includeForwarded, sourceNodeId])

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

      setSessions(
        payload.map((session) => ({
          id: session.id,
          title: session.title,
        }))
      )
      if (!createForm.sessionId && payload[0]?.id) {
        setCreateForm((current) => ({ ...current, sessionId: payload[0].id }))
      }
    } catch (error) {
      console.error("Error loading sessions for task form:", error)
    }
  }, [createForm.sessionId])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  useEventStream({
    enabled: true,
    types: ["task.updated", "forwarding.received"],
    onEvent: () => {
      fetchTasks()
    },
  })

  const createTask = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsCreating(true)
    setMessage(null)

    try {
      const metadata = createForm.metadata.trim() ? JSON.parse(createForm.metadata) : {}
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: createForm.sessionId,
          name: createForm.name,
          status: createForm.status,
          strategy: createForm.strategy,
          permissionMode: createForm.permissionMode,
          metadata,
        }),
      })

      const payload = await response.json()
      if (!response.ok) {
        setMessage({ type: "error", text: payload?.error || "Failed to create task" })
        return
      }

      setMessage({ type: "success", text: "Task created" })
      setShowCreateForm(false)
      setCreateForm((current) => ({ ...current, name: "", metadata: "{}" }))
      fetchTasks()
    } catch (error) {
      console.error("Error creating task:", error)
      setMessage({ type: "error", text: "Failed to create task. Metadata must be valid JSON." })
    } finally {
      setIsCreating(false)
    }
  }

  const formatDuration = (ms: number | null) => {
    if (!ms) return "N/A"
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) return `${hours}h ${minutes % 60}m`
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`
    return `${seconds}s`
  }

  const stats = useMemo(() => {
    const total = tasks.length
    const forwarded = tasks.filter((task) => task.isForwarded).length
    const running = tasks.filter((task) => task.status === "running" || task.status === "thinking").length
    return { total, forwarded, running }
  }, [tasks])

  return (
    <PageLayout
      title="Long-Running Tasks"
      description="Track and create background task runs across local and forwarded node events."
      actions={
        <button
          type="button"
          onClick={() => setShowCreateForm((current) => !current)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black dark:bg-white dark:text-slate-900"
        >
          {showCreateForm ? "Close" : "Create Task"}
        </button>
      }
    >
      <div className="space-y-4">
        {message && <InlineNotice variant={message.type}>{message.text}</InlineNotice>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SurfaceCard>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Total</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{stats.total}</p>
          </SurfaceCard>
          <SurfaceCard>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Running</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{stats.running}</p>
          </SurfaceCard>
          <SurfaceCard>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Forwarded</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{stats.forwarded}</p>
          </SurfaceCard>
        </div>

        <FilterBar>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
          >
            <option value="">All Statuses</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="thinking">Thinking</option>
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
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Create Task</h2>
            <form onSubmit={createTask} className="mt-4 space-y-3">
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
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Status</label>
                  <select
                    value={createForm.status}
                    onChange={(e) => setCreateForm((current) => ({ ...current, status: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                  >
                    <option value="running">running</option>
                    <option value="thinking">thinking</option>
                    <option value="completed">completed</option>
                    <option value="failed">failed</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Task name</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((current) => ({ ...current, name: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                  required
                />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Strategy</label>
                  <select
                    value={createForm.strategy}
                    onChange={(e) => setCreateForm((current) => ({ ...current, strategy: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                  >
                    <option value="background_agent">background_agent</option>
                    <option value="stop_hook">stop_hook</option>
                    <option value="plugin">plugin</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Permission mode</label>
                  <input
                    type="text"
                    value={createForm.permissionMode}
                    onChange={(e) => setCreateForm((current) => ({ ...current, permissionMode: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Metadata (JSON)</label>
                <textarea
                  value={createForm.metadata}
                  onChange={(e) => setCreateForm((current) => ({ ...current, metadata: e.target.value }))}
                  rows={4}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                />
              </div>

              <button
                type="submit"
                disabled={isCreating}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-slate-900"
              >
                {isCreating ? "Creating..." : "Create task"}
              </button>
            </form>
          </SurfaceCard>
        )}

        {isLoading ? (
          <SurfaceCard>Loading tasks...</SurfaceCard>
        ) : tasks.length === 0 ? (
          <EmptyState title="No tasks found" description="Create a task or enable forwarded task events." />
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <SurfaceCard key={task.id}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{task.name}</h3>
                      <StatusPill value={task.status} />
                      {task.isForwarded && (
                        <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[11px] text-indigo-700 dark:text-indigo-300">
                          Forwarded {task.sourceNodeName || task.sourceNodeId || "node"}
                        </span>
                      )}
                    </div>
                    <Link href={`/sessions/${task.sessionId}`} className="mt-1 inline-block text-sm text-blue-600 hover:underline dark:text-blue-400">
                      Session: {task.session?.title || task.sessionId}
                    </Link>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Started: {new Date(task.startedAt).toLocaleString()}</p>
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-300">
                    <p>Duration: {formatDuration(task.duration)}</p>
                    <p>Tokens: {task.tokenCount?.toLocaleString() || "N/A"}</p>
                  </div>
                </div>

                {task.metadata && Object.keys(task.metadata).length > 0 && (
                  <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-2 text-xs text-slate-100">
                    {JSON.stringify(task.metadata, null, 2)}
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
