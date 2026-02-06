"use client"

import { useEffect, useMemo, useState } from "react"
import { useSession } from "@/lib/auth-client"
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Eye,
  Globe,
  Network,
  Shield,
  Signal,
  Square,
  Users,
} from "lucide-react"
import { OrchestrationSurface } from "@/components/orchestration/OrchestrationSurface"
import { FlowCanvas } from "@/components/flow/FlowCanvas"
import { StationNode, TaskNode, SystemNode } from "@/components/flow/nodes"
import { layoutRadial } from "@/lib/flow/layout"
import { buildTaskToStationEdges, mapStationsToNodes, mapTasksToNodes } from "@/lib/flow/mappers"
import type { Edge, Node } from "reactflow"

interface BridgeStation {
  id: string
  name: string
  role: string
  status: "online" | "busy" | "offline"
  load: number
  focus: string
  queue: string[]
}

interface WorkItem {
  id: string
  name: string
  status: "active" | "completed" | "failed" | "pending"
  eta: string
  assignedTo: string
}

interface SystemStatus {
  label: string
  state: "nominal" | "warning" | "critical"
  detail: string
}

const roleList = ["Helm", "Ops", "Science", "Engineering", "Tactical", "Comms"]

const mockStations: BridgeStation[] = [
  {
    id: "station-helm",
    name: "Vector",
    role: "Helm",
    status: "online",
    load: 62,
    focus: "Trajectory alignment",
    queue: ["Course correction", "Orbit lock"],
  },
  {
    id: "station-ops",
    name: "Relay",
    role: "Ops",
    status: "busy",
    load: 81,
    focus: "Resource allocation",
    queue: ["Compute balancing", "Cache warmup", "Priority re-route"],
  },
  {
    id: "station-science",
    name: "Nova",
    role: "Science",
    status: "online",
    load: 48,
    focus: "Signal analysis",
    queue: ["Trace anomaly", "Context sync"],
  },
  {
    id: "station-engineering",
    name: "Forge",
    role: "Engineering",
    status: "busy",
    load: 73,
    focus: "Throughput tuning",
    queue: ["Queue flush", "Model upgrade"],
  },
  {
    id: "station-tactical",
    name: "Aegis",
    role: "Tactical",
    status: "online",
    load: 39,
    focus: "Risk assessment",
    queue: ["Policy review"],
  },
  {
    id: "station-comms",
    name: "Beacon",
    role: "Comms",
    status: "offline",
    load: 12,
    focus: "Link pending",
    queue: ["Handshake retry"],
  },
]

const mockWorkItems: WorkItem[] = [
  {
    id: "work-1",
    name: "Align request routing",
    status: "active",
    eta: "T+4m",
    assignedTo: "station-ops",
  },
  {
    id: "work-2",
    name: "Compile mission brief",
    status: "completed",
    eta: "Complete",
    assignedTo: "station-science",
  },
  {
    id: "work-3",
    name: "Stabilize inference load",
    status: "active",
    eta: "T+7m",
    assignedTo: "station-engineering",
  },
  {
    id: "work-4",
    name: "Inspect command queue",
    status: "pending",
    eta: "T+12m",
    assignedTo: "station-helm",
  },
  {
    id: "work-5",
    name: "Audit permissions",
    status: "failed",
    eta: "Review",
    assignedTo: "station-tactical",
  },
]

const mockSystems: SystemStatus[] = [
  { label: "Comms Array", state: "warning", detail: "1 relay drifting" },
  { label: "Sensor Grid", state: "nominal", detail: "Calibrated" },
  { label: "Core Systems", state: "nominal", detail: "Stable output" },
]

const statusStyles = {
  online: "bg-emerald-400",
  busy: "bg-amber-400",
  offline: "bg-rose-400",
}

const workItemStyles = {
  active: "text-cyan-300 bg-cyan-500/10 border-cyan-500/30",
  completed: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
  failed: "text-rose-300 bg-rose-500/10 border-rose-500/30",
  pending: "text-amber-300 bg-amber-500/10 border-amber-500/30",
}

