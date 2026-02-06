"use client"

import { useEffect, useMemo, useState } from "react"
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
  const [passkeyCount, setPasskeyCount] = useState<number | null>(null)
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false)
  const [isPasskeyActionLoading, setIsPasskeyActionLoading] = useState(false)
  const [passkeyError, setPasskeyError] = useState<string | null>(null)

  useEffect(() => {
    if (session) {
      fetchSessions()
    }
  }, [session, filter])

  useEffect(() => {
    if (session) {
      fetchPasskeys()
    }
  }, [session])

  const fetchSessions = async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter.status) params.append("status", filter.status)
      if (filter.mode) params.append("mode", filter.mode)

      const [sessionResponse, taskResponse] = await Promise.all([
        fetch(`/api/sessions?${params.toString()}`),
        fetch("/api/tasks"),
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
  }

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
      const { error } = await authClient.passkey.addPasskey({
        name: "OrchWiz Passkey",
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
          <p className="mb-4">Please sign in to view your sessions.</p>
          <Link
            href="/login"
            className="text-blue-600 hover:text-blue-800 underline"
          >
            Sign In
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Sessions
          </h1>
          <button
            onClick={handleCreateSession}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            New Session
          </button>
        </div>

        {passkeyError && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {passkeyError}
          </div>
        )}

        {!isPasskeyLoading && passkeyCount === 0 && (
          <div className="mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 rounded-2xl border border-purple-500/20 bg-purple-500/10 p-6">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-purple-500/20">
                <KeyRound className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Add a passkey for one-tap sign-in
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Secure your account and skip passwords on future logins.
                </p>
              </div>
            </div>
            <button
              onClick={handleAddPasskey}
              disabled={isPasskeyActionLoading}
              className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPasskeyActionLoading ? "Adding passkey..." : "Add passkey"}
            </button>
          </div>
        )}

        {!isPasskeyLoading && passkeyCount && passkeyCount > 0 && (
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
            Passkeys enabled
          </div>
        )}

        <div className="mb-6 flex gap-4">
          <select
            value={filter.status || ""}
            onChange={(e) =>
              setFilter({ ...filter, status: e.target.value || undefined })
            }
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
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
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="">All Modes</option>
            <option value="plan">Plan</option>
            <option value="auto_accept">Auto-accept</option>
          </select>
        </div>

        <OrchestrationSurface level={3} className="mb-8 bg-white/5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Mission Timeline</h2>
            <span className="text-xs text-gray-500 dark:text-gray-400">Interactive session flow</span>
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
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            Loading sessions...
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            No sessions found. Create your first session to get started!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
    </div>
  )
}
