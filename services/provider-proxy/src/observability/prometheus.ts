import crypto from "node:crypto"
import { cpus } from "node:os"
import { monitorEventLoopDelay } from "node:perf_hooks"
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client"

const RUNTIME_STATUSES = ["healthy", "elevated", "degraded"] as const

type RouteGroup = "api" | "runtime-ui" | "health" | "other"
type RuntimeStatus = (typeof RUNTIME_STATUSES)[number]

interface RuntimeSignals {
  cpuPercent: number
  heapPressurePercent: number
  eventLoopLagP95Ms: number
}

interface CpuSample {
  usage: NodeJS.CpuUsage
  hrtimeNs: bigint
}

interface PrometheusState {
  registry: Registry
  httpRequestsTotal: Counter<"service" | "method" | "status_class" | "route_group">
  httpRequestDurationSeconds: Histogram<"service" | "method" | "status_class" | "route_group">
  httpInFlightRequests: Gauge<"service">
  runtimeCpuPercent: Gauge<"service">
  runtimeHeapPressurePercent: Gauge<"service">
  runtimeEventLoopLagP95Ms: Gauge<"service">
  runtimeStatus: Gauge<"service" | "status">
}

const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 })
eventLoopDelay.enable()

let previousCpuSample: CpuSample | null = null
let state: PrometheusState | null = null

function roundTo(value: number, fractionDigits = 1): number {
  const factor = 10 ** fractionDigits
  return Math.round(value * factor) / factor
}

function safeFinite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0
  }
  if (value >= 100) {
    return 100
  }
  return value
}

function normalizeHttpMethod(method: string): string {
  const normalized = method.trim().toUpperCase()
  if (
    normalized === "GET"
    || normalized === "POST"
    || normalized === "PUT"
    || normalized === "PATCH"
    || normalized === "DELETE"
    || normalized === "OPTIONS"
    || normalized === "HEAD"
  ) {
    return normalized
  }
  return "OTHER"
}