const systemStyles = {
  nominal: "text-emerald-300",
  warning: "text-amber-300",
  critical: "text-rose-300",
}

const nodeTypes = {
  stationNode: StationNode,
  taskNode: TaskNode,
  systemNode: SystemNode,
}

function formatStardate(date: Date) {
  const start = new Date(date.getFullYear(), 0, 0)
  const diff = date.getTime() - start.getTime()
  const day = Math.floor(diff / (1000 * 60 * 60 * 24))
  return `${date.getFullYear()}.${String(day).padStart(3, "0")}`
}

function mapTaskStatus(status?: string): WorkItem["status"] {
  switch (status) {
    case "completed":
      return "completed"
    case "failed":
      return "failed"
    case "running":
    case "thinking":
      return "active"
    default:
      return "pending"
  }
}

export default function BridgePage() {
  const { data: session } = useSession()
  const [stations, setStations] = useState<BridgeStation[]>(mockStations)
  const [workItems, setWorkItems] = useState<WorkItem[]>(mockWorkItems)
  const [systems] = useState<SystemStatus[]>(mockSystems)
  const [selectedStationId, setSelectedStationId] = useState<string>(mockStations[0]?.id)
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>(undefined)

  useEffect(() => {
    let cancelled = false

    const loadData = async () => {
      try {
        const [subagentsResponse, tasksResponse] = await Promise.all([
          fetch("/api/subagents"),
          fetch("/api/tasks"),
        ])

        let nextStations = mockStations
        let nextWorkItems = mockWorkItems

        if (subagentsResponse.ok) {
          const subagents = await subagentsResponse.json()
          if (Array.isArray(subagents) && subagents.length > 0) {
            nextStations = subagents.slice(0, roleList.length).map((agent: any, index: number) => {
              const role = roleList[index % roleList.length]
              const statusIndex = index % 3
              const status = statusIndex === 0 ? "online" : statusIndex === 1 ? "busy" : "offline"
              const load = 35 + (index * 11) % 60
              return {
                id: agent.id ?? `station-${role.toLowerCase()}`,
                name: agent.name || role,
                role,
                status,
                load,
                focus: agent.description || "Awaiting orders",
                queue: [],
              }
            })
          }
        }

        if (tasksResponse.ok) {
          const tasks = await tasksResponse.json()
          if (Array.isArray(tasks) && tasks.length > 0) {
            nextWorkItems = tasks.slice(0, 12).map((task: any, index: number) => {
              const assignedStation = nextStations[index % nextStations.length]
              const status = mapTaskStatus(task.status)
              const eta = task.completedAt
                ? "Complete"
                : status === "failed"
                  ? "Review"
                  : `T+${(index + 1) * 3}m`
              return {
                id: task.id ?? `work-${index}`,
                name: task.name || "Untitled task",
                status,
                eta,
                assignedTo: assignedStation?.id ?? "station-ops",
              }
            })
          }
        }

        const stationsWithQueues = nextStations.map((station) => {
          const queue = nextWorkItems
            .filter((item) => item.assignedTo === station.id)
            .map((item) => item.name)
          return {
            ...station,
            queue,
            focus: queue[0] || station.focus,
          }
        })

        if (!cancelled) {
          setStations(stationsWithQueues)
          setWorkItems(nextWorkItems)
          setSelectedStationId((current) => {
            if (current && stationsWithQueues.some((station) => station.id === current)) {
              return current
            }
            return stationsWithQueues[0]?.id ?? current
          })
        }
      } catch (error) {
        console.error("Bridge data load failed:", error)
      }
    }

    loadData()

    return () => {
      cancelled = true
    }
  }, [])

  const selectedStation = useMemo(() => {
    return stations.find((station) => station.id === selectedStationId) || stations[0]
  }, [stations, selectedStationId])

  const missionStats = useMemo(() => {
    return {
      active: workItems.filter((item) => item.status === "active").length,
      completed: workItems.filter((item) => item.status === "completed").length,
      failed: workItems.filter((item) => item.status === "failed").length,
    }
  }, [workItems])

  const captainLabel = session?.user?.email || "Captain"
  const stardate = formatStardate(new Date())

  const bridgeNodes = useMemo(() => {
    const centerNode: Node = {
      id: "captain-core",
      type: "systemNode",
      data: {
        title: "Captain",
        status: "nominal",
        detail: captainLabel,
      },
      position: { x: 0, y: 0 },
      draggable: false,
      selectable: false,
    }

    const stationNodes = layoutRadial(
      { x: 0, y: 0 },
      mapStationsToNodes(stations, selectedStationId),
      220
    )

    const taskNodes = layoutRadial(
      { x: 0, y: 0 },
      mapTasksToNodes(workItems, selectedTaskId),
      380
    )

    return [centerNode, ...stationNodes, ...taskNodes]
  }, [stations, workItems, selectedStationId, selectedTaskId, captainLabel])

  const bridgeEdges = useMemo(() => {
    const taskEdges = buildTaskToStationEdges(workItems, stations)
    const commandEdges: Edge[] = stations.map((station) => ({
      id: `edge-captain-${station.id}`,
      source: "captain-core",
      target: station.id,
      style: { stroke: "rgba(148, 163, 184, 0.5)", strokeWidth: 1.5 },
      animated: station.status === "busy",
    }))
    return [...commandEdges, ...taskEdges]
  }, [stations, workItems])

  const handleBridgeNodeClick = (_: unknown, node: Node) => {
    if (node.type === "stationNode") {
      setSelectedStationId(node.id)
      setSelectedTaskId(undefined)
      return
    }
    if (node.type === "taskNode") {
      setSelectedTaskId(node.id)
      const match = workItems.find((item) => item.id === node.id)
      if (match?.assignedTo) {
        setSelectedStationId(match.assignedTo)
      }
    }
  }

  return (
    <main className="min-h-screen relative overflow-hidden bg-slate-950 text-slate-100">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -left-16 h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute top-1/2 -right-24 h-80 w-80 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-rose-500/10 blur-3xl" />
      </div>
      <div className="absolute inset-0 pointer-events-none bridge-grid opacity-40" />
      <div className="absolute inset-0 pointer-events-none bridge-scanlines opacity-25" />

      <div className="relative z-10 min-h-screen px-6 py-10 sm:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
          <OrchestrationSurface level={4} className="flex flex-col gap-6 bg-white/5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">Bridge Command</p>
                <h1 className="text-3xl font-semibold">Orchestration Bridge</h1>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="flex items-center gap-2 rounded-full border border-cyan-500/40 px-3 py-1 text-cyan-200">
                  <Users className="h-4 w-4" />
                  <span>{captainLabel}</span>
                </div>
                <div className="rounded-full border border-white/10 px-3 py-1 text-slate-200/80">
                  Stardate {stardate}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 text-xs text-slate-300 sm:grid-cols-3">
              <div className="flex items-center gap-2">
                <Signal className="h-4 w-4 text-cyan-300" />
                <span>Fleet uplink stable</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-emerald-300" />
                <span>Security posture nominal</span>
              </div>
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-indigo-300" />
                <span>Orbital sync locked</span>
              </div>
            </div>
          </OrchestrationSurface>

          <OrchestrationSurface level={4} className="bg-white/5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Bridge Map</h2>
              <span className="text-xs text-slate-400">Interactive command topology</span>
            </div>
            <div className="mt-4">
              <FlowCanvas
                nodes={bridgeNodes}
                edges={bridgeEdges}
                nodeTypes={nodeTypes}
                onNodeClick={handleBridgeNodeClick}
                showMiniMap
                className="h-[420px]"
              />
            </div>
          </OrchestrationSurface>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_1.4fr_1.1fr]">
            <OrchestrationSurface level={3} className="bg-white/5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Crew Stations</h2>
                <span className="text-xs text-slate-400">{stations.length} active</span>
              </div>
              <div className="mt-6 flex flex-col gap-3">
                {stations.map((station) => {
                  const isSelected = station.id === selectedStation?.id
                  return (
                    <button
                      key={station.id}
                      type="button"
                      onClick={() => setSelectedStationId(station.id)}
                      className={`w-full text-left rounded-xl border px-4 py-3 transition ${
                        isSelected
                          ? "border-cyan-400/60 bg-cyan-500/10"
                          : "border-white/10 bg-white/5 hover:border-white/30"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-100">
                            {station.role} • {station.name}
                          </p>
                          <p className="text-xs text-slate-400">{station.focus}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${statusStyles[station.status]}`} />
                          <ChevronRight className="h-4 w-4 text-slate-400" />
                        </div>
                      </div>
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span>Load</span>
                          <span>{station.load}%</span>
                        </div>
                        <div className="mt-1 h-1.5 w-full rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-cyan-400/70"
                            style={{ width: `${station.load}%` }}
                          />
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </OrchestrationSurface>

            <OrchestrationSurface level={4} className="bg-white/5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Captain's Console</h2>
                <span className="text-xs text-slate-400">Live briefing</span>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Activity className="h-4 w-4 text-cyan-300" />
                    Active Tasks
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-cyan-200">{missionStats.active}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                    Completed
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-emerald-200">{missionStats.completed}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <AlertTriangle className="h-4 w-4 text-rose-300" />
                    Failed
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-rose-200">{missionStats.failed}</p>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Station Focus</p>
                    <h3 className="text-xl font-semibold text-slate-100">
                      {selectedStation?.role} • {selectedStation?.name}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Bot className="h-4 w-4 text-cyan-300" />
                    {selectedStation?.status}
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-300">{selectedStation?.focus}</p>
                <div className="mt-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Queue</p>
                  <div className="mt-3 flex flex-col gap-2">
                    {selectedStation?.queue.length ? (
                      selectedStation.queue.slice(0, 4).map((item) => (
                        <div
                          key={item}
                          className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200"
                        >
                          <span className="truncate">{item}</span>
                          <span className="text-xs text-slate-400">Queued</span>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-lg border border-dashed border-white/10 px-3 py-2 text-sm text-slate-400">
                        No queued tasks. Standing by.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </OrchestrationSurface>

            <div className="flex flex-col gap-6">
              <OrchestrationSurface level={3} className="bg-white/5">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Workload Queue</h2>
                  <span className="text-xs text-slate-400">{workItems.length} items</span>
                </div>
                <div className="mt-5 flex flex-col gap-3">
                  {workItems.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-white/10 bg-white/5 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-100">{item.name}</p>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${
                            workItemStyles[item.status]
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                        <span>ETA {item.eta}</span>
                        <span>Assigned {item.assignedTo.replace("station-", "")}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </OrchestrationSurface>

              <OrchestrationSurface level={2} className="bg-white/5">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Systems</h2>
                  <span className="text-xs text-slate-400">Fleet core</span>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3">
                  {systems.map((system) => (
                    <div
                      key={system.label}
                      className="rounded-xl border border-white/10 bg-white/5 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-100">{system.label}</p>
                        <span className={`text-xs ${systemStyles[system.state]}`}>{system.state}</span>
                      </div>
                      <p className="mt-2 text-xs text-slate-400">{system.detail}</p>
                      <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                        <Square className="h-3 w-3 text-cyan-300" />
                        <span>Signal stable</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-cyan-300" />
                    AI core balanced
                  </div>
                  <div className="flex items-center gap-2">
                    <Network className="h-4 w-4 text-indigo-300" />
                    Mesh 98% healthy
                  </div>
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-emerald-300" />
                    Sensors aligned
                  </div>
                </div>
              </OrchestrationSurface>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
