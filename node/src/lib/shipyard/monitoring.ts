export interface ShipMonitoringConfig {
  grafanaUrl: string | null
  prometheusUrl: string | null
  kubeviewUrl: string | null
  langfuseUrl: string | null
}

export const SHIP_MONITORING_DEFAULTS = Object.freeze({
  grafanaUrl:
    "http://localhost:3001/d/orchwiz-overview/orchwiz-monitoring-overview?orgId=1&refresh=5s",
  prometheusUrl: "http://localhost:9090/query?g0.expr=sum%20by(job)%20(up)&g0.tab=0",
  // Use the built-in KubeView patch-through so users don't need a separate port-forward.
  kubeviewUrl: "/api/bridge/runtime-ui/kubeview",
  // Use bridge patch-through for Langfuse UI when LANGFUSE_BASE_URL is configured.
  langfuseUrl: "/api/bridge/runtime-ui/langfuse",
})

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function normalizeMonitoringUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return null
  }

  if (trimmed.startsWith("/")) {
    // Allow same-origin proxy routes such as `/api/bridge/runtime-ui/kubeview`.
    return trimmed
  }

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}

export function normalizeShipMonitoringConfig(rawValue: unknown): ShipMonitoringConfig {
  const raw = asRecord(rawValue)

  return {
    grafanaUrl: normalizeMonitoringUrl(raw.grafanaUrl),
    prometheusUrl: normalizeMonitoringUrl(raw.prometheusUrl),
    kubeviewUrl: normalizeMonitoringUrl(raw.kubeviewUrl),
    langfuseUrl: normalizeMonitoringUrl(raw.langfuseUrl),
  }
}

export function defaultShipMonitoringConfig(): ShipMonitoringConfig {
  return {
    grafanaUrl: SHIP_MONITORING_DEFAULTS.grafanaUrl,
    prometheusUrl: SHIP_MONITORING_DEFAULTS.prometheusUrl,
    kubeviewUrl: SHIP_MONITORING_DEFAULTS.kubeviewUrl,
    langfuseUrl: SHIP_MONITORING_DEFAULTS.langfuseUrl,
  }
}

export function readShipMonitoringConfig(rawConfig: unknown): ShipMonitoringConfig {
  const config = asRecord(rawConfig)
  return normalizeShipMonitoringConfig(config.monitoring)
}

export function withNormalizedShipMonitoringInConfig(rawConfig: unknown): Record<string, unknown> {
  const config = asRecord(rawConfig)

  return {
    ...config,
    monitoring: normalizeShipMonitoringConfig(config.monitoring),
  }
}
