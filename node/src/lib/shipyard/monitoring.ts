export interface ShipMonitoringConfig {
  grafanaUrl: string | null
  prometheusUrl: string | null
  kubeviewUrl: string | null
  langfuseUrl: string | null
  langfuseCloudUrl: string | null
  langfuseCloudProject: string | null
  langfuseCloudPublicKey: string | null
  langfuseCloudSecretKey: string | null
}

export interface LangfuseCloudMonitoringSettings {
  langfuseCloudUrl: string | null
  langfuseCloudProject: string | null
  langfuseCloudPublicKey: string | null
  langfuseCloudSecretKey: string | null
}

export const SHIP_MONITORING_DEFAULTS = Object.freeze({
  // Use the built-in Grafana patch-through proxy.
  grafanaUrl: "/api/bridge/runtime-ui/grafana",
  // Use the built-in Prometheus patch-through proxy.
  prometheusUrl: "/api/bridge/runtime-ui/prometheus",
  // Use the built-in KubeView patch-through so users don't need a separate port-forward.
  kubeviewUrl: "/api/bridge/runtime-ui/kubeview",
  // Use the built-in Langfuse patch-through when LANGFUSE_BASE_URL is configured.
  langfuseUrl: "/api/bridge/runtime-ui/langfuse",
  // Cloud Langfuse can point to the same proxy route when no direct external URL is provided.
  langfuseCloudUrl: "/api/bridge/runtime-ui/langfuse",
  langfuseCloudProject: null as string | null,
  langfuseCloudPublicKey: null as string | null,
  langfuseCloudSecretKey: null as string | null,
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

function normalizeMonitoringString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function normalizeLangfuseCloudMonitoringSettings(
  rawValue: unknown,
): LangfuseCloudMonitoringSettings {
  const raw = asRecord(rawValue)

  const legacyUrl = normalizeMonitoringUrl(raw.langfuseUrl)
  const legacyProject = normalizeMonitoringString(raw.langfuseProject)
  const legacyPublicKey = normalizeMonitoringString(raw.langfusePublicKey)
  const legacySecretKey = normalizeMonitoringString(raw.langfuseSecretKey)

  return {
    langfuseCloudUrl: normalizeMonitoringUrl(raw.langfuseCloudUrl) || legacyUrl,
    langfuseCloudProject: normalizeMonitoringString(raw.langfuseCloudProject) || legacyProject,
    langfuseCloudPublicKey: normalizeMonitoringString(raw.langfuseCloudPublicKey) || legacyPublicKey,
    langfuseCloudSecretKey: normalizeMonitoringString(raw.langfuseCloudSecretKey) || legacySecretKey,
  }
}

export function normalizeShipMonitoringConfig(rawValue: unknown): ShipMonitoringConfig {
  const raw = asRecord(rawValue)
  const langfuseCloud = normalizeLangfuseCloudMonitoringSettings(raw)

  return {
    grafanaUrl: normalizeMonitoringUrl(raw.grafanaUrl),
    prometheusUrl: normalizeMonitoringUrl(raw.prometheusUrl),
    kubeviewUrl: normalizeMonitoringUrl(raw.kubeviewUrl),
    langfuseUrl: langfuseCloud.langfuseCloudUrl || normalizeMonitoringUrl(raw.langfuseUrl),
    langfuseCloudUrl: langfuseCloud.langfuseCloudUrl,
    langfuseCloudProject: langfuseCloud.langfuseCloudProject,
    langfuseCloudPublicKey: langfuseCloud.langfuseCloudPublicKey,
    langfuseCloudSecretKey: langfuseCloud.langfuseCloudSecretKey,
  }
}

export function defaultShipMonitoringConfig(): ShipMonitoringConfig {
  return {
    grafanaUrl: SHIP_MONITORING_DEFAULTS.grafanaUrl,
    prometheusUrl: SHIP_MONITORING_DEFAULTS.prometheusUrl,
    kubeviewUrl: SHIP_MONITORING_DEFAULTS.kubeviewUrl,
    langfuseUrl: SHIP_MONITORING_DEFAULTS.langfuseUrl,
    langfuseCloudUrl: SHIP_MONITORING_DEFAULTS.langfuseCloudUrl,
    langfuseCloudProject: SHIP_MONITORING_DEFAULTS.langfuseCloudProject,
    langfuseCloudPublicKey: SHIP_MONITORING_DEFAULTS.langfuseCloudPublicKey,
    langfuseCloudSecretKey: SHIP_MONITORING_DEFAULTS.langfuseCloudSecretKey,
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

export function withLangfuseCloudSettingsInConfig(
  rawConfig: unknown,
  rawSettings: unknown,
): Record<string, unknown> {
  const config = asRecord(rawConfig)
  const settings = normalizeLangfuseCloudMonitoringSettings(rawSettings)
  const hasAnySetting = Object.values(settings).some((value) => value !== null)

  if (!hasAnySetting) {
    return config
  }

  const monitoring = asRecord(config.monitoring)
  const nextMonitoring: Record<string, unknown> = { ...monitoring }

  if (!normalizeMonitoringUrl(monitoring.langfuseCloudUrl) && settings.langfuseCloudUrl) {
    nextMonitoring.langfuseCloudUrl = settings.langfuseCloudUrl
  }
  if (!normalizeMonitoringString(monitoring.langfuseCloudProject) && settings.langfuseCloudProject) {
    nextMonitoring.langfuseCloudProject = settings.langfuseCloudProject
  }
  if (!normalizeMonitoringString(monitoring.langfuseCloudPublicKey) && settings.langfuseCloudPublicKey) {
    nextMonitoring.langfuseCloudPublicKey = settings.langfuseCloudPublicKey
  }
  if (!normalizeMonitoringString(monitoring.langfuseCloudSecretKey) && settings.langfuseCloudSecretKey) {
    nextMonitoring.langfuseCloudSecretKey = settings.langfuseCloudSecretKey
  }

  if (!normalizeMonitoringUrl(monitoring.langfuseUrl) && settings.langfuseCloudUrl) {
    nextMonitoring.langfuseUrl = settings.langfuseCloudUrl
  }

  return {
    ...config,
    monitoring: nextMonitoring,
  }
}
