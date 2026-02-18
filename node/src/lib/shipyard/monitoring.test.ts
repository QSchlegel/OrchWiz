import assert from "node:assert/strict"
import test from "node:test"
import {
  defaultShipMonitoringConfig,
  normalizeShipMonitoringConfig,
  readShipMonitoringConfig,
  withLangfuseCloudSettingsInConfig,
  withNormalizedShipMonitoringInConfig,
} from "./monitoring"

test("defaultShipMonitoringConfig returns same-API monitoring defaults", () => {
  const defaults = defaultShipMonitoringConfig()

  assert.equal(defaults.grafanaUrl, "/api/bridge/runtime-ui/grafana")
  assert.equal(defaults.prometheusUrl, "/api/bridge/runtime-ui/prometheus")
  assert.equal(defaults.kubeviewUrl, "/api/bridge/runtime-ui/kubeview")
  assert.equal(defaults.langfuseUrl, "/api/bridge/runtime-ui/langfuse")
  assert.equal(defaults.langfuseCloudUrl, "/api/bridge/runtime-ui/langfuse")
  assert.equal(defaults.langfuseCloudProject, null)
  assert.equal(defaults.langfuseCloudPublicKey, null)
  assert.equal(defaults.langfuseCloudSecretKey, null)
})

test("normalizeShipMonitoringConfig accepts valid http/https monitoring URLs", () => {
  const normalized = normalizeShipMonitoringConfig({
    grafanaUrl: "https://grafana.example.com/d/bridge",
    prometheusUrl: "http://prometheus.internal:9090/graph",
    kubeviewUrl: "https://kubeview.example.com/kubeview",
    langfuseUrl: "https://langfuse.example.com",
    langfuseCloudUrl: "https://cloud.langfuse.example.com",
    langfuseCloudProject: "project-alpha",
    langfuseCloudPublicKey: "public-alpha",
    langfuseCloudSecretKey: "secret-alpha",
  })

  assert.equal(normalized.grafanaUrl, "https://grafana.example.com/d/bridge")
  assert.equal(normalized.prometheusUrl, "http://prometheus.internal:9090/graph")
  assert.equal(normalized.kubeviewUrl, "https://kubeview.example.com/kubeview")
  assert.equal(normalized.langfuseUrl, "https://cloud.langfuse.example.com/")
  assert.equal(normalized.langfuseCloudUrl, "https://cloud.langfuse.example.com/")
  assert.equal(normalized.langfuseCloudProject, "project-alpha")
  assert.equal(normalized.langfuseCloudPublicKey, "public-alpha")
  assert.equal(normalized.langfuseCloudSecretKey, "secret-alpha")
})

test("normalizeShipMonitoringConfig accepts relative same-origin monitoring URLs", () => {
  const normalized = normalizeShipMonitoringConfig({
    grafanaUrl: "/grafana",
    prometheusUrl: "/prometheus",
    kubeviewUrl: "/api/bridge/runtime-ui/kubeview",
    langfuseUrl: "/api/bridge/runtime-ui/langfuse",
  })

  assert.deepEqual(normalized, {
    grafanaUrl: "/grafana",
    prometheusUrl: "/prometheus",
    kubeviewUrl: "/api/bridge/runtime-ui/kubeview",
    langfuseUrl: "/api/bridge/runtime-ui/langfuse",
    langfuseCloudUrl: "/api/bridge/runtime-ui/langfuse",
    langfuseCloudProject: null,
    langfuseCloudPublicKey: null,
    langfuseCloudSecretKey: null,
  })
})

test("normalizeShipMonitoringConfig trims values and rejects non-http protocols", () => {
  const normalized = normalizeShipMonitoringConfig({
    grafanaUrl: "   https://grafana.example.com/  ",
    prometheusUrl: "ftp://prometheus.example.com",
    kubeviewUrl: "ssh://kubeview.internal",
    langfuseUrl: "chrome-extension://langfuse",
    langfuseCloudUrl: "ws://langfuse-cloud.example.com",
    langfuseCloudProject: "   ",
    langfuseCloudPublicKey: "",
    langfuseCloudSecretKey: "   ",
  })

  assert.equal(normalized.grafanaUrl, "https://grafana.example.com/")
  assert.equal(normalized.prometheusUrl, null)
  assert.equal(normalized.kubeviewUrl, null)
  assert.equal(normalized.langfuseUrl, null)
  assert.equal(normalized.langfuseCloudUrl, null)
  assert.equal(normalized.langfuseCloudProject, null)
  assert.equal(normalized.langfuseCloudPublicKey, null)
  assert.equal(normalized.langfuseCloudSecretKey, null)
})

