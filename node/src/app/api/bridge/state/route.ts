import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import {
  applyForwardedBridgeStationEvents,
  buildCanonicalBridgeStations,
  type BridgeStationKey,
} from "@/lib/bridge/stations"
import {
  resolveOpenClawRuntimeUiStations,
  resolveShipNamespace,
  type OpenClawRuntimeUrlSource,
} from "@/lib/bridge/openclaw-runtime"
import { readShipMonitoringConfig } from "@/lib/shipyard/monitoring"

export const dynamic = "force-dynamic"

const MONITORING_STALE_WINDOW_MS = 15 * 60 * 1000

type BridgeSystemState = "nominal" | "warning" | "critical"
type MonitoringEventServiceKey = "grafana" | "prometheus"
type MonitoringServiceKey = MonitoringEventServiceKey | "kubeview" | "langfuse"
type MonitoringSystemSource = "ship-monitoring" | "forwarded"

interface BridgeStateSessionUser {
  id: string
}

interface BridgeStateAvailableShipRecord {
  id: string
  name: string
  status: "pending" | "deploying" | "active" | "inactive" | "failed" | "updating"
  updatedAt: Date
  nodeId: string
  nodeType: "local" | "cloud" | "hybrid"
  deploymentProfile: "local_starship_build" | "cloud_shipyard"
}

interface BridgeStateSelectedShipMonitoringRecord {
  id: string
  status: "pending" | "deploying" | "active" | "inactive" | "failed" | "updating"
  deploymentProfile: "local_starship_build" | "cloud_shipyard"
  config: unknown
}

interface BridgeStateCrewRecord {
  id: string
  role: string
  callsign: string | null
  name: string
  description: string | null
}

interface BridgeStateTaskRecord {
  id: string
  name: string
  status: string
  completedAt: Date | null
}

interface BridgeStateForwardingSourceNode {
  nodeId: string
  name: string | null
}

interface BridgeStateForwardingEventRecord {
  id: string
  payload: unknown
  occurredAt: Date
  sourceNode: BridgeStateForwardingSourceNode
}

interface BridgeStateMonitoringCard {
  label: string
  service: MonitoringServiceKey
  state: BridgeSystemState
  detail: string
  href: string | null
  source: MonitoringSystemSource
  observedAt: string | null
}

interface BridgeStateRuntimeUiCard {
  label: string
  href: string | null
  source: OpenClawRuntimeUrlSource
  instances: BridgeStateRuntimeUiInstance[]
}

interface BridgeStateRuntimeUiInstance {
  stationKey: BridgeStationKey
  callsign: string
  label: string
  href: string | null
  source: OpenClawRuntimeUrlSource
}

interface BridgeStateRouteDeps {
  getSessionUser: () => Promise<BridgeStateSessionUser | null>
  listAvailableShips: (userId: string) => Promise<BridgeStateAvailableShipRecord[]>
  findSelectedShipMonitoring: (args: {
    userId: string
    shipDeploymentId: string
  }) => Promise<BridgeStateSelectedShipMonitoringRecord | null>
  listBridgeCrew: (shipDeploymentId: string) => Promise<BridgeStateCrewRecord[]>
  listTasks: (userId: string) => Promise<BridgeStateTaskRecord[]>
  listForwardedBridgeEvents: () => Promise<BridgeStateForwardingEventRecord[]>
  listForwardedSystemEvents: () => Promise<BridgeStateForwardingEventRecord[]>
  now: () => Date
}

