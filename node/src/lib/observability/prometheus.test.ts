import assert from "node:assert/strict"
import test from "node:test"
import {
  classifyRouteGroup,
  observeHttpRequest,
  recordNodeRuntimeSignals,
  renderPrometheusMetrics,
  isMetricsRequestAuthorized,
  resolveConfiguredMetricsToken,
  shouldRequireMetricsAuth,
} from "./prometheus"

test("classifyRouteGroup keeps low-cardinality buckets", () => {
  assert.equal(classifyRouteGroup("/api/ships/123"), "api")
  assert.equal(classifyRouteGroup("/api/bridge/runtime-ui/grafana"), "runtime-ui")
  assert.equal(classifyRouteGroup("/health"), "health")
  assert.equal(classifyRouteGroup("/downloads/orchwiz-mac.dmg"), "other")
})

test("metrics auth helper enforces bearer token checks", () => {
  assert.equal(resolveConfiguredMetricsToken(" \t "), null)
  assert.equal(resolveConfiguredMetricsToken(" token-1 "), "token-1")
  assert.equal(shouldRequireMetricsAuth({ nodeEnv: "production", configuredToken: null }), true)
  assert.equal(shouldRequireMetricsAuth({ nodeEnv: "development", configuredToken: null }), false)

  assert.equal(
    isMetricsRequestAuthorized({
      authorizationHeader: "Bearer expected",
      configuredToken: "expected",
      authRequired: true,
    }),
    true,
  )
  assert.equal(
    isMetricsRequestAuthorized({
      authorizationHeader: "Bearer wrong",
      configuredToken: "expected",
      authRequired: true,
    }),
    false,
  )
})

test("renderPrometheusMetrics includes ship metrics contract names", async () => {
  const finish = observeHttpRequest({
    service: "app",
    method: "GET",
    pathname: "/api/health",
  })
  finish(200)

  recordNodeRuntimeSignals({
    service: "app",
    metrics: {
      capturedAt: "2026-02-19T00:00:00.000Z",
      status: "healthy",
      signals: {
        cpuPercent: 12.4,
        heapPressurePercent: 36.8,
        eventLoopLagP95Ms: 5.6,
        rssBytes: 1024,
        heapUsedBytes: 512,
        heapTotalBytes: 1024,
        uptimeSec: 120,
      },
    },
  })

  const rendered = await renderPrometheusMetrics()
  assert.match(rendered.contentType, /text\/plain/i)
  assert.match(rendered.body, /orchwiz_http_requests_total/)
  assert.match(rendered.body, /service="app"/)
  assert.match(rendered.body, /route_group="health"/)
  assert.match(rendered.body, /orchwiz_http_request_duration_seconds_bucket/)
  assert.match(rendered.body, /orchwiz_http_in_flight_requests/)
  assert.match(rendered.body, /orchwiz_runtime_cpu_percent/)
  assert.match(rendered.body, /orchwiz_runtime_heap_pressure_percent/)
  assert.match(rendered.body, /orchwiz_runtime_event_loop_lag_p95_ms/)
  assert.match(rendered.body, /orchwiz_runtime_status/)
})
