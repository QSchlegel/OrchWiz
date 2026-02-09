"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useSession } from "@/lib/auth-client"
import { useEventStream } from "@/lib/realtime/useEventStream"
import type { BridgeStationKey } from "@/lib/bridge/stations"
import { BridgeDeckScene3D } from "@/components/bridge/BridgeDeckScene3D"
import { useShipSelection } from "@/lib/shipyard/useShipSelection"
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Loader2,
  Send,
  Shield,
  Signal,
  Sparkles,
  Users,
} from "lucide-react"

interface BridgeStation {
  id: string
  stationKey: BridgeStationKey
  callsign: string
  name: string
  role: string
  status: "online" | "busy" | "offline"
  load: number
  focus: string
  queue: string[]
  bridgeCrewId?: string
  subagentId?: string
  subagentName?: string
  subagentDescription?: string
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

interface ShipSelectorItem {
  id: string
  name: string
  status: "pending" | "deploying" | "active" | "inactive" | "failed" | "updating"
  nodeId: string
  nodeType: "local" | "cloud" | "hybrid"
  deploymentProfile: "local_starship_build" | "cloud_shipyard"
}

interface SessionListItem {
  id: string
  title: string | null
  updatedAt: string
  metadata?: Record<string, unknown>
}

interface SessionInteractionItem {
  id: string
  type: "user_input" | "ai_response" | "tool_use" | "error"
  content: string
  metadata?: Record<string, unknown>
  timestamp: string
}

interface SessionDetail {
  id: string
  interactions: SessionInteractionItem[]
}

interface BridgeSessionRef {
  id: string
  stationKey: BridgeStationKey
  title: string | null
  updatedAt: string
}

interface BridgeMessageViewModel {
  id: string
  type: SessionInteractionItem["type"]
  content: string
  timestamp: string
  pending?: boolean
  bridgePrimaryAgent?: string
  bridgeCameos?: string[]
}

interface BridgeSceneCommsEntry {
  speaker: string
  text: string
  timestamp: string
  kind: "directive" | "response" | "error" | "system"
}

type MobileSection = "scene" | "crew" | "comms" | "queue"

const STATION_KEYS = new Set<BridgeStationKey>(["xo", "ops", "eng", "sec", "med", "cou"])

const statusStyles: Record<BridgeStation["status"], string> = {
  online: "bg-emerald-400",
  busy: "bg-amber-400",
  offline: "bg-rose-400",
}

const statusLabelStyles: Record<BridgeStation["status"], string> = {
  online: "text-emerald-700 dark:text-emerald-200 border-emerald-400/30 bg-emerald-500/10",
  busy: "text-amber-700 dark:text-amber-200 border-amber-400/30 bg-amber-500/10",
  offline: "text-rose-700 dark:text-rose-200 border-rose-400/30 bg-rose-500/10",
}

const workItemStyles: Record<WorkItem["status"], string> = {
  active: "text-cyan-700 dark:text-cyan-100 border-cyan-400/30 bg-cyan-500/10",
  completed: "text-emerald-700 dark:text-emerald-100 border-emerald-400/30 bg-emerald-500/10",
  failed: "text-rose-700 dark:text-rose-100 border-rose-400/30 bg-rose-500/10",
  pending: "text-amber-700 dark:text-amber-100 border-amber-400/30 bg-amber-500/10",
}

const systemStyles: Record<SystemStatus["state"], string> = {
  nominal: "text-emerald-700 dark:text-emerald-200",
  warning: "text-amber-700 dark:text-amber-200",
  critical: "text-rose-700 dark:text-rose-200",
}

const mobileSections: Array<{ id: MobileSection; label: string }> = [
  { id: "scene", label: "Scene" },
  { id: "crew", label: "Crew" },
  { id: "comms", label: "Comms" },
  { id: "queue", label: "Queue" },
]

function formatStardate(date: Date) {
  const start = new Date(date.getFullYear(), 0, 0)
  const diff = date.getTime() - start.getTime()
  const day = Math.floor(diff / (1000 * 60 * 60 * 24))
  return `${date.getFullYear()}.${String(day).padStart(3, "0")}`
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {}
  }
  return value as Record<string, unknown>
}

function asStationKey(value: unknown): BridgeStationKey | null {
  if (typeof value !== "string") return null
  const key = value.trim().toLowerCase() as BridgeStationKey
  return STATION_KEYS.has(key) ? key : null
}

function asStationStatus(value: unknown): BridgeStation["status"] {
  if (value === "online" || value === "busy" || value === "offline") {
    return value
  }
  return "online"
}

