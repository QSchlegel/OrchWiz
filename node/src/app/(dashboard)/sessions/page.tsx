"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { SessionCard } from "@/components/shared/SessionCard"
import { authClient, useSession } from "@/lib/auth-client"
import Link from "next/link"
import { Session } from "@prisma/client"
import { KeyRound, ShieldCheck } from "lucide-react"
import { OrchestrationSurface } from "@/components/orchestration/OrchestrationSurface"
import { FlowCanvas } from "@/components/flow/FlowCanvas"
import { SessionNode, TaskNode } from "@/components/flow/nodes"
import { layoutTimeline } from "@/lib/flow/layout"
import { buildTaskToSessionEdges, mapSessionsToNodes, mapTasksToNodes } from "@/lib/flow/mappers"
import type { Node } from "reactflow"
import { useEventStream } from "@/lib/realtime/useEventStream"
import { PageLayout, SurfaceCard, FilterBar, EmptyState, InlineNotice } from "@/components/dashboard/PageLayout"

type SessionWithCount = Session & {
  _count: {
    interactions: number
  }
}

type TaskSummary = {
  id: string
  name: string
  status?: string
  sessionId?: string
}

const nodeTypes = {
  sessionNode: SessionNode,
  taskNode: TaskNode,
}

export default function SessionsPage() {
  const { data: session } = useSession()
  const [sessions, setSessions] = useState<SessionWithCount[]>([])
  const [tasks, setTasks] = useState<TaskSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [filter, setFilter] = useState<{
    status?: string
    mode?: string
  }>({})
  const [includeForwarded, setIncludeForwarded] = useState(false)
  const [sourceNodeId, setSourceNodeId] = useState("")
  const [passkeyCount, setPasskeyCount] = useState<number | null>(null)
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false)
  const [isPasskeyActionLoading, setIsPasskeyActionLoading] = useState(false)
  const [passkeyError, setPasskeyError] = useState<string | null>(null)

  const fetchSessions = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter.status) params.append("status", filter.status)
      if (filter.mode) params.append("mode", filter.mode)
      if (includeForwarded) params.append("includeForwarded", "true")
      if (sourceNodeId.trim()) params.append("sourceNodeId", sourceNodeId.trim())

      const [sessionResponse, taskResponse] = await Promise.all([
        fetch(`/api/sessions?${params.toString()}`),
        fetch(`/api/tasks?${params.toString()}`),
      ])
      if (sessionResponse.ok) {
        const data = await sessionResponse.json()
        setSessions(data)
      }
      if (taskResponse.ok) {
        const data = await taskResponse.json()
        if (Array.isArray(data)) {
          setTasks(data)
        }
      }
    } catch (error) {
      console.error("Error fetching sessions:", error)
    } finally {
      setIsLoading(false)
    }
  }, [filter, includeForwarded, sourceNodeId])

  useEffect(() => {
    if (session) {
      fetchSessions()
    }
  }, [session, fetchSessions])

  useEffect(() => {
    if (session) {
      fetchPasskeys()
    }
  }, [session])

  useEventStream({
    enabled: Boolean(session),
    types: ["session.prompted", "task.updated", "forwarding.received"],
    onEvent: () => {
      fetchSessions()
    },
  })

  const handleCreateSession = async () => {
    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "New Session",
          mode: "plan",
          source: "web",
        }),
      })

      if (response.ok) {
        const newSession = await response.json()
        window.location.href = `/sessions/${newSession.id}`
      }
    } catch (error) {
      console.error("Error creating session:", error)
    }
  }

  const fetchPasskeys = async () => {
    setIsPasskeyLoading(true)
    setPasskeyError(null)
    try {
      const { data, error } = await authClient.passkey.listUserPasskeys()
      if (error) {
        setPasskeyError("Unable to load passkeys right now.")
        setPasskeyCount(null)
        return
      }
      setPasskeyCount(data?.length ?? 0)
    } catch (error) {
      console.error("Error fetching passkeys:", error)
      setPasskeyError("Unable to load passkeys right now.")
      setPasskeyCount(null)
    } finally {
      setIsPasskeyLoading(false)
    }
  }

  const handleAddPasskey = async () => {
    setIsPasskeyActionLoading(true)
    setPasskeyError(null)
    try {
      const userEmail = session?.user.email?.trim()
      const passkeyName = userEmail ? `${userEmail} Passkey` : "OrchWiz Passkey"
      const { error } = await authClient.passkey.addPasskey({
        name: passkeyName,
      })
      if (error) {
        setPasskeyError("Passkey registration failed. Please try again.")
        return
      }
      await fetchPasskeys()
    } catch (error) {
      console.error("Error adding passkey:", error)
      setPasskeyError("Passkey registration failed. Please try again.")
    } finally {
      setIsPasskeyActionLoading(false)
    }
  }

  const timelineNodes = useMemo(() => {
    const sessionInputs = sessions.map((sessionItem) => ({
      id: sessionItem.id,
      title: sessionItem.title || "Untitled Session",
      status: sessionItem.status,
      mode: sessionItem.mode,
      meta: `${sessionItem._count.interactions} interactions`,
    }))

    const baseSessionNodes = layoutTimeline(
      mapSessionsToNodes(sessionInputs, selectedSessionId || undefined),
      260
    )
    const sessionPositions = new Map<string, { x: number; y: number }>()
    baseSessionNodes.forEach((node) => {
      sessionPositions.set(node.id, node.position)
    })

    const taskSubset = tasks.slice(0, 16)
    const taskNodes = mapTasksToNodes(taskSubset).map((node, index) => {
      const task = taskSubset[index]
      const sessionPosition = task?.sessionId ? sessionPositions.get(task.sessionId) : undefined
      const offset = sessionPosition ? 160 : 260
      const groupIndex = task?.sessionId
        ? taskSubset.filter((item) => item.sessionId === task.sessionId).indexOf(task)
        : index
      return {
        ...node,
        position: {
          x: sessionPosition?.x ?? 0,
          y: (sessionPosition?.y ?? 0) + offset + groupIndex * 110,
        },
      }
    })

    return [...baseSessionNodes, ...taskNodes]
  }, [sessions, tasks, selectedSessionId])

  const timelineEdges = useMemo(() => {
    const sessionInputs = sessions.map((sessionItem) => ({
      id: sessionItem.id,
      title: sessionItem.title || "Untitled Session",
    }))
    return buildTaskToSessionEdges(tasks.slice(0, 16), sessionInputs)
  }, [sessions, tasks])

  const handleTimelineNodeClick = (_: unknown, node: Node) => {
    if (node.type === "sessionNode") {
      setSelectedSessionId(node.id)
      const target = document.getElementById(`session-${node.id}`)
      target?.scrollIntoView({ behavior: "smooth", block: "center" })
      return
    }
    if (node.type === "taskNode") {
      const task = tasks.find((item) => item.id === node.id)
      if (task?.sessionId) {
        setSelectedSessionId(task.sessionId)
        const target = document.getElementById(`session-${task.sessionId}`)
        target?.scrollIntoView({ behavior: "smooth", block: "center" })
      }
    }
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-slate-600 dark:text-slate-400">Please sign in to view your sessions.</p>
          <Link
            href="/login"
            className="text-blue-600 hover:text-blue-800 underline dark:text-blue-400 dark:hover:text-blue-300"
          >
            Sign In
          </Link>
        </div>
      </div>
    )
  }

  return (
    <PageLayout
      title="Sessions"
      description="Manage orchestration sessions and tasks."
      actions={
        <button
          onClick={handleCreateSession}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black dark:bg-white dark:text-slate-900"
        >
          New Session
        </button>
      }
    >
      <div className="space-y-4">
        {passkeyError && <InlineNotice variant="error">{passkeyError}</InlineNotice>}

        {!isPasskeyLoading && passkeyCount === 0 && (
          <SurfaceCard>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-lg border border-slate-300 bg-slate-100 p-2 dark:border-white/15 dark:bg-white/[0.06]">
                  <KeyRound className="h-5 w-5 text-slate-700 dark:text-slate-200" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Add a passkey for one-tap sign-in
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Secure your account and skip passwords on future logins.
                  </p>
                </div>
              </div>
              <button
                onClick={handleAddPasskey}
                disabled={isPasskeyActionLoading}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-slate-900"
              >
                {isPasskeyActionLoading ? "Adding passkey..." : "Add passkey"}
              </button>
            </div>
          </SurfaceCard>
        )}

        {!isPasskeyLoading && passkeyCount && passkeyCount > 0 && (
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-700 dark:text-emerald-300">
            <ShieldCheck className="h-4 w-4" />
            Passkeys enabled
          </div>
        )}

        <FilterBar>
          <select
            value={filter.status || ""}
            onChange={(e) =>
              setFilter({ ...filter, status: e.target.value || undefined })
            }
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
          >
            <option value="">All Statuses</option>
            <option value="planning">Planning</option>
            <option value="executing">Executing</option>
            <option value="completed">Completed</option>
            <option value="paused">Paused</option>
            <option value="failed">Failed</option>
          </select>

          <select
            value={filter.mode || ""}
            onChange={(e) =>
              setFilter({ ...filter, mode: e.target.value || undefined })
            }
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
          >
            <option value="">All Modes</option>
            <option value="plan">Plan</option>
            <option value="auto_accept">Auto-accept</option>
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

        <OrchestrationSurface level={3} className="bg-white/5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Mission Timeline</h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">Interactive session flow</span>
          </div>
          <div className="mt-4">
            <FlowCanvas
              nodes={timelineNodes}
              edges={timelineEdges}
              nodeTypes={nodeTypes}
              onNodeClick={handleTimelineNodeClick}
              showMiniMap
              className="h-[360px]"
            />
          </div>
        </OrchestrationSurface>

        {isLoading ? (
          <SurfaceCard>Loading sessions...</SurfaceCard>
        ) : sessions.length === 0 ? (
          <EmptyState title="No sessions found" description="Create your first session to get started." />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                isSelected={session.id === selectedSessionId}
                anchorId={`session-${session.id}`}
              />
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  )
}