function normalizePath(pathname: string): string {
  const trimmed = pathname.trim()
  if (trimmed.length === 0) {
    return "/"
  }

  try {
    const parsed = new URL(trimmed, "http://localhost")
    return parsed.pathname || "/"
  } catch {
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`
  }
}

export function classifyRouteGroup(pathname: string): RouteGroup {
  const path = normalizePath(pathname).toLowerCase()
  if (path === "/health" || path === "/api/health" || path.startsWith("/health/")) {
    return "health"
  }

  if (
    path.startsWith("/api/bridge/runtime-ui/")
    || path === "/api/bridge/runtime-ui"
    || path.startsWith("/openclaw/")
    || path.startsWith("/grafana/")
    || path.startsWith("/prometheus/")
    || path.startsWith("/kubeview/")
    || path.startsWith("/langfuse/")
    || path.startsWith("/loki/")
  ) {
    return "runtime-ui"
  }

  if (path === "/api" || path.startsWith("/api/") || path === "/v1" || path.startsWith("/v1/")) {
    return "api"
  }

  return "other"
}

export function classifyHttpStatusCode(statusCode: number): string {
  if (!Number.isFinite(statusCode) || statusCode <= 0) {
    return "unknown"
  }
  if (statusCode >= 100 && statusCode < 200) return "1xx"
  if (statusCode >= 200 && statusCode < 300) return "2xx"
  if (statusCode >= 300 && statusCode < 400) return "3xx"
  if (statusCode >= 400 && statusCode < 500) return "4xx"
  if (statusCode >= 500 && statusCode < 600) return "5xx"
  return "other"
}

function getOrCreateState(): PrometheusState {
  if (state) {
    return state
  }

  const registry = new Registry()
  collectDefaultMetrics({ register: registry })

  state = {
    registry,
    httpRequestsTotal: new Counter({
      name: "orchwiz_http_requests_total",
      help: "Total HTTP requests served by OrchWiz services.",
      registers: [registry],
      labelNames: ["service", "method", "status_class", "route_group"],
    }),
    httpRequestDurationSeconds: new Histogram({
      name: "orchwiz_http_request_duration_seconds",
      help: "HTTP request duration in seconds for OrchWiz services.",
      registers: [registry],
      labelNames: ["service", "method", "status_class", "route_group"],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    }),
    httpInFlightRequests: new Gauge({
      name: "orchwiz_http_in_flight_requests",
      help: "Current in-flight HTTP requests by service.",
      registers: [registry],
      labelNames: ["service"],
    }),
    runtimeCpuPercent: new Gauge({
      name: "orchwiz_runtime_cpu_percent",
      help: "Runtime CPU percent by service.",
      registers: [registry],
      labelNames: ["service"],
    }),
    runtimeHeapPressurePercent: new Gauge({
      name: "orchwiz_runtime_heap_pressure_percent",
      help: "Runtime heap pressure percent by service.",
      registers: [registry],
      labelNames: ["service"],
    }),
    runtimeEventLoopLagP95Ms: new Gauge({
      name: "orchwiz_runtime_event_loop_lag_p95_ms",
      help: "Runtime event loop lag p95 in milliseconds by service.",
      registers: [registry],
      labelNames: ["service"],
    }),
    runtimeStatus: new Gauge({
      name: "orchwiz_runtime_status",
      help: "Runtime status one-hot gauge by service and status.",
      registers: [registry],
      labelNames: ["service", "status"],
    }),
  }

  return state
}

function classifyRuntimeStatus(signals: RuntimeSignals): RuntimeStatus {
  if (
    signals.cpuPercent < 65
    && signals.heapPressurePercent < 75
    && signals.eventLoopLagP95Ms < 40
  ) {
    return "healthy"
  }

  if (
    signals.cpuPercent < 85
    && signals.heapPressurePercent < 90
    && signals.eventLoopLagP95Ms < 120
  ) {
    return "elevated"
  }

  return "degraded"
}

function sampleRuntimeSignals(): RuntimeSignals {
  const usage = process.cpuUsage()
  const hrtimeNs = process.hrtime.bigint()
  const memory = process.memoryUsage()
  const uptimeSec = safeFinite(process.uptime(), 0)
  const cpuCoreCount = Math.max(1, cpus().length)

  const totalUsageMicros = usage.user + usage.system
  let cpuPercent = 0

  if (previousCpuSample) {
    const elapsedNs = Number(hrtimeNs - previousCpuSample.hrtimeNs)
    const elapsedMicros = elapsedNs / 1_000
    const previousUsageMicros = previousCpuSample.usage.user + previousCpuSample.usage.system
    const usageDeltaMicros = totalUsageMicros - previousUsageMicros

    if (elapsedMicros > 0 && usageDeltaMicros >= 0) {
      cpuPercent = clampPercent((usageDeltaMicros / elapsedMicros / cpuCoreCount) * 100)
    }
  } else if (uptimeSec > 0) {
    cpuPercent = clampPercent((totalUsageMicros / (uptimeSec * 1_000_000) / cpuCoreCount) * 100)
  }

  previousCpuSample = { usage, hrtimeNs }

  const heapPressurePercent =
    memory.heapTotal > 0 ? clampPercent((memory.heapUsed / memory.heapTotal) * 100) : 0
  const eventLoopLagP95Ms = roundTo(Math.max(0, eventLoopDelay.percentile(95) / 1_000_000), 1)
  eventLoopDelay.reset()

  return {
    cpuPercent: roundTo(cpuPercent, 1),
    heapPressurePercent: roundTo(heapPressurePercent, 1),
    eventLoopLagP95Ms,
  }
}

export function observeHttpRequest(args: {
  service: string
  method: string
  pathname: string
}): (statusCode: number) => void {
  const metricsState = getOrCreateState()
  const service = args.service.trim().length > 0 ? args.service.trim() : "unknown"
  const method = normalizeHttpMethod(args.method)
  const routeGroup = classifyRouteGroup(args.pathname)
  const startedAt = process.hrtime.bigint()
  let done = false

  metricsState.httpInFlightRequests.inc({ service })

  return (statusCode: number) => {
    if (done) {
      return
    }
    done = true

    const elapsedNs = process.hrtime.bigint() - startedAt
    const elapsedSeconds = Number(elapsedNs) / 1_000_000_000
    const statusClass = classifyHttpStatusCode(statusCode)

    metricsState.httpRequestsTotal.inc({
      service,
      method,
      status_class: statusClass,
      route_group: routeGroup,
    })
    metricsState.httpRequestDurationSeconds.observe(
      {
        service,
        method,
        status_class: statusClass,
        route_group: routeGroup,
      },
      Number.isFinite(elapsedSeconds) && elapsedSeconds >= 0 ? elapsedSeconds : 0,
    )
    metricsState.httpInFlightRequests.dec({ service })
  }
}

export function recordRuntimeSignals(args: { service: string }): void {
  const metricsState = getOrCreateState()
  const service = args.service.trim().length > 0 ? args.service.trim() : "unknown"
  const signals = sampleRuntimeSignals()
  const status = classifyRuntimeStatus(signals)

  metricsState.runtimeCpuPercent.set({ service }, signals.cpuPercent)
  metricsState.runtimeHeapPressurePercent.set({ service }, signals.heapPressurePercent)
  metricsState.runtimeEventLoopLagP95Ms.set({ service }, signals.eventLoopLagP95Ms)

  for (const runtimeStatus of RUNTIME_STATUSES) {
    metricsState.runtimeStatus.set({ service, status: runtimeStatus }, status === runtimeStatus ? 1 : 0)
  }
}

export async function renderPrometheusMetrics(): Promise<{ body: string; contentType: string }> {
  const metricsState = getOrCreateState()
  return {
    body: await metricsState.registry.metrics(),
    contentType: metricsState.registry.contentType,
  }
}

export function resolveConfiguredMetricsToken(rawValue: string | undefined): string | null {
  if (typeof rawValue !== "string") {
    return null
  }
  const trimmed = rawValue.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function extractBearerToken(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null
  }
  const match = value.match(/^\s*Bearer\s+(.+)\s*$/iu)
  if (!match) {
    return null
  }
  const token = match[1]?.trim() || ""
  return token.length > 0 ? token : null
}

export function shouldRequireMetricsAuth(args: {
  nodeEnv: string | undefined
  configuredToken: string | null
}): boolean {
  return args.nodeEnv === "production" || args.configuredToken !== null
}

function timingSafeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8")
  const bBuf = Buffer.from(b, "utf8")
  if (aBuf.length !== bBuf.length) {
    return false
  }
  return crypto.timingSafeEqual(aBuf, bBuf)
}

export function isMetricsRequestAuthorized(args: {
  authorizationHeader: string | null | undefined
  configuredToken: string | null
  authRequired: boolean
}): boolean {
  if (!args.authRequired) {
    return true
  }
  if (!args.configuredToken) {
    return false
  }
  const provided = extractBearerToken(args.authorizationHeader)
  if (!provided) {
    return false
  }
  return timingSafeEqual(provided, args.configuredToken)
}
