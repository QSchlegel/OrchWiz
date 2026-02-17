"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useSession } from "@/lib/auth-client"
import { useEventStream } from "@/lib/realtime/useEventStream"
import { PageLayout, SurfaceCard } from "@/components/dashboard/PageLayout"
import { OrchestrationSurface } from "@/components/orchestration/OrchestrationSurface"
import { StatusPill } from "@/components/dashboard/StatusPill"
import { SeverityBar } from "@/components/security/SeverityBar"
import { FlowCanvas } from "@/components/flow/FlowCanvas"
import { SessionNode, TaskNode } from "@/components/flow/nodes"
import { layoutTimeline } from "@/lib/flow/layout"
import {
  mapSessionsToNodes,
  mapTasksToNodes,
  buildTaskToSessionEdges,
} from "@/lib/flow/mappers"
import type { Node } from "reactflow"
import {
  Crosshair,
  Ship,
  Activity,
  Shield,
  Gauge,
  ArrowUpRight,
  ChevronRight,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
} from "lucide-react"

interface MissionControlState {
  fleet: {
    ships: Array<{
      id: string
      name: string
      status: string
      nodeType: string
      deploymentProfile: string
      updatedAt: string
    }>
    counts: { total: number; active: number; failed: number; deploying: number }
  }
  operations: {
    sessions: {
      counts: { total: number; planning: number; executing: number; completed: number; paused: number; failed: number }
      recent: Array<{ id: string; title: string | null; status: string; mode: string; updatedAt: string }>
    }
    tasks: {
      counts: { total: number; running: number; completed: number; failed: number; thinking: number }
      recent: Array<{ id: string; name: string; status: string; sessionId: string | null }>
    }
  }
  security: {
    latestAudit: {
      riskScore: { score: number; level: string }
      severityCounts: { critical: number; high: number; medium: number; low: number; info: number }
      createdAt: string
      riskDelta: number | null
    } | null
    incidents: { total: number; open: number; critical: number; high: number }
  }
  performance: {
    successRate: number
    avgDurationMs: number
    totalCostUsd: number
    totalSavingsUsd: number
    recentFailureCount: number
  } | null
  applications: { total: number; active: number; failed: number }
  generatedAt: string
}

const nodeTypes = {
  sessionNode: SessionNode,
  taskNode: TaskNode,
}

function PanelHeader({ icon: Icon, title, href }: { icon: typeof Crosshair; title: string; href: string }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-violet-400" />
        <h2 className="readout text-sm font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          {title}
        </h2>
      </div>
      <Link
        href={href}
        className="flex items-center gap-1 text-xs text-violet-500 transition-colors hover:text-violet-400"
      >
        View all <ChevronRight className="h-3 w-3" />
      </Link>
    </div>
  )
}

function StatRow({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`readout text-sm font-semibold ${accent || "text-slate-800 dark:text-slate-200"}`}>
        {value}
      </span>
    </div>
  )
}

function riskColor(score: number): string {
  if (score < 30) return "text-emerald-500"
  if (score < 60) return "text-amber-500"
  return "text-rose-500"
}

function riskBg(score: number): string {
  if (score < 30) return "bg-emerald-500/10"
  if (score < 60) return "bg-amber-500/10"
  return "bg-rose-500/10"
}