function asSystemState(value: unknown): SystemStatus["state"] {
  if (value === "nominal" || value === "warning" || value === "critical") {
    return value
  }
  return "warning"
}

function compactTelemetryText(value: string, maxLength = 160) {
  const compact = value.replace(/\s+/g, " ").trim()
  if (compact.length <= maxLength) {
    return compact
  }
  return `${compact.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function mapInteractionToMessage(interaction: SessionInteractionItem): BridgeMessageViewModel {
  const metadata = asRecord(interaction.metadata)
  const cameoRaw = metadata.bridgeCameos

  return {
    id: interaction.id,
    type: interaction.type,
    content: interaction.content,
    timestamp: interaction.timestamp,
    bridgePrimaryAgent:
      typeof metadata.bridgePrimaryAgent === "string" ? metadata.bridgePrimaryAgent : undefined,
    bridgeCameos: Array.isArray(cameoRaw)
      ? cameoRaw.filter((item): item is string => typeof item === "string")
      : undefined,
  }
}

function extractBridgeSessionRef(session: SessionListItem): BridgeSessionRef | null {
  const metadata = asRecord(session.metadata)
  const bridge = asRecord(metadata.bridge)
  const stationKey = asStationKey(bridge.stationKey)

  if (!stationKey || bridge.channel !== "bridge-agent") {
    return null
  }

  return {
    id: session.id,
    stationKey,
    title: session.title,
    updatedAt: session.updatedAt,
  }
}

export default function BridgePage() {
  const { data: session } = useSession()
  const { selectedShipDeploymentId, setSelectedShipDeploymentId } = useShipSelection()

  const [stations, setStations] = useState<BridgeStation[]>([])
  const [workItems, setWorkItems] = useState<WorkItem[]>([])
  const [systems, setSystems] = useState<SystemStatus[]>([])
  const [availableShips, setAvailableShips] = useState<ShipSelectorItem[]>([])
  const [selectedStationKey, setSelectedStationKey] = useState<BridgeStationKey | null>(null)
  const [sessionsByStation, setSessionsByStation] = useState<Partial<Record<BridgeStationKey, BridgeSessionRef>>>(
    {},
  )
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [threadMessages, setThreadMessages] = useState<BridgeMessageViewModel[]>([])
  const [composer, setComposer] = useState("")
  const [mobileSection, setMobileSection] = useState<MobileSection>("scene")

  const [isBridgeLoading, setIsBridgeLoading] = useState(true)
  const [isThreadLoading, setIsThreadLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastBridgeEventAt, setLastBridgeEventAt] = useState<number | null>(null)

  const stardate = formatStardate(new Date())
  const operatorLabel = session?.user?.email || "Operator"

  const selectedStation = useMemo(() => {
    if (!selectedStationKey) {
      return stations[0] || null
    }
    return stations.find((station) => station.stationKey === selectedStationKey) || stations[0] || null
  }, [stations, selectedStationKey])

  const selectedShip = useMemo(() => {
    if (!selectedShipDeploymentId) return null
    return availableShips.find((ship) => ship.id === selectedShipDeploymentId) || null
  }, [availableShips, selectedShipDeploymentId])

  const missionStats = useMemo(() => {
    return {
      active: workItems.filter((item) => item.status === "active").length,
      completed: workItems.filter((item) => item.status === "completed").length,
      failed: workItems.filter((item) => item.status === "failed").length,
    }
  }, [workItems])

  const sceneCommsFeed = useMemo<BridgeSceneCommsEntry[]>(() => {
    const usefulMessages = threadMessages
      .filter((message) => {
        if (!message.content || !message.content.trim()) {
          return false
        }
        return message.type === "user_input" || message.type === "ai_response" || message.type === "error"
      })
      .slice(-5)

    return usefulMessages.map((message) => {
      if (message.type === "user_input") {
        return {
          speaker: "OPERATOR",
          text: compactTelemetryText(message.content),
          timestamp: message.timestamp,
          kind: "directive",
        }
      }

      if (message.type === "error") {
        return {
          speaker: "SYSTEM",
          text: compactTelemetryText(message.content),
          timestamp: message.timestamp,
          kind: "error",
        }
      }

      return {
        speaker: message.bridgePrimaryAgent || selectedStation?.callsign || "BRIDGE",
        text: compactTelemetryText(message.content),
        timestamp: message.timestamp,
        kind: "response",
      }
    })
  }, [threadMessages, selectedStation?.callsign])

  const loadBridgeState = useCallback(async () => {
    setIsBridgeLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("includeForwarded", "true")
      if (selectedShipDeploymentId) {
        params.set("shipDeploymentId", selectedShipDeploymentId)
      }

      const response = await fetch(`/api/bridge/state?${params.toString()}`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const payload = await response.json()
      const nextStations: BridgeStation[] = Array.isArray(payload?.stations)
        ? payload.stations
            .map((station: Record<string, unknown>) => {
              const stationKey = asStationKey(station.stationKey)
              if (!stationKey) return null

              return {
                id: typeof station.id === "string" ? station.id : `station-${stationKey}`,
                stationKey,
                callsign:
                  typeof station.callsign === "string" && station.callsign.trim()
                    ? station.callsign
                    : stationKey.toUpperCase(),
                name:
                  typeof station.name === "string" && station.name.trim()
                    ? station.name
                    : stationKey.toUpperCase(),
                role:
                  typeof station.role === "string" && station.role.trim()
                    ? station.role
                    : "Bridge Specialist",
                status: asStationStatus(station.status),
                load: typeof station.load === "number" ? station.load : 0,
                focus:
                  typeof station.focus === "string" && station.focus.trim()
                    ? station.focus
                    : "Standing by for directives.",
                queue: Array.isArray(station.queue)
                  ? station.queue.filter((entry): entry is string => typeof entry === "string")
                  : [],
                bridgeCrewId: typeof station.bridgeCrewId === "string" ? station.bridgeCrewId : undefined,
                subagentId: typeof station.subagentId === "string" ? station.subagentId : undefined,
                subagentName: typeof station.subagentName === "string" ? station.subagentName : undefined,
                subagentDescription:
                  typeof station.subagentDescription === "string" ? station.subagentDescription : undefined,
              } satisfies BridgeStation
            })
            .filter((station: BridgeStation | null): station is BridgeStation => station !== null)
        : []

      const nextWorkItems: WorkItem[] = Array.isArray(payload?.workItems)
        ? payload.workItems.map((item: Record<string, unknown>) => {
            const status =
              item.status === "active" || item.status === "completed" || item.status === "failed"
                ? item.status
                : "pending"

            return {
              id: typeof item.id === "string" ? item.id : crypto.randomUUID(),
              name: typeof item.name === "string" ? item.name : "Untitled task",
              status,
              eta: typeof item.eta === "string" ? item.eta : "TBD",
              assignedTo: typeof item.assignedTo === "string" ? item.assignedTo : "",
            } satisfies WorkItem
          })
        : []

      const nextSystems: SystemStatus[] = Array.isArray(payload?.systems)
        ? payload.systems.map((system: Record<string, unknown>) => ({
            label: typeof system.label === "string" ? system.label : "Subsystem",
            state: asSystemState(system.state),
            detail: typeof system.detail === "string" ? system.detail : "No detail",
          }))
        : []

      const nextAvailableShips: ShipSelectorItem[] = Array.isArray(payload?.availableShips)
        ? payload.availableShips
            .map((ship: Record<string, unknown>) => {
              if (typeof ship.id !== "string" || typeof ship.name !== "string") return null
              if (
                ship.status !== "pending" &&
                ship.status !== "deploying" &&
                ship.status !== "active" &&
                ship.status !== "inactive" &&
                ship.status !== "failed" &&
                ship.status !== "updating"
              ) {
                return null
              }
              if (ship.nodeType !== "local" && ship.nodeType !== "cloud" && ship.nodeType !== "hybrid") {
                return null
              }
              if (ship.deploymentProfile !== "local_starship_build" && ship.deploymentProfile !== "cloud_shipyard") {
                return null
              }

              return {
                id: ship.id,
                name: ship.name,
                status: ship.status,
                nodeId: typeof ship.nodeId === "string" ? ship.nodeId : "",
                nodeType: ship.nodeType,
                deploymentProfile: ship.deploymentProfile,
              } satisfies ShipSelectorItem
            })
            .filter((ship: ShipSelectorItem | null): ship is ShipSelectorItem => ship !== null)
        : []

      setStations(nextStations)
      setWorkItems(nextWorkItems)
      setSystems(nextSystems)
      setAvailableShips(nextAvailableShips)
      setSelectedStationKey((current) => {
        if (current && nextStations.some((station: BridgeStation) => station.stationKey === current)) {
          return current
        }
        return nextStations[0]?.stationKey || null
      })
      const resolvedShipDeploymentId =
        typeof payload?.selectedShipDeploymentId === "string" ? payload.selectedShipDeploymentId : null
      if (resolvedShipDeploymentId !== selectedShipDeploymentId) {
        setSelectedShipDeploymentId(resolvedShipDeploymentId)
      }
      setError(null)
    } catch (loadError) {
      console.error("Bridge state load failed:", loadError)
      setError("Unable to load bridge state")
    } finally {
      setIsBridgeLoading(false)
    }
  }, [selectedShipDeploymentId, setSelectedShipDeploymentId])

  const loadBridgeSessions = useCallback(async () => {
    try {
      const response = await fetch("/api/sessions?bridgeChannel=agent")
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const payload = await response.json()
      const sessions = Array.isArray(payload) ? (payload as SessionListItem[]) : []

      const nextMap: Partial<Record<BridgeStationKey, BridgeSessionRef>> = {}
      for (const sessionItem of sessions) {
        const ref = extractBridgeSessionRef(sessionItem)
        if (!ref) continue

        const current = nextMap[ref.stationKey]
        if (!current || new Date(ref.updatedAt).getTime() > new Date(current.updatedAt).getTime()) {
          nextMap[ref.stationKey] = ref
        }
      }

      setSessionsByStation(nextMap)
    } catch (loadError) {
      console.error("Bridge session list load failed:", loadError)
    }
  }, [])

  const hydrateSessionThread = useCallback(async (sessionId: string) => {
    setIsThreadLoading(true)
    try {
      const response = await fetch(`/api/sessions/${sessionId}`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const payload = (await response.json()) as SessionDetail
      const interactions = Array.isArray(payload?.interactions) ? payload.interactions : []
      setThreadMessages(interactions.map(mapInteractionToMessage))
      setError(null)
    } catch (loadError) {
      console.error("Thread load failed:", loadError)
      setThreadMessages([])
      setError("Unable to load station transcript")
    } finally {
      setIsThreadLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!session) return
    void loadBridgeState()
    void loadBridgeSessions()
  }, [session, loadBridgeState, loadBridgeSessions])

  useEffect(() => {
    if (!selectedStation?.stationKey) {
      setSelectedSessionId(null)
      setThreadMessages([])
      return
    }

    const ref = sessionsByStation[selectedStation.stationKey]
    if (!ref) {
      setSelectedSessionId(null)
      setThreadMessages([])
      return
    }

    setSelectedSessionId(ref.id)
    void hydrateSessionThread(ref.id)
  }, [selectedStation?.stationKey, sessionsByStation, hydrateSessionThread])

  const ensureSessionForStation = useCallback(
    async (station: BridgeStation): Promise<BridgeSessionRef> => {
      const existing = sessionsByStation[station.stationKey]
      if (existing) {
        return existing
      }

      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: `${station.callsign} Bridge Thread`,
          description: `Bridge conversation channel for ${station.callsign}`,
          mode: "plan",
          source: "web",
          metadata: {
            bridge: {
              channel: "bridge-agent",
              stationKey: station.stationKey,
              callsign: station.callsign,
              role: station.role,
              name: station.name,
              bridgeCrewId: station.bridgeCrewId || station.subagentId,
            },
          },
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to create session: HTTP ${response.status}`)
      }

      const created = (await response.json()) as { id: string; title: string | null; updatedAt: string }
      const ref: BridgeSessionRef = {
        id: created.id,
        stationKey: station.stationKey,
        title: created.title,
        updatedAt: created.updatedAt,
      }

      setSessionsByStation((current) => ({ ...current, [station.stationKey]: ref }))
      return ref
    },
    [sessionsByStation],
  )

  const handleSend = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      if (!selectedStation || !composer.trim() || isSending) return

      const userPrompt = composer.trim()
      const optimisticId = `local-${Date.now()}`

      setIsSending(true)
      setComposer("")
      setThreadMessages((current) => [
        ...current,
        {
          id: optimisticId,
          type: "user_input",
          content: userPrompt,
          timestamp: new Date().toISOString(),
          pending: true,
        },
      ])

      try {
        const sessionRef = await ensureSessionForStation(selectedStation)
        setSelectedSessionId(sessionRef.id)

        const cameoCandidates = stations
          .filter((station) => station.stationKey !== selectedStation.stationKey)
          .map((station) => ({
            stationKey: station.stationKey,
            callsign: station.callsign,
            role: station.role,
            name: station.name,
            focus: station.focus,
          }))

        const response = await fetch(`/api/sessions/${sessionRef.id}/prompt`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt: userPrompt,
            metadata: {
              bridge: {
                channel: "bridge-agent",
                stationKey: selectedStation.stationKey,
                callsign: selectedStation.callsign,
                role: selectedStation.role,
                name: selectedStation.name,
                focus: selectedStation.focus,
                bridgeCrewId: selectedStation.bridgeCrewId || selectedStation.subagentId,
                cameoCandidates,
                missionContext: {
                  operator: operatorLabel,
                  stardate,
                  systems: systems.slice(0, 3),
                  workItems: workItems.slice(0, 5),
                },
              },
            },
          }),
        })

        if (!response.ok) {
          throw new Error(`Prompt dispatch failed: HTTP ${response.status}`)
        }

        const payload = await response.json()
        const userInteraction = payload?.interaction as SessionInteractionItem | undefined
        const aiInteraction = payload?.responseInteraction as SessionInteractionItem | undefined

        setThreadMessages((current) => {
          const filtered = current.filter((message) => message.id !== optimisticId)
          if (userInteraction) {
            filtered.push(mapInteractionToMessage(userInteraction))
          }
          if (aiInteraction) {
            filtered.push(mapInteractionToMessage(aiInteraction))
          }
          return filtered
        })

        void loadBridgeSessions()
        void hydrateSessionThread(sessionRef.id)
        setError(null)
      } catch (sendError) {
        console.error("Bridge send failed:", sendError)
        setThreadMessages((current) => current.filter((message) => message.id !== optimisticId))
        setComposer(userPrompt)
        setError("Unable to send bridge directive")
      } finally {
        setIsSending(false)
      }
    },
    [
      selectedStation,
      composer,
      isSending,
      ensureSessionForStation,
      stations,
      operatorLabel,
      stardate,
      systems,
      workItems,
      loadBridgeSessions,
      hydrateSessionThread,
    ],
  )

  const handleSceneStationSelect = useCallback((stationKey: BridgeStationKey) => {
    setSelectedStationKey(stationKey)
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1279px)").matches) {
      setMobileSection("comms")
    }
  }, [])

  useEventStream({
    enabled: Boolean(session),
    types: ["session.prompted", "task.updated", "bridge.updated", "forwarding.received"],
    onEvent: (event) => {
      if (
        event.type === "session.prompted" ||
        event.type === "task.updated" ||
        event.type === "bridge.updated" ||
        event.type === "forwarding.received"
      ) {
        setLastBridgeEventAt(Date.now())
      }

      if (event.type === "session.prompted") {
        const payload = asRecord(event.payload)
        if (selectedSessionId && payload.sessionId === selectedSessionId) {
          void hydrateSessionThread(selectedSessionId)
          void loadBridgeSessions()
        }
        return
      }

      if (event.type === "task.updated" || event.type === "bridge.updated" || event.type === "forwarding.received") {
        void loadBridgeState()
      }
    },
  })

  return (
    <main className="bridge-page min-h-screen overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="bridge-scene-background fixed inset-0 z-0">
        <BridgeDeckScene3D
          operatorLabel={operatorLabel}
          stardate={stardate}
          missionStats={missionStats}
          systems={systems}
          workItems={workItems}
          stations={stations}
          commsFeed={sceneCommsFeed}
          lastEventAt={lastBridgeEventAt}
          selectedStationKey={selectedStation?.stationKey ?? null}
          onStationSelect={handleSceneStationSelect}
        />
        <div className="bridge-scene-scrim absolute inset-0" />
        <div className="bridge-halftone absolute inset-0 opacity-55" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-[1520px] flex-col gap-4 px-4 pb-8 pt-6 pointer-events-none sm:px-6 lg:px-8">
        <section className="bridge-cel-panel bridge-cel-outline pointer-events-auto rounded-2xl px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-700/80 dark:text-cyan-200/80">Bridge Command</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Cel-Shaded Orchestration Bridge</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label className="inline-flex items-center gap-2 rounded-full border border-slate-900/20 bg-white/70 px-3 py-1 text-slate-700 dark:border-slate-300/25 dark:bg-slate-900/55 dark:text-slate-200">
                <span className="text-[10px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Ship</span>
                <select
                  value={selectedShipDeploymentId || ""}
                  onChange={(event) => setSelectedShipDeploymentId(event.target.value || null)}
                  className="min-w-[170px] bg-transparent text-xs font-medium text-slate-800 outline-none dark:text-slate-100"
                >
                  {availableShips.length === 0 ? (
                    <option value="">No ships</option>
                  ) : (
                    <>
                      <option value="">Auto-select latest active</option>
                      {availableShips.map((ship) => (
                        <option key={ship.id} value={ship.id}>
                          {ship.name} ({ship.status})
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </label>
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/35 bg-cyan-500/10 px-3 py-1 text-cyan-700 dark:text-cyan-100">
                <Users className="h-3.5 w-3.5" />
                {operatorLabel}
              </span>
              <span className="rounded-full border border-slate-900/20 dark:border-slate-300/25 bg-white/70 dark:bg-slate-900/55 px-3 py-1 text-slate-700 dark:text-slate-200">
                SD {stardate}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/30 bg-emerald-500/10 px-3 py-1 text-emerald-700 dark:text-emerald-200">
                <Signal className="h-3.5 w-3.5" />
                Fleet uplink nominal
              </span>
              {selectedShip && (
                <span className="rounded-full border border-slate-900/20 dark:border-slate-300/25 bg-white/70 dark:bg-slate-900/55 px-3 py-1 text-slate-700 dark:text-slate-200">
                  {selectedShip.name}
                </span>
              )}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-700 dark:text-slate-300 sm:grid-cols-3">
            <div className="inline-flex items-center gap-2 rounded-lg border border-slate-900/15 dark:border-slate-300/20 bg-white/65 dark:bg-slate-900/40 px-2.5 py-2">
              <Shield className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-300" />
              Security posture stable
            </div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-slate-900/15 dark:border-slate-300/20 bg-white/65 dark:bg-slate-900/40 px-2.5 py-2">
              <Sparkles className="h-3.5 w-3.5 text-cyan-700 dark:text-cyan-300" />
              Runtime synchronized
            </div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-slate-900/15 dark:border-slate-300/20 bg-white/65 dark:bg-slate-900/40 px-2.5 py-2">
              <Bot className="h-3.5 w-3.5 text-amber-700 dark:text-amber-300" />
              Roundtable ready
            </div>
          </div>
        </section>

        {error && (
          <div className="pointer-events-auto rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-700 dark:text-rose-100">
            {error}
          </div>
        )}

        <div className="pointer-events-auto xl:hidden">
          <div className="grid grid-cols-4 gap-2 rounded-xl border border-slate-900/15 dark:border-slate-300/20 bg-white/70 dark:bg-slate-900/55 p-1 backdrop-blur-sm">
            {mobileSections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => setMobileSection(section.id)}
                className={`rounded-md px-2 py-1.5 text-xs font-medium transition ${
                  mobileSection === section.id
                    ? "bg-cyan-500/20 text-cyan-700 dark:text-cyan-100"
                    : "text-slate-700 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-700/40"
                }`}
              >
                {section.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[290px_minmax(0,1fr)_360px]">
          <section className={`${mobileSection === "crew" ? "block" : "hidden"} xl:block`}>
            <div className="bridge-cel-panel bridge-cel-outline pointer-events-auto rounded-2xl p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold">Bridge Crew</h2>
                <span className="text-xs text-slate-700 dark:text-slate-300">{stations.length} agents</span>
              </div>

              {isBridgeLoading ? (
                <div className="flex items-center gap-2 rounded-lg border border-slate-900/15 dark:border-slate-300/20 bg-white/70 dark:bg-slate-900/45 px-3 py-3 text-sm text-slate-700 dark:text-slate-300">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading crew stations...
                </div>
              ) : (
                <div className="space-y-2.5">
                  {stations.map((station) => {
                    const selected = station.stationKey === selectedStation?.stationKey
                    return (
                      <button
                        key={station.stationKey}
                        type="button"
                        onClick={() => {
                          setSelectedStationKey(station.stationKey)
                          setMobileSection("comms")
                        }}
                        className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                          selected
                            ? "border-cyan-300/55 bg-cyan-500/12"
                            : "border-slate-900/15 dark:border-slate-300/20 bg-white/65 dark:bg-slate-900/40 hover:border-cyan-300/35"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{station.callsign}</p>
                            <p className="truncate text-[11px] uppercase tracking-[0.12em] text-slate-700 dark:text-slate-300">{station.role}</p>
                          </div>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase ${statusLabelStyles[station.status]}`}
                          >
                            <span className={`h-2 w-2 rounded-full ${statusStyles[station.status]}`} />
                            {station.status}
                          </span>
                        </div>
                        <p className="mt-2 line-clamp-2 text-xs text-slate-700 dark:text-slate-300">{station.focus}</p>
                        <div className="mt-2">
                          <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-slate-700 dark:text-slate-300/90">
                            <span>Load</span>
                            <span>{Math.round(station.load)}%</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-slate-300/70 dark:bg-slate-700/70">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-sky-300"
                              style={{ width: `${Math.max(0, Math.min(100, station.load))}%` }}
                            />
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </section>

          <section className={`${mobileSection === "scene" ? "block" : "hidden"} xl:block`}>
            <div className="space-y-4">
              <div className="bridge-cel-panel bridge-cel-outline bridge-hud-sweep pointer-events-auto relative overflow-hidden rounded-2xl p-4 sm:p-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-700/80 dark:text-cyan-200/80">Immersive Bridge</p>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">3D Command Room Online</h2>
                  </div>
                  {selectedStation && (
                    <span className="rounded-full border border-cyan-300/35 bg-cyan-500/12 px-3 py-1 text-xs text-cyan-700 dark:text-cyan-100">
                      Focus: {selectedStation.callsign}
                    </span>
                  )}
                </div>

                <p className="text-sm text-slate-700 dark:text-slate-300">
                  Click any 3D station placeholder on the bridge deck to retarget comms and camera focus.
                </p>

                <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
                  <div className="rounded-lg border border-cyan-300/35 bg-cyan-500/10 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-cyan-700/80 dark:text-cyan-200/80">Active</div>
                    <div className="text-xl font-semibold text-cyan-700 dark:text-cyan-100">{missionStats.active}</div>
                  </div>
                  <div className="rounded-lg border border-emerald-300/35 bg-emerald-500/10 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-200/80">Completed</div>
                    <div className="text-xl font-semibold text-emerald-700 dark:text-emerald-100">{missionStats.completed}</div>
                  </div>
                  <div className="rounded-lg border border-rose-300/35 bg-rose-500/10 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-rose-700/80 dark:text-rose-200/80">Failed</div>
                    <div className="text-xl font-semibold text-rose-700 dark:text-rose-100">{missionStats.failed}</div>
                  </div>
                </div>
              </div>

              {selectedStation && (
                <div className="bridge-cel-panel bridge-cel-outline pointer-events-auto rounded-2xl p-4">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-700/80 dark:text-cyan-200/90">Station Focus</p>
                  <p className="mt-1 text-sm font-semibold">{selectedStation.callsign} · {selectedStation.role}</p>
                  <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">{selectedStation.focus}</p>
                </div>
              )}

              <div className="bridge-cel-panel bridge-cel-outline pointer-events-auto rounded-2xl p-4">
                <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-700/80 dark:text-cyan-200/90">Systems Snapshot</p>
                <div className="mt-2 space-y-2">
                  {systems.slice(0, 3).map((system) => (
                    <div key={system.label} className="rounded-lg border border-slate-900/15 dark:border-slate-200/20 bg-white/60 dark:bg-slate-900/45 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-slate-900 dark:text-slate-100">{system.label}</span>
                        <span className={`text-[10px] uppercase ${systemStyles[system.state]}`}>{system.state}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">{system.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className={`${mobileSection === "comms" ? "block" : "hidden"} xl:block`}>
            <div className="bridge-cel-panel bridge-cel-outline bridge-console-frame pointer-events-auto rounded-2xl p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-700/80 dark:text-cyan-200/80">Bridge Comms</p>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {selectedStation ? selectedStation.callsign : "No station selected"}
                  </h2>
                </div>
                {isThreadLoading && <Loader2 className="h-4 w-4 animate-spin text-cyan-700 dark:text-cyan-200" />}
              </div>

              <div className="mb-3 h-[310px] space-y-2 overflow-y-auto rounded-xl border border-slate-900/15 dark:border-slate-200/20 bg-white/75 dark:bg-slate-950/70 p-3 sm:h-[360px] xl:h-[460px]">
                {!selectedStation && (
                  <div className="rounded-lg border border-dashed border-slate-300/30 px-3 py-4 text-sm text-slate-700 dark:text-slate-300">
                    Select a station to open bridge comms.
                  </div>
                )}

                {selectedStation && threadMessages.length === 0 && !isThreadLoading && (
                  <div className="rounded-lg border border-dashed border-cyan-300/30 bg-cyan-500/10 px-3 py-4 text-sm text-cyan-700 dark:text-cyan-100">
                    No transcript yet. Send the first directive to {selectedStation.callsign}.
                  </div>
                )}

                {threadMessages.map((message) => {
                  const isUser = message.type === "user_input"
                  const isError = message.type === "error"

                  return (
                    <div
                      key={message.id}
                      className={`rounded-lg border px-3 py-2.5 text-sm ${
                        isUser
                          ? "border-cyan-300/35 bg-cyan-500/12 text-cyan-800 dark:text-cyan-50"
                          : isError
                            ? "border-rose-300/35 bg-rose-500/10 text-rose-700 dark:text-rose-100"
                            : "border-slate-900/15 dark:border-slate-200/20 bg-white/80 dark:bg-slate-900/65 text-slate-900 dark:text-slate-100"
                      } ${message.pending ? "opacity-70" : ""}`}
                    >
                      <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.14em] text-slate-700 dark:text-slate-300/90">
                        <span>
                          {isUser
                            ? `${operatorLabel}`
                            : message.bridgePrimaryAgent || selectedStation?.callsign || "Bridge AI"}
                        </span>
                        <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>

                      {!isUser && message.bridgeCameos && message.bridgeCameos.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {message.bridgeCameos.map((cameo) => (
                            <span
                              key={`${message.id}-${cameo}`}
                              className="rounded-full border border-amber-300/30 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-amber-700 dark:text-amber-100"
                            >
                              cameo {cameo}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <form onSubmit={handleSend} className="space-y-2">
                <textarea
                  value={composer}
                  onChange={(event) => setComposer(event.target.value)}
                  placeholder={selectedStation ? `Issue directive to ${selectedStation.callsign}...` : "Select a station first"}
                  disabled={!selectedStation || isSending}
                  rows={4}
                  className="w-full resize-none rounded-xl border border-slate-900/15 dark:border-slate-200/20 bg-white/75 dark:bg-slate-950/65 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-cyan-300/45 focus:outline-none"
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-700 dark:text-slate-300">Roundtable mode: primary + cameo replies</span>
                  <button
                    type="submit"
                    disabled={!selectedStation || !composer.trim() || isSending}
                    className="inline-flex items-center gap-2 rounded-lg border border-cyan-300/35 bg-cyan-500/15 px-3.5 py-2 text-sm font-medium text-cyan-700 dark:text-cyan-100 transition hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Transmit
                  </button>
                </div>
              </form>
            </div>
          </section>
        </div>

        <div className={`${mobileSection === "queue" ? "block" : "hidden"} grid gap-4 xl:grid xl:grid-cols-[1.25fr_1fr] xl:gap-4`}>
          <section className="bridge-cel-panel bridge-cel-outline pointer-events-auto rounded-2xl p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Workload Queue</h2>
              <span className="text-xs text-slate-700 dark:text-slate-300">{workItems.length} items</span>
            </div>

            <div className="space-y-2.5">
              {workItems.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-300/30 px-3 py-4 text-sm text-slate-700 dark:text-slate-300">
                  No workload items available.
                </div>
              )}

              {workItems.slice(0, 8).map((item) => (
                <div key={item.id} className="rounded-lg border border-slate-900/15 dark:border-slate-200/20 bg-white/70 dark:bg-slate-900/50 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{item.name}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${workItemStyles[item.status]}`}>
                      {item.status}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-xs text-slate-700 dark:text-slate-300">
                    <span>ETA {item.eta}</span>
                    <span className="truncate">Station {item.assignedTo.slice(-8)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="bridge-cel-panel bridge-cel-outline pointer-events-auto rounded-2xl p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Systems Core</h2>
              <span className="text-xs text-slate-700 dark:text-slate-300">Fleet status</span>
            </div>

            <div className="space-y-2.5">
              {systems.map((system) => (
                <div key={system.label} className="rounded-lg border border-slate-900/15 dark:border-slate-200/20 bg-white/70 dark:bg-slate-900/50 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{system.label}</p>
                    <span className={`text-xs uppercase ${systemStyles[system.state]}`}>{system.state}</span>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-700 dark:text-slate-300">{system.detail}</p>
                </div>
              ))}

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-cyan-300/30 bg-cyan-500/10 px-2.5 py-2 text-center text-xs text-cyan-700 dark:text-cyan-100">
                  <Activity className="mx-auto mb-1 h-3.5 w-3.5" />
                  Active {missionStats.active}
                </div>
                <div className="rounded-lg border border-emerald-300/30 bg-emerald-500/10 px-2.5 py-2 text-center text-xs text-emerald-700 dark:text-emerald-100">
                  <CheckCircle2 className="mx-auto mb-1 h-3.5 w-3.5" />
                  Done {missionStats.completed}
                </div>
                <div className="rounded-lg border border-rose-300/30 bg-rose-500/10 px-2.5 py-2 text-center text-xs text-rose-700 dark:text-rose-100">
                  <AlertTriangle className="mx-auto mb-1 h-3.5 w-3.5" />
                  Failed {missionStats.failed}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
