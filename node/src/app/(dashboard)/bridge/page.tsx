"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { useSession } from "@/lib/auth-client"
import { useEventStream } from "@/lib/realtime/useEventStream"
import type { BridgeStationKey } from "@/lib/bridge/stations"
import {
  BRIDGE_DISPATCH_DEFAULT_RUNTIME,
  listBridgeDispatchRuntimeDescriptors,
  type BridgeDispatchRuntimeId,
} from "@/lib/bridge/connections/dispatch-runtime"
import { BridgeDeckScene3D } from "@/components/bridge/BridgeDeckScene3D"
import { useShipSelection } from "@/lib/shipyard/useShipSelection"
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Loader2,
  Maximize2,
  MessageSquare,
  Minimize2,
  Send,
  Signal,
  Sparkles,
  Users,
  X,
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
  href?: string | null
  source?: "core" | "ship-monitoring" | "forwarded"
  service?: "grafana" | "prometheus"
  observedAt?: string | null
}

interface MonitoringStatus {
  label: string
  service: "grafana" | "prometheus" | "kubeview"
  state: "nominal" | "warning" | "critical"
  detail: string
  href: string | null
  source: "ship-monitoring" | "forwarded"
  observedAt: string | null
}

interface MonitoringSnapshot {
  grafana: MonitoringStatus
  prometheus: MonitoringStatus
  kubeview: MonitoringStatus
}

interface MonitoringFrameView {
  title: string
  href: string
}

interface RuntimeUiCard {
  label: string
  href: string | null
  source: string
  instances: RuntimeUiInstanceCard[]
}

interface RuntimeUiInstanceCard {
  stationKey: BridgeStationKey
  callsign: string
  label: string
  href: string | null
  source: string
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
}

interface BridgeSceneCommsEntry {
  speaker: string
  text: string
  timestamp: string
  kind: "directive" | "response" | "error" | "system"
}

interface BridgeConnectionOption {
  id: string
  name: string
  provider: "telegram" | "discord" | "whatsapp"
  enabled: boolean
  autoRelay: boolean
}

const STATION_KEYS = new Set<BridgeStationKey>(["xo", "ops", "eng", "sec", "med", "cou"])
const BRIDGE_3D_STORAGE_KEY = "orchwiz:bridge:3d-enabled"

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
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim().toLowerCase() as BridgeStationKey
  return STATION_KEYS.has(normalized) ? normalized : null
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

function mapInteractionToMessage(interaction: SessionInteractionItem): BridgeMessageViewModel {
  const metadata = asRecord(interaction.metadata)

  return {
    id: interaction.id,
    type: interaction.type,
    content: interaction.content,
    timestamp: interaction.timestamp,
    bridgePrimaryAgent:
      typeof metadata.bridgePrimaryAgent === "string" ? metadata.bridgePrimaryAgent : undefined,
  }
}

function normalizeStationStatus(value: unknown): BridgeStation["status"] {
  if (value === "online" || value === "busy" || value === "offline") {
    return value
  }

  return "online"
}

function normalizeSystemState(value: unknown): SystemStatus["state"] {
  if (value === "nominal" || value === "warning" || value === "critical") {
    return value
  }

  return "warning"
}

function asMonitoringService(value: unknown): SystemStatus["service"] | undefined {
  if (value === "grafana" || value === "prometheus") {
    return value
  }
  return undefined
}

function asSystemSource(value: unknown): SystemStatus["source"] | undefined {
  if (value === "core" || value === "ship-monitoring" || value === "forwarded") {
    return value
  }
  return undefined
}

function asMonitoringSource(value: unknown): MonitoringStatus["source"] {
  return value === "forwarded" ? "forwarded" : "ship-monitoring"
}

function parseMonitoringStatus(
  value: unknown,
  service: MonitoringStatus["service"],
): MonitoringStatus {
  const payload = asRecord(value)
  const fallbackLabel =
    service === "grafana" ? "Grafana" : service === "prometheus" ? "Prometheus" : "KubeView"
  const fallbackDetail =
    service === "grafana"
      ? "Grafana telemetry unresolved. Configure monitoring URL in Ship Yard."
      : service === "prometheus"
        ? "Prometheus telemetry unresolved. Configure monitoring URL in Ship Yard."
        : "KubeView link unresolved. Configure monitoring URL in Ship Yard."

  return {
    label:
      typeof payload.label === "string" && payload.label.trim().length > 0
        ? payload.label
        : fallbackLabel,
    service,
    state: normalizeSystemState(payload.state),
    detail:
      typeof payload.detail === "string" && payload.detail.trim().length > 0
        ? payload.detail
        : fallbackDetail,
    href: typeof payload.href === "string" && payload.href.trim().length > 0 ? payload.href : null,
    source: asMonitoringSource(payload.source),
    observedAt:
      typeof payload.observedAt === "string" && payload.observedAt.trim().length > 0
        ? payload.observedAt
        : null,
  }
}

