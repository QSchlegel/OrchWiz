import crypto from "node:crypto"
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client"
import { getNodeRuntimeMetrics, type NodeRuntimeMetrics } from "../runtime/node-metrics"

const ROUTE_GROUPS = ["api", "runtime-ui", "health", "other"] as const
const RUNTIME_STATUSES = ["healthy", "elevated", "degraded"] as const

type RouteGroup = (typeof ROUTE_GROUPS)[number]

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

function normalizeHttpMethod(method: string): string {
  const normalized = method.trim().toUpperCase()
  if (normalized === "GET"
    || normalized === "POST"
    || normalized === "PUT"
    || normalized === "PATCH"
    || normalized === "DELETE"
    || normalized === "OPTIONS"
    || normalized === "HEAD") {
    return normalized
  }
  return "OTHER"
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

function normalizePath(pathname: string): string {
  const raw = pathname.trim()
  if (raw.length === 0) {
    return "/"
  }
  try {
    const parsed = new URL(raw, "http://localhost")
    return parsed.pathname || "/"
  } catch {
    return raw.startsWith("/") ? raw : `/${raw}`
  }
}

export function classifyRouteGroup(pathname: string): RouteGroup {
  const path = normalizePath(pathname).toLowerCase()
  if (path === "/health" || path === "/api/health" || path.startsWith("/health/")) {
    return "health"
  }

  if (path.startsWith("/api/bridge/runtime-ui/")
    || path === "/api/bridge/runtime-ui"
    || path.startsWith("/openclaw/")
    || path.startsWith("/grafana/")
    || path.startsWith("/prometheus/")
    || path.startsWith("/kubeview/")
    || path.startsWith("/langfuse/")
    || path.startsWith("/loki/")) {
    return "runtime-ui"
  }

  if (path === "/api" || path.startsWith("/api/") || path === "/v1" || path.startsWith("/v1/")) {
    return "api"
  }

  return "other"
}

function asStateContainer() {
  return globalThis as typeof globalThis & { __orchwizPrometheusState?: PrometheusState }
}

function getOrCreateState(): PrometheusState {
  const container = asStateContainer()
  if (container.__orchwizPrometheusState) {
    return container.__orchwizPrometheusState
  }

  const registry = new Registry()
  collectDefaultMetrics({ register: registry })

  const state: PrometheusState = {
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

  container.__orchwizPrometheusState = state
  return state
}

export interface ObserveHttpRequestArgs {
  service: string
  method: string
  pathname: string
}

export function observeHttpRequest(args: ObserveHttpRequestArgs): (statusCode: number) => void {
  const state = getOrCreateState()
  const service = args.service.trim().length > 0 ? args.service.trim() : "unknown"
  const method = normalizeHttpMethod(args.method)
  const routeGroup = classifyRouteGroup(args.pathname)
  const startedAt = process.hrtime.bigint()
  let done = false

  state.httpInFlightRequests.inc({ service })

  return (statusCode: number) => {
    if (done) return
    done = true

    const elapsedNs = process.hrtime.bigint() - startedAt
    const elapsedSeconds = Number(elapsedNs) / 1_000_000_000
    const statusClass = classifyHttpStatusCode(statusCode)

    state.httpRequestsTotal.inc({
      service,
      method,
      status_class: statusClass,
      route_group: routeGroup,
    })

    state.httpRequestDurationSeconds.observe(
      {
        service,
        method,
        status_class: statusClass,
        route_group: routeGroup,
      },
      Number.isFinite(elapsedSeconds) && elapsedSeconds >= 0 ? elapsedSeconds : 0,
    )

    state.httpInFlightRequests.dec({ service })
  }
}

export interface RecordNodeRuntimeSignalsArgs {
  service: string
  metrics?: NodeRuntimeMetrics
}

export function recordNodeRuntimeSignals(args: RecordNodeRuntimeSignalsArgs): void {
  const state = getOrCreateState()
  const service = args.service.trim().length > 0 ? args.service.trim() : "unknown"
  const metrics = args.metrics || getNodeRuntimeMetrics()

  state.runtimeCpuPercent.set({ service }, metrics.signals.cpuPercent)
  state.runtimeHeapPressurePercent.set({ service }, metrics.signals.heapPressurePercent)
  state.runtimeEventLoopLagP95Ms.set({ service }, metrics.signals.eventLoopLagP95Ms)

  for (const status of RUNTIME_STATUSES) {
    state.runtimeStatus.set(
      { service, status },
      metrics.status === status ? 1 : 0,
    )
  }
}

export async function renderPrometheusMetrics(): Promise<{ body: string; contentType: string }> {
  const state = getOrCreateState()
  return {
    body: await state.registry.metrics(),
    contentType: state.registry.contentType,
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

function tokensEqual(a: string, b: string): boolean {
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
  return tokensEqual(provided, args.configuredToken)
}
