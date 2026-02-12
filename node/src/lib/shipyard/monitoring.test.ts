import assert from "node:assert/strict"
import test from "node:test"
import {
  defaultShipMonitoringConfig,
  normalizeShipMonitoringConfig,
  readShipMonitoringConfig,
  withNormalizedShipMonitoringInConfig,
} from "./monitoring"

test("defaultShipMonitoringConfig returns local monitoring defaults", () => {
  const defaults = defaultShipMonitoringConfig()

  assert.equal(
    defaults.grafanaUrl,
    "http://localhost:3001/d/orchwiz-overview/orchwiz-monitoring-overview?orgId=1&refresh=5s",
  )
  assert.equal(defaults.prometheusUrl, "http://localhost:9090/query?g0.expr=sum%20by(job)%20(up)&g0.tab=0")
  assert.equal(defaults.kubeviewUrl, "http://kubeview.orchwiz-starship.localhost:18080/")
})

test("normalizeShipMonitoringConfig accepts valid http/https monitoring URLs", () => {
  const normalized = normalizeShipMonitoringConfig({
    grafanaUrl: "https://grafana.example.com/d/bridge",
    prometheusUrl: "http://prometheus.internal:9090/graph",
    kubeviewUrl: "https://kubeview.example.com/kubeview",
  })

  assert.equal(normalized.grafanaUrl, "https://grafana.example.com/d/bridge")
  assert.equal(normalized.prometheusUrl, "http://prometheus.internal:9090/graph")
  assert.equal(normalized.kubeviewUrl, "https://kubeview.example.com/kubeview")
})

test("normalizeShipMonitoringConfig trims values and rejects non-http protocols", () => {
  const normalized = normalizeShipMonitoringConfig({
    grafanaUrl: "   https://grafana.example.com/  ",
    prometheusUrl: "ftp://prometheus.example.com",
    kubeviewUrl: "ssh://kubeview.internal",
  })

  assert.equal(normalized.grafanaUrl, "https://grafana.example.com/")
  assert.equal(normalized.prometheusUrl, null)
  assert.equal(normalized.kubeviewUrl, null)
})

test("normalizeShipMonitoringConfig nulls invalid or empty values", () => {
  const normalized = normalizeShipMonitoringConfig({
    grafanaUrl: "   ",
    prometheusUrl: "not-a-url",
    kubeviewUrl: "",
  })

  assert.equal(normalized.grafanaUrl, null)
  assert.equal(normalized.prometheusUrl, null)
  assert.equal(normalized.kubeviewUrl, null)
})

test("readShipMonitoringConfig reads nested config.monitoring payload", () => {
  const normalized = readShipMonitoringConfig({
    infrastructure: {
      kind: "kind",
    },
    monitoring: {
      grafanaUrl: "https://grafana.ship.local",
      prometheusUrl: "https://prometheus.ship.local",
      kubeviewUrl: "https://kubeview.ship.local",
    },
  })

  assert.deepEqual(normalized, {
    grafanaUrl: "https://grafana.ship.local/",
    prometheusUrl: "https://prometheus.ship.local/",
    kubeviewUrl: "https://kubeview.ship.local/",
  })
})

test("withNormalizedShipMonitoringInConfig preserves unrelated config fields", () => {
  const normalized = withNormalizedShipMonitoringInConfig({
    infrastructure: {
      kind: "kind",
      namespace: "orchwiz-starship",
    },
    cloudProvider: {
      provider: "hetzner",
    },
    monitoring: {
      grafanaUrl: "https://grafana.ship.local",
      prometheusUrl: "bad-url",
      kubeviewUrl: "https://kubeview.ship.local",
    },
  })

  assert.deepEqual(normalized.infrastructure, {
    kind: "kind",
    namespace: "orchwiz-starship",
  })
  assert.deepEqual(normalized.cloudProvider, {
    provider: "hetzner",
  })
  assert.deepEqual(normalized.monitoring, {
    grafanaUrl: "https://grafana.ship.local/",
    prometheusUrl: null,
    kubeviewUrl: "https://kubeview.ship.local/",
  })
})
