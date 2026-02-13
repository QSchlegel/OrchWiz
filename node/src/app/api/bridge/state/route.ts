import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import { existsSync } from "node:fs"
import { resolve as resolvePath } from "node:path"
import {
  applyForwardedBridgeStationEvents,
  buildCanonicalBridgeStations,
  getBridgeStationTemplates,
  type BridgeStationKey,
} from "@/lib/bridge/stations"
import {
  type OpenClawRuntimeUrlSource,
} from "@/lib/bridge/openclaw-runtime"
import { readShipMonitoringConfig } from "@/lib/shipyard/monitoring"
import { normalizeInfrastructureInConfig } from "@/lib/deployment/profile"
import { resolveRuntimeUiFromTerraform } from "@/lib/bridge/runtime-ui-hydration"

export const dynamic = "force-dynamic"

const MONITORING_STALE_WINDOW_MS = 15 * 60 * 1000
const RUNTIME_UI_HYDRATION_COOLDOWN_MS = 30 * 1000

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
  metadata: unknown
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
  maybeHydrateSelectedShipRuntimeUi: (args: {
    userId: string
    selectedShip: BridgeStateSelectedShipMonitoringRecord
  }) => Promise<BridgeStateSelectedShipMonitoringRecord>
  listBridgeCrew: (shipDeploymentId: string) => Promise<BridgeStateCrewRecord[]>
  listTasks: (userId: string) => Promise<BridgeStateTaskRecord[]>
  listForwardedBridgeEvents: () => Promise<BridgeStateForwardingEventRecord[]>
  listForwardedSystemEvents: () => Promise<BridgeStateForwardingEventRecord[]>
  now: () => Date
}

type RuntimeUiHydrationState = {
  inFlight: Map<string, Promise<BridgeStateSelectedShipMonitoringRecord>>
  lastAttemptAt: Map<string, number>
}

function runtimeUiHydrationState(): RuntimeUiHydrationState {
  const globalRef = globalThis as unknown as { __owzRuntimeUiHydrationState?: RuntimeUiHydrationState }
  if (!globalRef.__owzRuntimeUiHydrationState) {
    globalRef.__owzRuntimeUiHydrationState = {
      inFlight: new Map(),
      lastAttemptAt: new Map(),
    }
  }
  return globalRef.__owzRuntimeUiHydrationState
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
        metadata: true,
      },
    }),
  maybeHydrateSelectedShipRuntimeUi: async ({ userId, selectedShip }) => {
    if (selectedShip.deploymentProfile !== "local_starship_build") {
      return selectedShip
    }

    const metadata = asRecord(selectedShip.metadata)
    const runtimeUi = asRecord(metadata.runtimeUi)
    if (!runtimeUiNeedsHydration(runtimeUi)) {
      return selectedShip
    }

    const state = runtimeUiHydrationState()
    const lastAttempt = state.lastAttemptAt.get(selectedShip.id) || 0
    const now = Date.now()
    if (now - lastAttempt <= RUNTIME_UI_HYDRATION_COOLDOWN_MS) {
      return selectedShip
    }

    const existingInFlight = state.inFlight.get(selectedShip.id)
    if (existingInFlight) {
      return existingInFlight
    }

    const inFlight = (async () => {
      state.lastAttemptAt.set(selectedShip.id, Date.now())

      const repoRoot = resolveRepoRoot()
      const { infrastructure } = normalizeInfrastructureInConfig(
        selectedShip.deploymentProfile,
        selectedShip.config || {},
      )

      const resolution = await resolveRuntimeUiFromTerraform({
        repoRoot,
        terraformEnvDir: infrastructure.terraformEnvDir,
        allowCommandExecution: process.env.ENABLE_LOCAL_COMMAND_EXECUTION === "true",
      })
      if (!resolution) {
        return selectedShip
      }

      const nextRuntimeUi = mergeRuntimeUiMetadata(runtimeUi, resolution.runtimeUi)
      const nextMetadata = {
        ...metadata,
        runtimeUi: nextRuntimeUi,
      }

      try {
        await prisma.agentDeployment.updateMany({
          where: {
            id: selectedShip.id,
            userId,
            deploymentType: "ship",
          },
          data: {
            metadata: nextMetadata as unknown as Prisma.InputJsonValue,
          },
        })
      } catch {
        // Best effort: if this fails (race, DB unavailable), still return hydrated payload.
      }

      return {
        ...selectedShip,
        metadata: nextMetadata,
      }
    })().finally(() => {
      runtimeUiHydrationState().inFlight.delete(selectedShip.id)
    })

    state.inFlight.set(selectedShip.id, inFlight)
    return inFlight
  },
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