test("normalizeShipMonitoringConfig nulls invalid or empty values", () => {
  const normalized = normalizeShipMonitoringConfig({
    grafanaUrl: "   ",
    prometheusUrl: "not-a-url",
    kubeviewUrl: "",
    langfuseUrl: "    ",
  })

  assert.equal(normalized.grafanaUrl, null)
  assert.equal(normalized.prometheusUrl, null)
  assert.equal(normalized.kubeviewUrl, null)
  assert.equal(normalized.langfuseUrl, null)
  assert.equal(normalized.langfuseCloudUrl, null)
  assert.equal(normalized.langfuseCloudProject, null)
  assert.equal(normalized.langfuseCloudPublicKey, null)
  assert.equal(normalized.langfuseCloudSecretKey, null)
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
      langfuseUrl: "https://langfuse.ship.local",
      langfuseCloudProject: "ship-project",
      langfuseCloudPublicKey: "ship-public",
      langfuseCloudSecretKey: "ship-secret",
    },
  })

  assert.deepEqual(normalized, {
    grafanaUrl: "https://grafana.ship.local/",
    prometheusUrl: "https://prometheus.ship.local/",
    kubeviewUrl: "https://kubeview.ship.local/",
    langfuseUrl: "https://langfuse.ship.local/",
    langfuseCloudUrl: "https://langfuse.ship.local/",
    langfuseCloudProject: "ship-project",
    langfuseCloudPublicKey: "ship-public",
    langfuseCloudSecretKey: "ship-secret",
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
      langfuseUrl: "/api/bridge/runtime-ui/langfuse",
      langfusePublicKey: "legacy-public-key",
      langfuseSecretKey: "legacy-secret-key",
      langfuseProject: "legacy-project",
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
    langfuseUrl: "/api/bridge/runtime-ui/langfuse",
    langfuseCloudUrl: "/api/bridge/runtime-ui/langfuse",
    langfuseCloudProject: "legacy-project",
    langfuseCloudPublicKey: "legacy-public-key",
    langfuseCloudSecretKey: "legacy-secret-key",
  })
})

test("normalizeShipMonitoringConfig falls back to legacy langfuse keys when cloud keys are absent", () => {
  const normalized = normalizeShipMonitoringConfig({
    langfuseUrl: "https://legacy.langfuse.example.com",
    langfuseProject: "legacy-project",
    langfusePublicKey: "legacy-public",
    langfuseSecretKey: "legacy-secret",
  })

  assert.equal(normalized.langfuseUrl, "https://legacy.langfuse.example.com/")
  assert.equal(normalized.langfuseCloudUrl, "https://legacy.langfuse.example.com/")
  assert.equal(normalized.langfuseCloudProject, "legacy-project")
  assert.equal(normalized.langfuseCloudPublicKey, "legacy-public")
  assert.equal(normalized.langfuseCloudSecretKey, "legacy-secret")
})

test("withLangfuseCloudSettingsInConfig fills missing cloud keys without overwriting explicit values", () => {
  const merged = withLangfuseCloudSettingsInConfig(
    {
      monitoring: {
        langfuseUrl: "https://legacy.ship.local",
        langfuseCloudProject: "ship-project",
      },
    },
    {
      langfuseCloudUrl: "https://cloud.settings.local",
      langfuseCloudProject: "settings-project",
      langfuseCloudPublicKey: "settings-public",
      langfuseCloudSecretKey: "settings-secret",
    },
  )

  const monitoring = (merged.monitoring || {}) as Record<string, unknown>
  assert.equal(monitoring.langfuseCloudUrl, "https://cloud.settings.local")
  assert.equal(monitoring.langfuseCloudProject, "ship-project")
  assert.equal(monitoring.langfuseCloudPublicKey, "settings-public")
  assert.equal(monitoring.langfuseCloudSecretKey, "settings-secret")
  assert.equal(monitoring.langfuseUrl, "https://legacy.ship.local")
})