function compactTelemetryText(value: string, maxLength = 160) {
  const compact = value.replace(/\s+/g, " ").trim()
  if (compact.length <= maxLength) {
    return compact
  }

  return `${compact.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

export default function BridgePage() {
  const { data: session } = useSession()
  const { selectedShipDeploymentId, setSelectedShipDeploymentId } = useShipSelection()

  const [stations, setStations] = useState<BridgeStation[]>([])
  const [workItems, setWorkItems] = useState<WorkItem[]>([])
  const [systems, setSystems] = useState<SystemStatus[]>([])
  const [monitoring, setMonitoring] = useState<MonitoringSnapshot | null>(null)
  const [monitoringFrame, setMonitoringFrame] = useState<MonitoringFrameView | null>(null)
  const [openClawRuntimeUi, setOpenClawRuntimeUi] = useState<RuntimeUiCard>({
    label: "OpenClaw Runtime UI",
    href: null,
    source: "unconfigured",
    instances: [],
  })
  const [availableShips, setAvailableShips] = useState<ShipSelectorItem[]>([])

  const [selectedStationKey, setSelectedStationKey] = useState<BridgeStationKey | null>(null)
  const [sessionsByStation, setSessionsByStation] = useState<Partial<Record<BridgeStationKey, BridgeSessionRef>>>({})
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [threadMessages, setThreadMessages] = useState<BridgeMessageViewModel[]>([])

  const [composer, setComposer] = useState("")
  const [isBridgeLoading, setIsBridgeLoading] = useState(true)
  const [isThreadLoading, setIsThreadLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isPatchingThrough, setIsPatchingThrough] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastBridgeEventAt, setLastBridgeEventAt] = useState<number | null>(null)
  const [patchComposer, setPatchComposer] = useState("")
  const [selectedRuntimeId, setSelectedRuntimeId] = useState<BridgeDispatchRuntimeId>(
    BRIDGE_DISPATCH_DEFAULT_RUNTIME,
  )
  const [showRuntimeIframe, setShowRuntimeIframe] = useState(false)
  const [connectionOptions, setConnectionOptions] = useState<BridgeConnectionOption[]>([])
  const [selectedConnectionIds, setSelectedConnectionIds] = useState<string[]>([])

  const [showThreeD, setShowThreeD] = useState(false)
  const [isThreeDFullscreen, setIsThreeDFullscreen] = useState(false)
  const threeDSectionRef = useRef<HTMLElement | null>(null)
  const [characterModelUrls, setCharacterModelUrls] = useState<Partial<Record<BridgeStationKey, string>>>({})

  const stardate = formatStardate(new Date())
  const operatorLabel = session?.user?.email || "Operator"
  const runtimeDescriptors = useMemo(() => listBridgeDispatchRuntimeDescriptors(), [])
  const selectedRuntimeDescriptor = useMemo(
    () =>
      runtimeDescriptors.find((runtime) => runtime.id === selectedRuntimeId)
      || runtimeDescriptors[0]
      || null,
    [runtimeDescriptors, selectedRuntimeId],
  )

  const selectedStation = useMemo(() => {
    if (!selectedStationKey) {
      return stations[0] || null
    }

    return stations.find((station) => station.stationKey === selectedStationKey) || stations[0] || null
  }, [selectedStationKey, stations])

  const selectedOpenClawRuntimeInstance = useMemo(() => {
    if (openClawRuntimeUi.instances.length === 0) {
      return null
    }

    if (selectedStation?.stationKey) {
      const matched = openClawRuntimeUi.instances.find(
        (instance) => instance.stationKey === selectedStation.stationKey,
      )
      if (matched) {
        return matched
      }
    }

    return openClawRuntimeUi.instances[0]
  }, [openClawRuntimeUi.instances, selectedStation?.stationKey])

  const selectedShip = useMemo(() => {
    if (!selectedShipDeploymentId) {
      return null
    }

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
    return threadMessages
      .filter((message) => message.content.trim().length > 0)
      .slice(-5)
      .map((message) => {
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
  }, [selectedStation?.callsign, threadMessages])

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
              if (!stationKey) {
                return null
              }

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
                status: normalizeStationStatus(station.status),
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
              } satisfies BridgeStation
            })
            .filter((station: BridgeStation | null): station is BridgeStation => station !== null)
        : []

      const nextWorkItems: WorkItem[] = Array.isArray(payload?.workItems)
        ? payload.workItems.map((item: Record<string, unknown>) => {
            const status =
              item.status === "active" ||
              item.status === "completed" ||
              item.status === "failed"
                ? item.status
                : "pending"

            return {
              id: typeof item.id === "string" ? item.id : crypto.randomUUID(),
              name: typeof item.name === "string" ? item.name : "Untitled task",
              status,
              eta: typeof item.eta === "string" ? item.eta : "TBD",
              assignedTo: typeof item.assignedTo === "string" ? item.assignedTo : "",
            }
          })
        : []

      const nextSystems: SystemStatus[] = Array.isArray(payload?.systems)
        ? payload.systems.map((system: Record<string, unknown>) => {
            const href =
              typeof system.href === "string" && system.href.trim().length > 0
                ? system.href
                : null

            return {
              label: typeof system.label === "string" ? system.label : "Subsystem",
              state: normalizeSystemState(system.state),
              detail: typeof system.detail === "string" ? system.detail : "No detail",
              href,
              source: asSystemSource(system.source),
              service: asMonitoringService(system.service),
              observedAt:
                typeof system.observedAt === "string" && system.observedAt.trim().length > 0
                  ? system.observedAt
                  : null,
            }
          })
        : []

      const monitoringByService = nextSystems.reduce<Partial<Record<MonitoringStatus["service"], SystemStatus>>>(
        (acc, system) => {
          if (!system.service) {
            return acc
          }
          if (!acc[system.service]) {
            acc[system.service] = system
          }
          return acc
        },
        {},
      )

      const monitoringPayload = asRecord(payload?.monitoring)
      const nextMonitoring: MonitoringSnapshot = {
        grafana: parseMonitoringStatus(
          monitoringPayload.grafana ?? monitoringByService.grafana ?? {},
          "grafana",
        ),
        prometheus: parseMonitoringStatus(
          monitoringPayload.prometheus ?? monitoringByService.prometheus ?? {},
          "prometheus",
        ),
        kubeview: parseMonitoringStatus(
          monitoringPayload.kubeview ?? {},
          "kubeview",
        ),
      }

      const runtimeUiPayload = asRecord(payload?.runtimeUi)
      const runtimeUiOpenClawPayload = asRecord(runtimeUiPayload.openclaw)
      const runtimeUiOpenClawInstances = Array.isArray(runtimeUiOpenClawPayload.instances)
        ? runtimeUiOpenClawPayload.instances
            .map((entry): RuntimeUiInstanceCard | null => {
              const record = asRecord(entry)
              const stationKey = asStationKey(record.stationKey)
              if (!stationKey) {
                return null
              }

              return {
                stationKey,
                callsign:
                  typeof record.callsign === "string" && record.callsign.trim().length > 0
                    ? record.callsign
                    : stationKey.toUpperCase(),
                label:
                  typeof record.label === "string" && record.label.trim().length > 0
                    ? record.label
                    : `${stationKey.toUpperCase()} OpenClaw UI`,
                href:
                  typeof record.href === "string" && record.href.trim().length > 0
                    ? record.href
                    : null,
                source:
                  typeof record.source === "string" && record.source.trim().length > 0
                    ? record.source
                    : "unconfigured",
              }
            })
            .filter((entry: RuntimeUiInstanceCard | null): entry is RuntimeUiInstanceCard => entry !== null)
        : []
      const nextOpenClawRuntimeUi: RuntimeUiCard = {
        label:
          typeof runtimeUiOpenClawPayload.label === "string" && runtimeUiOpenClawPayload.label.trim().length > 0
            ? runtimeUiOpenClawPayload.label
            : "OpenClaw Runtime UI",
        href:
          typeof runtimeUiOpenClawPayload.href === "string" && runtimeUiOpenClawPayload.href.trim().length > 0
            ? runtimeUiOpenClawPayload.href
            : null,
        source:
          typeof runtimeUiOpenClawPayload.source === "string" && runtimeUiOpenClawPayload.source.trim().length > 0
            ? runtimeUiOpenClawPayload.source
            : "unconfigured",
        instances: runtimeUiOpenClawInstances,
      }

      const nextShips: ShipSelectorItem[] = Array.isArray(payload?.availableShips)
        ? payload.availableShips
            .map((ship: Record<string, unknown>) => {
              if (typeof ship.id !== "string" || typeof ship.name !== "string") {
                return null
              }

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
      setMonitoring(nextMonitoring)
      setOpenClawRuntimeUi(nextOpenClawRuntimeUi)
      setAvailableShips(nextShips)
      setSelectedStationKey((current) => {
        if (current && nextStations.some((station) => station.stationKey === current)) {
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

  const loadCharacterModels = useCallback(async () => {
    try {
      const response = await fetch("/api/bridge/character-models")
      if (!response.ok) return
      const data = (await response.json()) as Record<string, string | null>
      const next: Partial<Record<BridgeStationKey, string>> = {}
      for (const key of STATION_KEYS) {
        const url = data[key]
        if (typeof url === "string" && url.trim().length > 0) {
          next[key] = `/api/bridge/character-models/proxy?url=${encodeURIComponent(url.trim())}`
        }
      }
      setCharacterModelUrls(next)
    } catch {
      // Non-fatal; bridge still works with placeholder capsules
    }
  }, [])

  const loadBridgeConnections = useCallback(async () => {
    if (!selectedShipDeploymentId) {
      setConnectionOptions([])
      setSelectedConnectionIds([])
      return
    }

    try {
      const response = await fetch(`/api/bridge/connections?deploymentId=${selectedShipDeploymentId}&deliveriesTake=10`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const payload = await response.json()
      const next: BridgeConnectionOption[] = Array.isArray(payload?.connections)
        ? payload.connections
            .map((connection: Record<string, unknown>) => {
              const provider = connection.provider
              if (provider !== "telegram" && provider !== "discord" && provider !== "whatsapp") {
                return null
              }

              if (typeof connection.id !== "string" || typeof connection.name !== "string") {
                return null
              }

              return {
                id: connection.id,
                name: connection.name,
                provider,
                enabled: connection.enabled === true,
                autoRelay: connection.autoRelay === true,
              } satisfies BridgeConnectionOption
            })
            .filter((entry: BridgeConnectionOption | null): entry is BridgeConnectionOption => entry !== null)
        : []

      setConnectionOptions(next)
      setSelectedConnectionIds((current) =>
        current.filter((connectionId) => next.some((connection) => connection.id === connectionId)),
      )
    } catch (loadError) {
      console.error("Bridge connection options load failed:", loadError)
    }
  }, [selectedShipDeploymentId])

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
        if (!ref) {
          continue
        }

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
      const interactions = Array.isArray(payload.interactions) ? payload.interactions : []
      setThreadMessages(interactions.map(mapInteractionToMessage))
      setError(null)
    } catch (loadError) {
      console.error("Bridge thread load failed:", loadError)
      setThreadMessages([])
      setError("Unable to load station transcript")
    } finally {
      setIsThreadLoading(false)
    }
  }, [])

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
              subagentId: station.subagentId || undefined,
              bridgeCrewId: station.bridgeCrewId || station.subagentId,
              shipDeploymentId: selectedShipDeploymentId,
            },
          },
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to create session: HTTP ${response.status}`)
      }

      const created = (await response.json()) as {
        id: string
        title: string | null
        updatedAt: string
      }

      const ref: BridgeSessionRef = {
        id: created.id,
        stationKey: station.stationKey,
        title: created.title,
        updatedAt: created.updatedAt,
      }

      setSessionsByStation((current) => ({
        ...current,
        [station.stationKey]: ref,
      }))

      return ref
    },
    [selectedShipDeploymentId, sessionsByStation],
  )

  const handleSend = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      if (!selectedStation || !composer.trim() || isSending) {
        return
      }

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
                subagentId: selectedStation.subagentId || undefined,
                bridgeCrewId: selectedStation.bridgeCrewId || selectedStation.subagentId,
                shipDeploymentId: selectedShipDeploymentId,
                cameoCandidates,
                missionContext: {
                  operator: operatorLabel,
                  stardate,
                  systems: systems.slice(0, 3),
                  workItems: workItems.slice(0, 4),
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
        setError("Unable to send directive")
      } finally {
        setIsSending(false)
      }
    },
    [
      composer,
      ensureSessionForStation,
      hydrateSessionThread,
      isSending,
      loadBridgeSessions,
      operatorLabel,
      selectedShipDeploymentId,
      selectedStation,
      stardate,
      stations,
      systems,
      workItems,
    ],
  )

  const handlePatchThrough = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      if (!selectedShipDeploymentId || !patchComposer.trim() || isPatchingThrough) {
        return
      }

      setIsPatchingThrough(true)
      try {
        const response = await fetch("/api/bridge/connections/dispatch", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            deploymentId: selectedShipDeploymentId,
            message: patchComposer.trim(),
            runtime: selectedRuntimeId,
            bridgeContext: {
              stationKey: selectedStation?.stationKey,
              callsign: selectedStation?.callsign,
              ...(selectedStation?.bridgeCrewId
                ? {
                    bridgeCrewId: selectedStation.bridgeCrewId,
                  }
                : {}),
            },
            ...(selectedConnectionIds.length > 0 ? { connectionIds: selectedConnectionIds } : {}),
          }),
        })

        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`)
        }

        setPatchComposer("")
        setError(null)
        void loadBridgeConnections()
      } catch (patchError) {
        console.error("Bridge patch-through failed:", patchError)
        setError(patchError instanceof Error ? patchError.message : "Unable to patch through message")
      } finally {
        setIsPatchingThrough(false)
      }
    },
    [
      isPatchingThrough,
      loadBridgeConnections,
      patchComposer,
      selectedRuntimeId,
      selectedConnectionIds,
      selectedShipDeploymentId,
      selectedStation?.bridgeCrewId,
      selectedStation?.callsign,
      selectedStation?.stationKey,
    ],
  )

  useEffect(() => {
    const saved = window.localStorage.getItem(BRIDGE_3D_STORAGE_KEY)
    setShowThreeD(saved === "1")
  }, [])

  useEffect(() => {
    const syncFullscreen = () => {
      const container = threeDSectionRef.current
      setIsThreeDFullscreen(Boolean(container && document.fullscreenElement === container))
    }

    syncFullscreen()
    document.addEventListener("fullscreenchange", syncFullscreen)
    return () => document.removeEventListener("fullscreenchange", syncFullscreen)
  }, [])

  useEffect(() => {
    if (showThreeD) {
      return
    }

    const container = threeDSectionRef.current
    setIsThreeDFullscreen(false)

    if (container && document.fullscreenElement === container) {
      void document.exitFullscreen().catch(() => {
        // Ignore if fullscreen already closed by the browser.
      })
    }
  }, [showThreeD])

  const toggleThreeDFullscreen = useCallback(async () => {
    const container = threeDSectionRef.current
    if (!container) {
      return
    }

    try {
      if (document.fullscreenElement === container) {
        await document.exitFullscreen()
        return
      }

      if (document.fullscreenElement) {
        await document.exitFullscreen()
      }

      await container.requestFullscreen()
    } catch (fullscreenError) {
      console.error("Failed to toggle 3D deck fullscreen:", fullscreenError)
      setError("Unable to toggle 3D deck fullscreen")
    }
  }, [])

  const toggleThreeDDeck = useCallback(() => {
    setShowThreeD((current) => {
      const next = !current
      window.localStorage.setItem(BRIDGE_3D_STORAGE_KEY, next ? "1" : "0")
      return next
    })
  }, [])

  useEffect(() => {
    if (!session) {
      return
    }

    void loadBridgeState()
    void loadBridgeSessions()
    void loadBridgeConnections()
    void loadCharacterModels()
  }, [session, loadBridgeConnections, loadBridgeSessions, loadBridgeState, loadCharacterModels])

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
  }, [hydrateSessionThread, selectedStation?.stationKey, sessionsByStation])

  useEffect(() => {
    setShowRuntimeIframe(false)
  }, [selectedStation?.stationKey, selectedShipDeploymentId])

  useEventStream({
    enabled: Boolean(session),
    types: [
      "session.prompted",
      "task.updated",
      "bridge.updated",
      "forwarding.received",
      "bridge.comms.updated",
    ],
    onEvent: (event) => {
      if (
        event.type === "session.prompted" ||
        event.type === "task.updated" ||
        event.type === "bridge.updated" ||
        event.type === "forwarding.received" ||
        event.type === "bridge.comms.updated"
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

      if (event.type === "bridge.comms.updated") {
        void loadBridgeConnections()
      }
    },
  })

  return (
    <main className="bridge-page min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 pb-8 pt-6 sm:px-6 lg:px-8">
        <section className="bridge-cel-panel bridge-cel-outline rounded-2xl p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-700/75 dark:text-cyan-200/80">Bridge</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">Comms Deck</h1>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">2D-first command view with optional 3D tactical deck.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label className="inline-flex items-center gap-2 rounded-full border border-slate-400/35 bg-white/80 px-3 py-1 dark:bg-slate-900/70">
                <span className="uppercase tracking-[0.14em] text-slate-500 dark:text-slate-300">Hull</span>
                <select
                  value={selectedShipDeploymentId || ""}
                  onChange={(event) => setSelectedShipDeploymentId(event.target.value || null)}
                  className="min-w-[170px] bg-transparent text-xs font-medium text-slate-900 outline-none dark:text-slate-100"
                >
                  {availableShips.length === 0 ? (
                    <option value="">No ships</option>
                  ) : (
                    <>
                      <option value="">Auto-route active hull</option>
                      {availableShips.map((ship) => (
                        <option key={ship.id} value={ship.id}>
                          {ship.name} ({ship.status})
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </label>

              <span className="rounded-full border border-cyan-300/35 bg-cyan-500/12 px-3 py-1 text-cyan-700 dark:text-cyan-100">
                <Users className="mr-1 inline h-3.5 w-3.5" />
                {operatorLabel}
              </span>
              <span className="rounded-full border border-slate-400/35 bg-white/80 px-3 py-1 dark:bg-slate-900/70">SD {stardate}</span>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              href="/bridge-call"
              className="inline-flex items-center gap-2 rounded-lg border border-cyan-300/45 bg-cyan-500/14 px-3 py-2 text-sm font-medium text-cyan-700 transition hover:bg-cyan-500/24 dark:text-cyan-100"
            >
              <Signal className="h-4 w-4" />
              Open Bridge Call
              <ArrowRight className="h-4 w-4" />
            </Link>

            <Link
              href="/bridge-chat?voice=1"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-400/35 bg-white/80 px-3 py-2 text-sm text-slate-700 transition hover:bg-white dark:bg-slate-900/70 dark:text-slate-200"
            >
              <MessageSquare className="h-4 w-4" />
              Voice Utility
            </Link>

            {(["grafana", "prometheus", "kubeview"] as const).map((service) => {
              const status = monitoring?.[service] || null
              const label =
                service === "grafana"
                  ? "Open Grafana"
                  : service === "prometheus"
                    ? "Open Prometheus"
                    : "Open KubeView"
              const configureLabel =
                service === "grafana"
                  ? "Configure Grafana"
                  : service === "prometheus"
                    ? "Configure Prometheus"
                    : "Configure KubeView"
              const shipYardHref = selectedShipDeploymentId
                ? `/ship-yard?shipDeploymentId=${selectedShipDeploymentId}`
                : "/ship-yard"
              if (status?.href) {
                return (
                  <button
                    type="button"
                    key={service}
                    onClick={() =>
                      setMonitoringFrame({
                        title: label,
                        href: status.href as string,
                      })
                    }
                    className="inline-flex items-center gap-2 rounded-lg border border-emerald-300/40 bg-emerald-500/12 px-3 py-2 text-sm text-emerald-700 transition hover:bg-emerald-500/22 dark:text-emerald-100"
                  >
                    {label}
                  </button>
                )
              }

              return (
                <Link
                  key={service}
                  title={status?.detail || `${label} unavailable`}
                  href={shipYardHref}
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-300/40 bg-amber-500/12 px-3 py-2 text-sm text-amber-700 dark:text-amber-100"
                >
                  {configureLabel}
                </Link>
              )
            })}

            <button
              type="button"
              role="switch"
              aria-checked={showThreeD}
              onClick={toggleThreeDDeck}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-400/35 bg-white/80 px-3 py-2 text-sm text-slate-700 transition hover:bg-white dark:bg-slate-900/70 dark:text-slate-200"
            >
              <Sparkles className="h-4 w-4" />
              <span>3D Deck</span>
              <span
                className={`relative inline-flex h-5 w-10 items-center rounded-full transition ${
                  showThreeD ? "bg-cyan-500/80" : "bg-slate-400/60 dark:bg-slate-600/80"
                }`}
                aria-hidden
              >
                <span
                  className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                    showThreeD ? "translate-x-5" : "translate-x-1"
                  }`}
                />
              </span>
              <span className="text-xs uppercase tracking-[0.12em]">{showThreeD ? "On" : "Off"}</span>
            </button>

            {showThreeD && (
              <button
                type="button"
                onClick={() => void toggleThreeDFullscreen()}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-400/35 bg-white/80 px-3 py-2 text-sm text-slate-700 transition hover:bg-white dark:bg-slate-900/70 dark:text-slate-200"
              >
                {isThreeDFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                {isThreeDFullscreen ? "Exit Fullscreen" : "Fullscreen 3D"}
              </button>
            )}

            {selectedShip && (
              <span className="rounded-full border border-slate-400/35 bg-white/80 px-3 py-1 text-xs dark:bg-slate-900/70">
                {selectedShip.name}
              </span>
            )}
          </div>
        </section>

        {monitoringFrame && (
          <section className="bridge-cel-panel bridge-cel-outline rounded-2xl p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-700/80 dark:text-cyan-200/80">
                  Embedded Monitoring
                </p>
                <h2 className="text-base font-semibold">{monitoringFrame.title}</h2>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={monitoringFrame.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300/70 bg-white/70 px-2.5 py-1 text-xs text-slate-700 dark:border-white/15 dark:bg-slate-900/60 dark:text-slate-200"
                >
                  Open in new tab
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <button
                  type="button"
                  onClick={() => setMonitoringFrame(null)}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300/70 bg-white/70 px-2.5 py-1 text-xs text-slate-700 dark:border-white/15 dark:bg-slate-900/60 dark:text-slate-200"
                >
                  <X className="h-3.5 w-3.5" />
                  Close
                </button>
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-300/70 bg-white dark:border-white/12 dark:bg-slate-900/70">
              <iframe
                key={monitoringFrame.href}
                src={monitoringFrame.href}
                title={`${monitoringFrame.title} embedded dashboard`}
                className="h-[640px] w-full bg-white"
              />
            </div>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
              If embedding is blocked by browser or dashboard security headers, use{" "}
              <span className="font-medium">Open in new tab</span>.
            </p>
          </section>
        )}

        {showThreeD && (
          <section
            ref={threeDSectionRef}
            className={`relative overflow-hidden bg-slate-950 ${
              isThreeDFullscreen
                ? "h-screen w-screen rounded-none border-0"
                : "h-[330px] rounded-2xl border border-slate-400/30"
            }`}
          >
            <BridgeDeckScene3D
              key={isThreeDFullscreen ? "bridge-3d-fullscreen" : "bridge-3d-windowed"}
              operatorLabel={operatorLabel}
              stardate={stardate}
              missionStats={missionStats}
              systems={systems}
              workItems={workItems}
              stations={stations}
              commsFeed={sceneCommsFeed}
              lastEventAt={lastBridgeEventAt}
              selectedStationKey={selectedStation?.stationKey || null}
              onStationSelect={(stationKey) => setSelectedStationKey(stationKey)}
              characterModelUrls={characterModelUrls}
            />
            <button
              type="button"
              onClick={() => void toggleThreeDFullscreen()}
              className="absolute right-3 top-3 z-20 inline-flex items-center gap-2 rounded-md border border-slate-300/40 bg-slate-950/70 px-2.5 py-1.5 text-xs text-slate-100 backdrop-blur"
            >
              {isThreeDFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              {isThreeDFullscreen ? "Exit" : "Fullscreen"}
            </button>
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/45 to-transparent" />
          </section>
        )}

        {error && (
          <div className="rounded-xl border border-rose-300/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-100">
            {error}
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <section className="bridge-cel-panel bridge-cel-outline rounded-2xl p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-base font-semibold">Station Roster</h2>
              <span className="text-xs text-slate-600 dark:text-slate-300">{stations.length}</span>
            </div>

            {isBridgeLoading ? (
              <div className="inline-flex items-center gap-2 rounded-lg border border-slate-400/30 bg-white/80 px-3 py-2 text-sm dark:bg-slate-900/70">
                <Loader2 className="h-4 w-4 animate-spin" />
                Syncing bridge state
              </div>
            ) : (
              <div className="space-y-2">
                {stations.map((station) => {
                  const selected = station.stationKey === selectedStation?.stationKey
                  return (
                    <button
                      key={station.stationKey}
                      type="button"
                      onClick={() => setSelectedStationKey(station.stationKey)}
                      className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                        selected
                          ? "border-cyan-300/55 bg-cyan-500/14"
                          : "border-slate-400/35 bg-white/75 hover:border-cyan-300/35 dark:bg-slate-900/60"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">{station.callsign}</p>
                          <p className="text-[11px] uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">{station.role}</p>
                        </div>
                        <span className="rounded-full border border-slate-400/35 bg-white/70 px-2 py-0.5 text-[10px] uppercase dark:bg-slate-900/70">
                          {station.status}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-700 dark:text-slate-300">{station.focus}</p>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          <section className="bridge-cel-panel bridge-cel-outline rounded-2xl p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-700/80 dark:text-cyan-200/80">Comms</p>
                <h2 className="text-lg font-semibold">{selectedStation?.callsign || "No station selected"}</h2>
              </div>
              {isThreadLoading && <Loader2 className="h-4 w-4 animate-spin text-cyan-700 dark:text-cyan-200" />}
            </div>

            <div className="mb-3 h-[360px] space-y-2 overflow-y-auto rounded-xl border border-slate-400/30 bg-white/80 p-3 dark:bg-slate-950/70">
              {!selectedStation && (
                <div className="rounded-lg border border-dashed border-slate-400/40 px-3 py-4 text-sm text-slate-600 dark:text-slate-300">
                  Select a station to open comms.
                </div>
              )}

              {selectedStation && threadMessages.length === 0 && !isThreadLoading && (
                <div className="rounded-lg border border-dashed border-cyan-300/35 bg-cyan-500/10 px-3 py-4 text-sm text-cyan-700 dark:text-cyan-100">
                  Channel idle. Send first directive to {selectedStation.callsign}.
                </div>
              )}

              {threadMessages.map((message) => {
                const isUser = message.type === "user_input"
                const isError = message.type === "error"
                return (
                  <article
                    key={message.id}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      isUser
                        ? "border-cyan-300/35 bg-cyan-500/12 text-cyan-800 dark:text-cyan-50"
                        : isError
                          ? "border-rose-300/35 bg-rose-500/10 text-rose-700 dark:text-rose-100"
                          : "border-slate-400/30 bg-white/85 text-slate-900 dark:bg-slate-900/70 dark:text-slate-100"
                    } ${message.pending ? "opacity-70" : ""}`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.14em] text-slate-600 dark:text-slate-300">
                      <span>{isUser ? operatorLabel : message.bridgePrimaryAgent || selectedStation?.callsign || "Bridge"}</span>
                      <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                  </article>
                )
              })}
            </div>

            <form onSubmit={handleSend} className="space-y-2">
              <textarea
                value={composer}
                onChange={(event) => setComposer(event.target.value)}
                rows={3}
                placeholder={selectedStation ? `Send directive to ${selectedStation.callsign}...` : "Select a station first"}
                disabled={!selectedStation || isSending}
                className="w-full resize-none rounded-xl border border-slate-400/35 bg-white/80 px-3 py-2.5 text-sm placeholder:text-slate-400 focus:border-cyan-300/45 focus:outline-none dark:bg-slate-950/70"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600 dark:text-slate-300">Response mode: lead + support relays</span>
                <button
                  type="submit"
                  disabled={!selectedStation || !composer.trim() || isSending}
                  className="inline-flex items-center gap-2 rounded-lg border border-cyan-300/40 bg-cyan-500/15 px-3 py-2 text-sm text-cyan-700 transition hover:bg-cyan-500/25 disabled:opacity-60 dark:text-cyan-100"
                >
                  {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Dispatch
                </button>
              </div>
            </form>

            <div className="mt-4 rounded-xl border border-slate-400/30 bg-white/75 p-3 dark:bg-slate-950/60">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-700/80 dark:text-cyan-200/80">
                  External Patch Through
                </p>
                <Link
                  href={`/bridge-connections${selectedShipDeploymentId ? `?shipDeploymentId=${selectedShipDeploymentId}` : ""}`}
                  className="inline-flex items-center gap-1 text-xs text-cyan-700 hover:text-cyan-600 dark:text-cyan-200"
                >
                  Manage connections
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <form onSubmit={handlePatchThrough} className="space-y-2">
                <div className="space-y-2 rounded-xl border border-slate-300/70 bg-white/80 p-2 dark:border-white/12 dark:bg-slate-900/70">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-slate-600 dark:text-slate-300">
                    Runtime Rail
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {runtimeDescriptors.map((runtime) => {
                      const selected = runtime.id === selectedRuntimeId
                      return (
                        <button
                          key={runtime.id}
                          type="button"
                          onClick={() => setSelectedRuntimeId(runtime.id)}
                          className={`rounded-lg border px-3 py-2 text-left transition ${
                            selected
                              ? "border-emerald-300/45 bg-emerald-500/14"
                              : "border-slate-300/70 bg-white/80 hover:border-cyan-300/35 dark:border-white/12 dark:bg-slate-900/65"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium">{runtime.label}</span>
                            <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-300">
                              {runtime.status}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{runtime.description}</p>
                        </button>
                      )
                    })}
                  </div>
                  {selectedRuntimeId === "openclaw" && (
                    <div className="rounded-lg border border-slate-300/70 bg-white/80 px-3 py-2 dark:border-white/12 dark:bg-slate-900/70">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          Patch through full OpenClaw UI for the selected station source agent.
                        </p>
                        <button
                          type="button"
                          disabled={!selectedOpenClawRuntimeInstance?.href}
                          onClick={() => setShowRuntimeIframe((current) => !current)}
                          className="inline-flex items-center gap-1 rounded-md border border-cyan-300/45 bg-cyan-500/12 px-2 py-1 text-xs text-cyan-700 transition hover:bg-cyan-500/22 disabled:opacity-50 dark:text-cyan-100"
                        >
                          {showRuntimeIframe ? "Hide iframe" : "Open full UI"}
                        </button>
                      </div>
                      {!selectedOpenClawRuntimeInstance?.href && (
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-200">
                          Configure station-specific runtime URLs (`OPENCLAW_UI_URLS` or template envs) to enable iframe patch-through.
                        </p>
                      )}
                      {selectedOpenClawRuntimeInstance && (
                        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-300">
                          Active station: {selectedOpenClawRuntimeInstance.callsign} ({selectedOpenClawRuntimeInstance.stationKey.toUpperCase()})
                        </p>
                      )}
                      {showRuntimeIframe && selectedOpenClawRuntimeInstance?.href && (
                        <div className="mt-2 overflow-hidden rounded-lg border border-slate-300/70 bg-white dark:border-white/12 dark:bg-slate-900/70">
                          <iframe
                            src={selectedOpenClawRuntimeInstance.href}
                            title={selectedOpenClawRuntimeInstance.label}
                            className="h-[420px] w-full bg-white"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <textarea
                  value={patchComposer}
                  onChange={(event) => setPatchComposer(event.target.value)}
                  rows={2}
                  placeholder="Relay outbound status/update to Telegram, Discord, and WhatsApp..."
                  disabled={!selectedShipDeploymentId || isPatchingThrough}
                  className="w-full resize-none rounded-xl border border-slate-400/35 bg-white/90 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-cyan-300/45 focus:outline-none dark:bg-slate-900/70"
                />
                {connectionOptions.filter((connection) => connection.enabled).length > 0 && (
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {connectionOptions
                      .filter((connection) => connection.enabled)
                      .map((connection) => (
                        <label
                          key={connection.id}
                          className="inline-flex items-center gap-2 rounded-md border border-slate-300/70 bg-white/70 px-2 py-1 text-xs text-slate-700 dark:border-white/15 dark:bg-slate-900/60 dark:text-slate-200"
                        >
                          <input
                            type="checkbox"
                            checked={selectedConnectionIds.includes(connection.id)}
                            onChange={(event) =>
                              setSelectedConnectionIds((current) =>
                                event.target.checked
                                  ? [...new Set([...current, connection.id])]
                                  : current.filter((entry) => entry !== connection.id),
                              )
                            }
                          />
                          <span>
                            {connection.name} ({connection.provider})
                          </span>
                        </label>
                      ))}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 text-xs text-slate-600 dark:text-slate-300">
                    <p>
                      Source agent = {selectedStation?.callsign || "none selected"} · Runtime ={" "}
                      {selectedRuntimeDescriptor?.label || "OpenClaw Gateway"}
                    </p>
                    <p>
                      {selectedConnectionIds.length > 0
                        ? `Targeting ${selectedConnectionIds.length} selected connector(s).`
                        : "No connector selected: sends to all enabled connectors."}
                    </p>
                  </div>
                  <button
                    type="submit"
                    disabled={!selectedShipDeploymentId || !patchComposer.trim() || isPatchingThrough}
                    className="inline-flex items-center gap-2 rounded-lg border border-emerald-300/40 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-700 transition hover:bg-emerald-500/25 disabled:opacity-60 dark:text-emerald-100"
                  >
                    {isPatchingThrough ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                    Patch Through
                  </button>
                </div>
              </form>
            </div>
          </section>
        </div>

        <section className="grid gap-4 xl:grid-cols-2">
          <details className="bridge-cel-panel bridge-cel-outline rounded-2xl p-3" open={false}>
            <summary className="flex cursor-pointer list-none items-center justify-between text-base font-semibold">
              Task Queue
              <ChevronDown className="h-4 w-4 text-slate-500" />
            </summary>
            <div className="mt-3 space-y-2">
              {workItems.length === 0 && (
                <p className="text-sm text-slate-600 dark:text-slate-300">No queued tasks.</p>
              )}
              {workItems.slice(0, 8).map((item) => (
                <article key={item.id} className="rounded-lg border border-slate-400/30 bg-white/75 px-3 py-2 text-sm dark:bg-slate-900/65">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{item.name}</p>
                    <span className="text-xs uppercase text-slate-600 dark:text-slate-300">{item.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">ETA {item.eta}</p>
                </article>
              ))}
            </div>
          </details>

          <details className="bridge-cel-panel bridge-cel-outline rounded-2xl p-3" open={false}>
            <summary className="flex cursor-pointer list-none items-center justify-between text-base font-semibold">
              Systems Health
              <ChevronDown className="h-4 w-4 text-slate-500" />
            </summary>
            <div className="mt-3 space-y-2">
              {systems.map((system, index) => (
                <article key={`${system.label}-${index}`} className="rounded-lg border border-slate-400/30 bg-white/75 px-3 py-2 text-sm dark:bg-slate-900/65">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{system.label}</p>
                    <div className="flex items-center gap-2">
                      {system.href && (
                        <button
                          type="button"
                          onClick={() =>
                            setMonitoringFrame({
                              title: system.label,
                              href: system.href as string,
                            })
                          }
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-cyan-700 hover:text-cyan-600 dark:text-cyan-200"
                        >
                          Open dashboard
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {!system.href && system.service && (
                        <Link
                          href={
                            selectedShipDeploymentId
                              ? `/ship-yard?shipDeploymentId=${selectedShipDeploymentId}`
                              : "/ship-yard"
                          }
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 hover:text-amber-600 dark:text-amber-200"
                        >
                          Configure URL
                        </Link>
                      )}
                      <span className="text-xs uppercase text-slate-600 dark:text-slate-300">{system.state}</span>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{system.detail}</p>
                  {(system.service || system.source === "forwarded" || system.observedAt) && (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                      {system.source && <span>{system.source}</span>}
                      {system.observedAt && <span>{new Date(system.observedAt).toLocaleTimeString()}</span>}
                    </div>
                  )}
                </article>
              ))}

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-cyan-300/35 bg-cyan-500/12 px-2 py-2 text-center text-xs text-cyan-700 dark:text-cyan-100">
                  <Signal className="mx-auto mb-1 h-3.5 w-3.5" />
                  Live {missionStats.active}
                </div>
                <div className="rounded-lg border border-emerald-300/35 bg-emerald-500/12 px-2 py-2 text-center text-xs text-emerald-700 dark:text-emerald-100">
                  <CheckCircle2 className="mx-auto mb-1 h-3.5 w-3.5" />
                  Cleared {missionStats.completed}
                </div>
                <div className="rounded-lg border border-amber-300/35 bg-amber-500/12 px-2 py-2 text-center text-xs text-amber-700 dark:text-amber-100">
                  <Bot className="mx-auto mb-1 h-3.5 w-3.5" />
                  Blocked {missionStats.failed}
                </div>
              </div>
            </div>
          </details>
        </section>
      </div>
    </main>
  )
}