function resolvePublicHostname(request: NextRequest): string | null {
  const forwardedHost = asString(request.headers.get("x-forwarded-host"))
  const host = forwardedHost || asString(request.headers.get("host")) || request.nextUrl.host
  const first = host.split(",")[0]?.trim() || ""
  if (!first) return null
  return first.split(":")[0]?.trim().toLowerCase() || null
}

function isLoopbackHostname(value: string): boolean {
  const hostname = value.trim().toLowerCase()
  return (
    hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "::1"
    || hostname.endsWith(".localhost")
  )
}

function rewriteLoopbackUrlHostname(url: string | null, desiredHostname: string): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.trim().toLowerCase()
    if (!isLoopbackHostname(hostname)) {
      return url
    }
    parsed.hostname = desiredHostname
    return parsed.toString().replace(/\/+$/u, "")
  } catch {
    return url
  }
}

function rewriteLoopbackStationUrlMap(
  map: Partial<Record<BridgeStationKey, string>>,
  desiredHostname: string,
): Partial<Record<BridgeStationKey, string>> {
  const next: Partial<Record<BridgeStationKey, string>> = {}
  for (const [stationKey, href] of Object.entries(map)) {
    const key = stationKey as BridgeStationKey
    const rewritten = rewriteLoopbackUrlHostname(href, desiredHostname)
    if (rewritten) {
      next[key] = rewritten
    }
  }
  return next
}

function resolveRepoRoot(): string {
  const override = asString(process.env.ORCHWIZ_REPO_ROOT)
  if (override) {
    return resolvePath(override)
  }

  const cwd = process.cwd()
  if (existsSync(resolvePath(cwd, "infra/terraform"))) {
    return cwd
  }

  const parent = resolvePath(cwd, "..")
  if (existsSync(resolvePath(parent, "infra/terraform"))) {
    return parent
  }

  return parent
}

function runtimeUiNeedsHydration(runtimeUi: Record<string, unknown>): boolean {
  const kubeviewUrl = asString(asRecord(asRecord(runtimeUi).kubeview).url)
  const openclawUrls = asRecord(asRecord(asRecord(runtimeUi).openclaw).urls)
  const hasOpenclawUrl = Object.keys(openclawUrls).some((key) => {
    const stationKey = key.trim().toLowerCase()
    return (
      (stationKey === "xo"
        || stationKey === "ops"
        || stationKey === "eng"
        || stationKey === "sec"
        || stationKey === "med"
        || stationKey === "cou")
      && asString(openclawUrls[key]) !== null
    )
  })
  const portForwardCommand = asString(runtimeUi.portForwardCommand)

  return !kubeviewUrl || !hasOpenclawUrl || !portForwardCommand
}