export default function MissionControlPage() {
  const { data: session } = useSession()
  const [state, setState] = useState<MissionControlState | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/mission-control/state")
      if (res.ok) {
        setState(await res.json())
      }
    } catch (error) {
      console.error("Error fetching mission control state:", error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (session) fetchState()
  }, [session, fetchState])

  const debouncedRefetch = useCallback(() => {
    if (refetchTimerRef.current !== null) {
      clearTimeout(refetchTimerRef.current)
    }
    refetchTimerRef.current = setTimeout(() => {
      fetchState()
      refetchTimerRef.current = null
    }, 2000)
  }, [fetchState])

  useEventStream({
    enabled: Boolean(session),
    types: [
      "session.prompted",
      "task.updated",
      "ship.updated",
      "deployment.updated",
      "application.updated",
    ],
    onEvent: debouncedRefetch,
  })

  // Timeline flow nodes
  const timelineNodes = useMemo(() => {
    if (!state) return []
    const recentSessions = state.operations.sessions.recent
    const recentTasks = state.operations.tasks.recent

    const sessionInputs = recentSessions.map((s) => ({
      id: s.id,
      title: s.title || "Untitled Session",
      status: s.status,
      mode: s.mode,
    }))

    const baseSessionNodes = layoutTimeline(mapSessionsToNodes(sessionInputs), 260)
    const sessionPositions = new Map<string, { x: number; y: number }>()
    baseSessionNodes.forEach((node) => sessionPositions.set(node.id, node.position))

    const taskInputs = recentTasks.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      sessionId: t.sessionId ?? undefined,
    }))
    const taskNodes = mapTasksToNodes(taskInputs).map((node, index) => {
      const task = taskInputs[index]
      const sessionPos = task?.sessionId ? sessionPositions.get(task.sessionId) : undefined
      const groupIndex = task?.sessionId
        ? taskInputs.filter((t) => t.sessionId === task.sessionId).indexOf(task)
        : index
      return {
        ...node,
        position: {
          x: sessionPos?.x ?? index * 260,
          y: (sessionPos?.y ?? 0) + 160 + groupIndex * 110,
        },
      }
    })

    return [...baseSessionNodes, ...taskNodes]
  }, [state])

  const timelineEdges = useMemo(() => {
    if (!state) return []
    const recentSessions = state.operations.sessions.recent.map((s) => ({
      id: s.id,
      title: s.title || "Untitled Session",
    }))
    const taskInputs = state.operations.tasks.recent.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      sessionId: t.sessionId ?? undefined,
    }))
    return buildTaskToSessionEdges(taskInputs, recentSessions)
  }, [state])

  const handleTimelineNodeClick = (_: unknown, node: Node) => {
    if (node.type === "sessionNode") {
      window.location.href = `/sessions`
    } else if (node.type === "taskNode") {
      window.location.href = `/tasks`
    }
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-slate-600 dark:text-slate-400">Please sign in to view Mission Control.</p>
      </div>
    )
  }

  if (isLoading || !state) {
    return (
      <PageLayout title="Mission Control" description="Platform overview">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <SurfaceCard key={i} className={i === 0 ? "md:col-span-2" : ""}>
              <div className="skeleton-shimmer h-40 rounded-xl" />
            </SurfaceCard>
          ))}
        </div>
      </PageLayout>
    )
  }

  const { fleet, operations, security, performance, applications } = state
  const sc = operations.sessions.counts
  const tc = operations.tasks.counts
  const activeSessions = sc.planning + sc.executing
  const activeTasks = tc.running + tc.thinking

  return (
    <div className="relative">
      <div className="bridge-grid pointer-events-none absolute inset-0 opacity-30" />
      <div className="bridge-vignette pointer-events-none absolute inset-0" />

      <PageLayout
        title="Mission Control"
        description="Platform overview"
        actions={
          <span className="readout text-xs text-slate-400">
            Updated {new Date(state.generatedAt).toLocaleTimeString()}
          </span>
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:gap-5">

          {/* Fleet Status — hero panel, full width */}
          <OrchestrationSurface level={3} className="md:col-span-2 lcars-accent-left">
            <PanelHeader icon={Ship} title="Fleet Status" href="/ships" />

            <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              <div className="text-center">
                <div className="readout text-3xl font-bold text-slate-800 dark:text-slate-100">
                  {fleet.counts.total}
                </div>
                <div className="text-xs text-slate-500">Total Ships</div>
              </div>
              <div className="text-center">
                <div className="readout text-3xl font-bold text-emerald-500">{fleet.counts.active}</div>
                <div className="text-xs text-slate-500">Active</div>
              </div>
              <div className="text-center">
                <div className="readout text-3xl font-bold text-blue-500">{fleet.counts.deploying}</div>
                <div className="text-xs text-slate-500">Deploying</div>
              </div>
              <div className="text-center">
                <div className={`readout text-3xl font-bold ${fleet.counts.failed > 0 ? "text-rose-500" : "text-slate-400"}`}>
                  {fleet.counts.failed}
                </div>
                <div className="text-xs text-slate-500">Failed</div>
              </div>
            </div>

            {fleet.ships.length > 0 && (
              <div className="mt-4 space-y-2">
                {fleet.ships.slice(0, 5).map((ship) => (
                  <Link
                    key={ship.id}
                    href={`/ships`}
                    className="flex items-center justify-between rounded-lg px-3 py-2 transition-colors hover:bg-white/10 dark:hover:bg-white/[0.04]"
                  >
                    <div className="flex items-center gap-3">
                      <Ship className="h-3.5 w-3.5 text-slate-400" />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{ship.name}</span>
                      <span className="readout text-[10px] text-slate-400">{ship.nodeType}</span>
                    </div>
                    <StatusPill value={ship.status} />
                  </Link>
                ))}
              </div>
            )}

            {fleet.ships.length === 0 && (
              <div className="mt-4 text-center">
                <p className="text-sm text-slate-500">No ships deployed yet.</p>
                <Link
                  href="/ship-yard"
                  className="mt-2 inline-flex items-center gap-1 text-sm text-violet-500 hover:text-violet-400"
                >
                  Launch your first ship <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
          </OrchestrationSurface>

          {/* Operations */}
          <OrchestrationSurface level={2}>
            <PanelHeader icon={Activity} title="Operations" href="/sessions" />

            <div className="space-y-4">
              {/* Sessions */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Sessions</span>
                  <span className="readout text-lg font-bold text-slate-800 dark:text-slate-100">{sc.total}</span>
                </div>
                <div className="space-y-1">
                  <StatRow label="Active" value={activeSessions} accent={activeSessions > 0 ? "text-blue-500" : undefined} />
                  <StatRow label="Completed" value={sc.completed} accent="text-emerald-500" />
                  <StatRow label="Failed" value={sc.failed} accent={sc.failed > 0 ? "text-rose-500" : undefined} />
                  <StatRow label="Paused" value={sc.paused} accent={sc.paused > 0 ? "text-amber-500" : undefined} />
                </div>
              </div>

              <div className="border-t border-slate-200/50 dark:border-white/5" />

              {/* Tasks */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Tasks</span>
                  <span className="readout text-lg font-bold text-slate-800 dark:text-slate-100">{tc.total}</span>
                </div>
                <div className="space-y-1">
                  <StatRow label="Running" value={tc.running} accent={tc.running > 0 ? "text-blue-500" : undefined} />
                  <StatRow label="Thinking" value={tc.thinking} accent={tc.thinking > 0 ? "text-amber-500" : undefined} />
                  <StatRow label="Completed" value={tc.completed} accent="text-emerald-500" />
                  <StatRow label="Failed" value={tc.failed} accent={tc.failed > 0 ? "text-rose-500" : undefined} />
                </div>
              </div>

              {/* Applications */}
              <div className="border-t border-slate-200/50 dark:border-white/5" />
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Applications</span>
                <div className="flex items-center gap-2">
                  <span className="readout text-sm text-emerald-500">{applications.active} active</span>
                  {applications.failed > 0 && (
                    <span className="readout text-sm text-rose-500">{applications.failed} failed</span>
                  )}
                </div>
              </div>
            </div>
          </OrchestrationSurface>

          {/* Security Posture */}
          <OrchestrationSurface level={2}>
            <PanelHeader icon={Shield} title="Security Posture" href="/security" />

            {security.latestAudit ? (
              <div className="space-y-4">
                {/* Risk Score */}
                <div className="flex items-center gap-4">
                  <div className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl ${riskBg(security.latestAudit.riskScore.score)}`}>
                    <span className={`readout text-3xl font-bold ${riskColor(security.latestAudit.riskScore.score)}`}>
                      {security.latestAudit.riskScore.score}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Risk: {security.latestAudit.riskScore.level}
                    </div>
                    {security.latestAudit.riskDelta !== null && (
                      <div className="mt-0.5 flex items-center gap-1 text-xs">
                        {security.latestAudit.riskDelta > 0 ? (
                          <>
                            <TrendingUp className="h-3 w-3 text-rose-500" />
                            <span className="text-rose-500">+{security.latestAudit.riskDelta} since last audit</span>
                          </>
                        ) : (
                          <>
                            <TrendingDown className="h-3 w-3 text-emerald-500" />
                            <span className="text-emerald-500">{security.latestAudit.riskDelta} since last audit</span>
                          </>
                        )}
                      </div>
                    )}
                    <div className="mt-1 text-[10px] text-slate-400">
                      Last audit: {new Date(security.latestAudit.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                {/* Severity bar */}
                <SeverityBar counts={security.latestAudit.severityCounts} label="Findings by severity" />

                {/* Incidents */}
                {security.incidents.total > 0 && (
                  <Link
                    href="/security/incidents"
                    className="flex items-center justify-between rounded-lg bg-rose-500/5 px-3 py-2 transition-colors hover:bg-rose-500/10"
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
                      <span className="text-sm text-rose-600 dark:text-rose-400">
                        {security.incidents.open} open incident{security.incidents.open !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {security.incidents.critical > 0 && (
                        <StatusPill value="critical" />
                      )}
                      {security.incidents.high > 0 && (
                        <span className="text-xs text-amber-500">{security.incidents.high} high</span>
                      )}
                    </div>
                  </Link>
                )}
              </div>
            ) : (
              <div className="text-center py-4">
                <Shield className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
                <p className="mt-2 text-sm text-slate-500">No security audit yet.</p>
                <Link
                  href="/security"
                  className="mt-1 inline-flex items-center gap-1 text-sm text-violet-500 hover:text-violet-400"
                >
                  Run your first audit <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
          </OrchestrationSurface>

          {/* Performance */}
          <OrchestrationSurface level={2}>
            <PanelHeader icon={Gauge} title="Performance" href="/performance" />

            {performance ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-slate-500">Success rate (1h)</div>
                    <div className={`readout text-2xl font-bold ${performance.successRate >= 95 ? "text-emerald-500" : performance.successRate >= 80 ? "text-amber-500" : "text-rose-500"}`}>
                      {performance.successRate}%
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Avg latency</div>
                    <div className="readout text-2xl font-bold text-slate-800 dark:text-slate-100">
                      {performance.avgDurationMs > 1000
                        ? `${(performance.avgDurationMs / 1000).toFixed(1)}s`
                        : `${performance.avgDurationMs}ms`}
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-200/50 dark:border-white/5" />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-slate-500">Cost (1h)</div>
                    <div className="readout text-lg font-semibold text-slate-700 dark:text-slate-300">
                      ${performance.totalCostUsd.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Savings (1h)</div>
                    <div className="readout text-lg font-semibold text-emerald-500">
                      ${performance.totalSavingsUsd.toFixed(2)}
                    </div>
                  </div>
                </div>

                {performance.recentFailureCount > 0 && (
                  <div className="flex items-center gap-2 rounded-lg bg-rose-500/5 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {performance.recentFailureCount} failure{performance.recentFailureCount !== 1 ? "s" : ""} in the last hour
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-4">
                <Gauge className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
                <p className="mt-2 text-sm text-slate-500">Performance data available to admins.</p>
              </div>
            )}
          </OrchestrationSurface>

          {/* Mission Timeline — full width */}
          <OrchestrationSurface level={3} className="md:col-span-2">
            <PanelHeader icon={Crosshair} title="Mission Timeline" href="/sessions" />

            {timelineNodes.length > 0 ? (
              <FlowCanvas
                nodes={timelineNodes}
                edges={timelineEdges}
                nodeTypes={nodeTypes}
                onNodeClick={handleTimelineNodeClick}
              />
            ) : (
              <div className="flex h-40 items-center justify-center text-sm text-slate-500">
                No recent sessions or tasks to display.
              </div>
            )}
          </OrchestrationSurface>
        </div>
      </PageLayout>
    </div>
  )
}