const defaultDeps: BridgeStateRouteDeps = {
  getSessionUser: async () => {
    const session = await auth.api.getSession({ headers: await headers() })
    return session?.user ? { id: session.user.id } : null
  },
  listAvailableShips: async (userId) =>
    prisma.agentDeployment.findMany({
      where: {
        userId,
        deploymentType: "ship",
      },
      select: {
        id: true,
        name: true,
        status: true,
        updatedAt: true,
        nodeId: true,
        nodeType: true,
        deploymentProfile: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
    }),
  findSelectedShipMonitoring: async ({ userId, shipDeploymentId }) =>
    prisma.agentDeployment.findFirst({
      where: {
        id: shipDeploymentId,
        userId,
        deploymentType: "ship",
      },
      select: {
        id: true,
        status: true,
        deploymentProfile: true,
        config: true,
      },
    }),
  listBridgeCrew: async (shipDeploymentId) =>
    prisma.bridgeCrew.findMany({
      where: {
        deploymentId: shipDeploymentId,
        status: "active",
      },
      orderBy: {
        role: "asc",
      },
    }),
  listTasks: async (userId) =>
    prisma.task.findMany({
      where: {
        session: {
          userId,
        },
      },
      orderBy: {
        startedAt: "desc",
      },
      take: 36,
    }),
  listForwardedBridgeEvents: async () =>
    prisma.forwardingEvent.findMany({
      where: {
        eventType: "bridge_station",
      },
      include: {
        sourceNode: true,
      },
      orderBy: {
        occurredAt: "desc",
      },
      take: 24,
    }),
  listForwardedSystemEvents: async () =>
    prisma.forwardingEvent.findMany({
      where: {
        eventType: "system_status",
      },
      include: {
        sourceNode: true,
      },
      orderBy: {
        occurredAt: "desc",
      },
      take: 24,
    }),
  now: () => new Date(),
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function mapTaskStatus(status?: string) {
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

function parseSystemState(value: unknown): BridgeSystemState | null {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim().toLowerCase()
  if (normalized.length === 0) {
    return null
  }

  if (
    normalized === "nominal"
    || normalized === "ok"
    || normalized === "healthy"
    || normalized === "online"
    || normalized === "up"
    || normalized === "pass"
    || normalized === "running"
    || normalized === "success"
  ) {
    return "nominal"
  }

  if (
    normalized === "warning"
    || normalized === "warn"
    || normalized === "elevated"
    || normalized === "degraded"
    || normalized === "partial"
    || normalized === "unstable"
  ) {
    return "warning"
  }

  if (
    normalized === "critical"
    || normalized === "failed"
    || normalized === "failure"
    || normalized === "error"
    || normalized === "down"
    || normalized === "offline"
    || normalized === "unhealthy"
  ) {
    return "critical"
  }

  return null
}

function normalizeSystemState(value: unknown): BridgeSystemState {
  const parsed = parseSystemState(value)
  return parsed || "warning"
}

function openClawRuntimeUiProxyHref(args: {
  stationKey: BridgeStationKey
  shipDeploymentId: string | null
}): string {
  const query = new URLSearchParams()
  if (args.shipDeploymentId) {
    query.set("shipDeploymentId", args.shipDeploymentId)
  }

  const basePath = `/api/bridge/runtime-ui/openclaw/${args.stationKey}`
  return query.size > 0 ? `${basePath}?${query.toString()}` : basePath
}

function resolveOpenClawRuntimeUiCard(args: {
  namespace: string | null
  callsigns: Partial<Record<BridgeStationKey, string>>
  shipDeploymentId: string | null
}): BridgeStateRuntimeUiCard {
  const stations = resolveOpenClawRuntimeUiStations({
    namespace: args.namespace,
    callsigns: args.callsigns,
  })

  const instances = stations.map((station) => ({
    stationKey: station.stationKey,
    callsign: station.callsign,
    label: station.label,
    href: station.href
      ? openClawRuntimeUiProxyHref({
          stationKey: station.stationKey,
          shipDeploymentId: args.shipDeploymentId,
        })
      : null,
    source: station.source,
  }))

  const preferred = instances.find((entry) => entry.href) || instances[0]
  return {
    label: "OpenClaw Runtime UI",
    href: preferred?.href || null,
    source: preferred?.source || "unconfigured",
    instances,
  }
}

function parseMonitoringService(value: unknown): MonitoringEventServiceKey | null {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim().toLowerCase()
  if (normalized.includes("graf")) {
    return "grafana"
  }
  if (normalized.includes("prom")) {
    return "prometheus"
  }

  return null
}

function parseMonitoringServiceFromPayload(
  payload: Record<string, unknown>,
): MonitoringEventServiceKey | null {
  return (
    parseMonitoringService(payload.service)
    || parseMonitoringService(payload.component)
    || parseMonitoringService(payload.label)
    || parseMonitoringService(payload.system)
  )
}

function isEventFresh(occurredAt: Date, now: Date): boolean {
  return now.getTime() - occurredAt.getTime() <= MONITORING_STALE_WINDOW_MS
}

function staleDetail(label: string, observedAt: string): string {
  return `${label} telemetry is stale (last observed ${observedAt}).`
}

function matchShipScopedEvent(
  payload: Record<string, unknown>,
  selectedShipDeploymentId: string | null,
): boolean {
  const eventShipDeploymentId = asString(payload.shipDeploymentId) || asString(payload.deploymentId)
  if (!eventShipDeploymentId) {
    return true
  }

  return Boolean(selectedShipDeploymentId && eventShipDeploymentId === selectedShipDeploymentId)
}

function buildFallbackMonitoringCard(args: {
  label: string
  service: MonitoringEventServiceKey
  href: string | null
  selectedShip: BridgeStateSelectedShipMonitoringRecord | null
}): BridgeStateMonitoringCard {
  if (!args.selectedShip) {
    return {
      label: args.label,
      service: args.service,
      state: "warning",
      detail: "Select an active ship to resolve monitoring telemetry.",
      href: args.href,
      source: "ship-monitoring",
      observedAt: null,
    }
  }

  if (!args.href) {
    return {
      label: args.label,
      service: args.service,
      state: "warning",
      detail: `Set ${args.label} URL in Ship Yard monitoring settings.`,
      href: null,
      source: "ship-monitoring",
      observedAt: null,
    }
  }

  if (args.selectedShip.status === "failed") {
    return {
      label: args.label,
      service: args.service,
      state: "critical",
      detail: `Ship status is failed; investigate ${args.label} and bridge runtime.`,
      href: args.href,
      source: "ship-monitoring",
      observedAt: null,
    }
  }

  return {
    label: args.label,
    service: args.service,
    state: "warning",
    detail: `No recent ${args.label} telemetry in the last 15m.`,
    href: args.href,
    source: "ship-monitoring",
    observedAt: null,
  }
}

function buildKubeviewMonitoringCard(args: {
  href: string | null
  selectedShip: BridgeStateSelectedShipMonitoringRecord | null
}): BridgeStateMonitoringCard {
  if (!args.selectedShip) {
    return {
      label: "KubeView",
      service: "kubeview",
      state: "warning",
      detail: "Select an active ship to resolve monitoring telemetry.",
      href: args.href,
      source: "ship-monitoring",
      observedAt: null,
    }
  }

  const proxyHref = (() => {
    const query = new URLSearchParams()
    query.set("shipDeploymentId", args.selectedShip.id)
    return `/api/bridge/runtime-ui/kubeview?${query.toString()}`
  })()

  const isLoopbackOrLocalhostMonitoringUrl = (value: string): boolean => {
    if (value.startsWith("/")) {
      return false
    }
    try {
      const parsed = new URL(value)
      const hostname = parsed.hostname.trim().toLowerCase()
      return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith(".localhost")
    } catch {
      return false
    }
  }

  const resolvedHref =
    args.href && !isLoopbackOrLocalhostMonitoringUrl(args.href)
      ? args.href
      : proxyHref

  if (args.selectedShip.status === "failed") {
    return {
      label: "KubeView",
      service: "kubeview",
      state: "critical",
      detail: "Ship status is failed; investigate KubeView and bridge runtime.",
      href: resolvedHref,
      source: "ship-monitoring",
      observedAt: null,
    }
  }

  return {
    label: "KubeView",
    service: "kubeview",
    state: "nominal",
    detail:
      resolvedHref === proxyHref
        ? "KubeView available via bridge proxy for selected ship."
        : "KubeView link configured for selected ship.",
    href: resolvedHref,
    source: "ship-monitoring",
    observedAt: null,
  }
}

function resolveLangfuseUpstreamBaseUrl(): string | null {
  const raw = asString(process.env.LANGFUSE_BASE_URL)
  if (!raw) {
    return null
  }

  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null
    }
    return parsed.toString().replace(/\/+$/u, "")
  } catch {
    return null
  }
}

function buildLangfuseMonitoringCard(args: {
  href: string | null
  selectedShip: BridgeStateSelectedShipMonitoringRecord | null
}): BridgeStateMonitoringCard {
  const upstreamBaseUrl = resolveLangfuseUpstreamBaseUrl()
  const proxyHref = "/api/bridge/runtime-ui/langfuse"
  const configuredHref = args.href

  const wantsProxy =
    !configuredHref || configuredHref === proxyHref || configuredHref.startsWith(`${proxyHref}/`)
  const resolvedHref = wantsProxy
    ? upstreamBaseUrl
      ? configuredHref || proxyHref
      : null
    : configuredHref

  if (args.selectedShip?.status === "failed") {
    return {
      label: "Langfuse",
      service: "langfuse",
      state: "critical",
      detail: "Ship status is failed; investigate Langfuse and bridge runtime.",
      href: resolvedHref,
      source: "ship-monitoring",
      observedAt: null,
    }
  }

  return {
    label: "Langfuse",
    service: "langfuse",
    state: resolvedHref ? "nominal" : "warning",
    detail: resolvedHref
      ? wantsProxy
        ? "Langfuse available via bridge proxy."
        : "Langfuse link configured for selected ship."
      : "Langfuse upstream is not configured. Set LANGFUSE_BASE_URL to enable patch-through.",
    href: resolvedHref,
    source: "ship-monitoring",
    observedAt: null,
  }
}

function resolveMonitoringCards(args: {
  selectedShip: BridgeStateSelectedShipMonitoringRecord | null
  forwardedSystemEvents: BridgeStateForwardingEventRecord[]
  now: Date
}): {
  grafana: BridgeStateMonitoringCard
  prometheus: BridgeStateMonitoringCard
} {
  const monitoringConfig = readShipMonitoringConfig(args.selectedShip?.config || {})
  const selectedShipDeploymentId = args.selectedShip?.id || null

  const latestByService: Partial<Record<MonitoringEventServiceKey, BridgeStateForwardingEventRecord>> = {}
  for (const event of args.forwardedSystemEvents) {
    const payload = asRecord(event.payload)
    const service = parseMonitoringServiceFromPayload(payload)
    if (!service) {
      continue
    }

    if (!matchShipScopedEvent(payload, selectedShipDeploymentId)) {
      continue
    }

    if (!latestByService[service]) {
      latestByService[service] = event
    }
  }

  const buildCard = (service: MonitoringEventServiceKey): BridgeStateMonitoringCard => {
    const label = service === "grafana" ? "Grafana" : "Prometheus"
    const href = service === "grafana" ? monitoringConfig.grafanaUrl : monitoringConfig.prometheusUrl
    const fallback = buildFallbackMonitoringCard({
      label,
      service,
      href,
      selectedShip: args.selectedShip,
    })

    const latest = latestByService[service]
    if (!latest || !href) {
      return fallback
    }

    const payload = asRecord(latest.payload)
    const observedAt = latest.occurredAt.toISOString()
    if (!isEventFresh(latest.occurredAt, args.now)) {
      return {
        ...fallback,
        source: "forwarded",
        observedAt,
        state: "warning",
        detail: staleDetail(label, observedAt),
      }
    }

    return {
      ...fallback,
      source: "forwarded",
      observedAt,
      state: normalizeSystemState(payload.state ?? payload.status),
      detail:
        asString(payload.detail)
        || asString(payload.message)
        || `Forwarded from ${latest.sourceNode.name || latest.sourceNode.nodeId}`,
    }
  }

  return {
    grafana: buildCard("grafana"),
    prometheus: buildCard("prometheus"),
  }
}

export async function handleGetBridgeState(
  request: NextRequest,
  deps: BridgeStateRouteDeps = defaultDeps,
) {
  try {
    const sessionUser = await deps.getSessionUser()
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const includeForwarded = request.nextUrl.searchParams.get("includeForwarded") === "true"
    const requestedShipDeploymentId = asString(request.nextUrl.searchParams.get("shipDeploymentId"))

    const availableShips = await deps.listAvailableShips(sessionUser.id)
    const requestedShip = requestedShipDeploymentId
      ? availableShips.find((ship) => ship.id === requestedShipDeploymentId)
      : null
    const selectedShip = requestedShip
      || availableShips.find((ship) => ship.status === "active")
      || availableShips[0]
      || null

    const [selectedShipMonitoring, bridgeCrew, tasks, forwardedBridgeEvents, forwardedSystemEvents] =
      await Promise.all([
        selectedShip
          ? deps.findSelectedShipMonitoring({
              userId: sessionUser.id,
              shipDeploymentId: selectedShip.id,
            })
          : Promise.resolve(null),
        selectedShip ? deps.listBridgeCrew(selectedShip.id) : Promise.resolve([]),
        deps.listTasks(sessionUser.id),
        includeForwarded ? deps.listForwardedBridgeEvents() : Promise.resolve([]),
        includeForwarded ? deps.listForwardedSystemEvents() : Promise.resolve([]),
      ])

    const stationBase = buildCanonicalBridgeStations(
      bridgeCrew.map((crewMember) => ({
        id: crewMember.id,
        role: crewMember.role,
        callsign: crewMember.callsign,
        name: crewMember.name,
        description: crewMember.description,
      })),
    )

    const workItems = tasks.map((task, index) => {
      const station = stationBase[index % Math.max(stationBase.length, 1)]
      const status = mapTaskStatus(task.status)
      const eta = task.completedAt
        ? "Complete"
        : status === "failed"
          ? "Review"
          : `T+${(index + 1) * 3}m`

      return {
        id: task.id,
        name: task.name,
        status,
        eta,
        assignedTo: station?.id || "",
      }
    })

    let stationsWithQueue = stationBase.map((station) => {
      const queue = workItems
        .filter((item) => item.assignedTo === station.id)
        .map((item) => item.name)

      return {
        ...station,
        queue,
        focus: queue[0] || station.focus,
      }
    })

    const systems: Array<{
      label: string
      state: BridgeSystemState
      detail: string
      source?: "core" | "ship-monitoring" | "forwarded"
      service?: MonitoringServiceKey
      href?: string | null
      observedAt?: string | null
    }> = [
      {
        label: "Comms Array",
        state: "warning",
        detail: "Bridge telemetry partial",
        source: "core",
      },
      {
        label: "Sensor Grid",
        state: "nominal",
        detail: "Live feed stable",
        source: "core",
      },
      {
        label: "Core Systems",
        state: "nominal",
        detail: "Operational",
        source: "core",
      },
    ]

    const monitoring = resolveMonitoringCards({
      selectedShip: selectedShipMonitoring,
      forwardedSystemEvents,
      now: deps.now(),
    })
    const selectedShipMonitoringConfig = readShipMonitoringConfig(selectedShipMonitoring?.config || {})
    const kubeviewMonitoring = buildKubeviewMonitoringCard({
      href: selectedShipMonitoringConfig.kubeviewUrl,
      selectedShip: selectedShipMonitoring,
    })
    const langfuseMonitoring = buildLangfuseMonitoringCard({
      href: selectedShipMonitoringConfig.langfuseUrl,
      selectedShip: selectedShipMonitoring,
    })

    systems.push(monitoring.prometheus)
    systems.push(monitoring.grafana)

    const selectedShipId = selectedShip?.id || null
    for (const event of forwardedSystemEvents) {
      const payload = asRecord(event.payload)
      if (!matchShipScopedEvent(payload, selectedShipId)) {
        continue
      }

      if (parseMonitoringServiceFromPayload(payload)) {
        continue
      }

      systems.push({
        label: asString(payload.label) || `${event.sourceNode.name || event.sourceNode.nodeId} system`,
        state: normalizeSystemState(payload.state ?? payload.status),
        detail:
          asString(payload.detail)
          || asString(payload.message)
          || `Forwarded from ${event.sourceNode.nodeId}`,
        source: "forwarded",
        observedAt: event.occurredAt.toISOString(),
      })
    }

    if (includeForwarded) {
      stationsWithQueue = applyForwardedBridgeStationEvents(stationsWithQueue, forwardedBridgeEvents)
    }

    const stationCallsigns = stationsWithQueue.reduce<Partial<Record<BridgeStationKey, string>>>((acc, station) => {
      acc[station.stationKey] = station.callsign
      return acc
    }, {})
    const runtimeNamespace = resolveShipNamespace(
      selectedShipMonitoring?.config || {},
      selectedShipMonitoring?.deploymentProfile || selectedShip?.deploymentProfile || null,
    )
    const runtimeUi = {
      openclaw: resolveOpenClawRuntimeUiCard({
        namespace: runtimeNamespace,
        callsigns: stationCallsigns,
        shipDeploymentId: selectedShip?.id || null,
      }),
    }

    return NextResponse.json({
      stations: stationsWithQueue,
      workItems,
      systems,
      monitoring: {
        ...monitoring,
        kubeview: kubeviewMonitoring,
        langfuse: langfuseMonitoring,
      },
      runtimeUi,
      selectedShipDeploymentId: selectedShip?.id || null,
      availableShips: availableShips.map((ship) => ({
        id: ship.id,
        name: ship.name,
        status: ship.status,
        updatedAt: ship.updatedAt,
        nodeId: ship.nodeId,
        nodeType: ship.nodeType,
        deploymentProfile: ship.deploymentProfile,
      })),
    })
  } catch (error) {
    console.error("Error loading bridge state:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
      },
      { status: 500 },
    )
  }
}

export async function GET(request: NextRequest) {
  return handleGetBridgeState(request)
}