function mergeRuntimeUiMetadata(
  existingRuntimeUi: Record<string, unknown>,
  incoming: {
    openclaw: { urls: Partial<Record<string, string>>; source: string }
    kubeview: { url: string | null; source: string }
    portForwardCommand: string | null
  },
): Record<string, unknown> {
  const existing = asRecord(existingRuntimeUi)

  const existingOpenclaw = asRecord(existing.openclaw)
  const existingOpenclawUrls = asRecord(existingOpenclaw.urls)
  const incomingUrls = asRecord(incoming.openclaw.urls)
  const mergedUrls = {
    ...existingOpenclawUrls,
    ...incomingUrls,
  }

  const existingKubeview = asRecord(existing.kubeview)
  const existingKubeviewUrl = asString(existingKubeview.url)

  return {
    ...existing,
    openclaw: {
      ...existingOpenclaw,
      urls: mergedUrls,
      source: typeof incoming.openclaw.source === "string" ? incoming.openclaw.source : existingOpenclaw.source,
    },
    kubeview: {
      ...existingKubeview,
      url: incoming.kubeview.url || existingKubeviewUrl || null,
      source: typeof incoming.kubeview.source === "string" ? incoming.kubeview.source : existingKubeview.source,
    },
    portForwardCommand: incoming.portForwardCommand || asString(existing.portForwardCommand) || null,
  }
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

function resolveOpenClawRuntimeUiCard(args: {
  callsigns: Partial<Record<BridgeStationKey, string>>
  runtimeUiUrls: Partial<Record<BridgeStationKey, string>>
}): BridgeStateRuntimeUiCard {
  const instances: BridgeStateRuntimeUiInstance[] = getBridgeStationTemplates().map((template) => {
    const callsign = args.callsigns[template.stationKey] || template.callsign
    const directHref = args.runtimeUiUrls[template.stationKey] || null

    return {
      stationKey: template.stationKey,
      callsign,
      label: `${callsign} OpenClaw UI`,
      href: directHref,
      source: directHref ? "runtime_ui_metadata" : "unconfigured",
    }
  })

  const preferred = instances.find((entry) => entry.href) || instances[0]
  return {
    label: "OpenClaw Runtime UI",
    href: preferred?.href || null,
    source: preferred?.source || "unconfigured",
    instances,
  }
}

function parseRuntimeUiOpenclawUrls(value: unknown): Partial<Record<BridgeStationKey, string>> {
  const record = asRecord(value)
  const out: Partial<Record<BridgeStationKey, string>> = {}
  for (const [key, rawHref] of Object.entries(record)) {
    const stationKey = key.trim().toLowerCase()
    if (
      stationKey !== "xo"
      && stationKey !== "ops"
      && stationKey !== "eng"
      && stationKey !== "sec"
      && stationKey !== "med"
      && stationKey !== "cou"
    ) {
      continue
    }

    const href = asString(rawHref)
    if (!href) continue
    out[stationKey] = href
  }
  return out
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
  runtimeUiHref: string | null
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
  const proxyBase = "/api/bridge/runtime-ui/kubeview"

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

  const wantsProxy = (() => {
    const href = args.href
    if (!href) return false
    return (
      href === proxyBase
      || href.startsWith(`${proxyBase}/`)
      || href.startsWith(`${proxyBase}?`)
    )
  })()

  const resolvedHref =
    args.href && !wantsProxy && !isLoopbackOrLocalhostMonitoringUrl(args.href)
      ? args.href
      : args.runtimeUiHref || proxyHref

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
        : args.runtimeUiHref && resolvedHref === args.runtimeUiHref
          ? "KubeView available via direct ship runtime UI."
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
  const configuredIsProxy = (() => {
    if (!configuredHref) return false
    return (
      configuredHref === proxyHref
      || configuredHref.startsWith(`${proxyHref}/`)
      || configuredHref.startsWith(`${proxyHref}?`)
    )
  })()

  // Prefer direct Langfuse links; keep proxy only as a backwards-compatible config value.
  const resolvedHref = configuredHref && !configuredIsProxy
    ? configuredHref
    : upstreamBaseUrl

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
      ? configuredHref && !configuredIsProxy
        ? "Langfuse link configured for selected ship."
        : "Langfuse available via proxy link."
      : configuredIsProxy
        ? "Langfuse proxy is configured, but LANGFUSE_BASE_URL is not set. Set a direct Langfuse URL in Ship Yard or configure LANGFUSE_BASE_URL."
        : "Langfuse link unresolved. Set a Langfuse URL in Ship Yard monitoring settings.",
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

    const hydratedSelectedShipMonitoring =
      selectedShipMonitoring
        ? await deps.maybeHydrateSelectedShipRuntimeUi({
            userId: sessionUser.id,
            selectedShip: selectedShipMonitoring,
          })
        : null

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
      selectedShip: hydratedSelectedShipMonitoring,
      forwardedSystemEvents,
      now: deps.now(),
    })
    const selectedShipMonitoringConfig = readShipMonitoringConfig(hydratedSelectedShipMonitoring?.config || {})
    const selectedShipRuntimeUi = asRecord(asRecord(hydratedSelectedShipMonitoring?.metadata || {}).runtimeUi)
    const selectedShipRuntimeUiKubeview = asRecord(selectedShipRuntimeUi.kubeview)
    const runtimeUiKubeviewHref = asString(selectedShipRuntimeUiKubeview.url)
    const selectedShipRuntimeUiOpenclaw = asRecord(selectedShipRuntimeUi.openclaw)
    const runtimeUiOpenclawUrls = parseRuntimeUiOpenclawUrls(asRecord(selectedShipRuntimeUiOpenclaw.urls))

    const publicHost = resolvePublicHostname(request)
    const wantsLoopbackRewrite = publicHost ? isLoopbackHostname(publicHost) : false
    const rewrittenKubeviewHref =
      wantsLoopbackRewrite && publicHost
        ? rewriteLoopbackUrlHostname(runtimeUiKubeviewHref, publicHost)
        : runtimeUiKubeviewHref
    const rewrittenOpenclawUrls =
      wantsLoopbackRewrite && publicHost
        ? rewriteLoopbackStationUrlMap(runtimeUiOpenclawUrls, publicHost)
        : runtimeUiOpenclawUrls
    const kubeviewMonitoring = buildKubeviewMonitoringCard({
      href: selectedShipMonitoringConfig.kubeviewUrl,
      runtimeUiHref: rewrittenKubeviewHref,
      selectedShip: hydratedSelectedShipMonitoring,
    })
    const langfuseMonitoring = buildLangfuseMonitoringCard({
      href: selectedShipMonitoringConfig.langfuseUrl,
      selectedShip: hydratedSelectedShipMonitoring,
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
    const runtimeUi = {
      openclaw: resolveOpenClawRuntimeUiCard({
        callsigns: stationCallsigns,
        runtimeUiUrls: rewrittenOpenclawUrls,
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
