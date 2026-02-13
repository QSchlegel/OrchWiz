import { getBridgeStationTemplates, type BridgeStationKey } from "@/lib/bridge/stations"

export type OpenClawRuntimeUrlSource =
  | "runtime_ui_metadata"
  | "openclaw_ui_urls"
  | "openclaw_ui_url_template"
  | "openclaw_ui_url"
  | "openclaw_gateway_urls"
  | "openclaw_gateway_url_template"
  | "openclaw_gateway_url"
  | "cluster_service_fallback"
  | "unconfigured"

export interface OpenClawRuntimeStationUiTarget {
  stationKey: BridgeStationKey
  callsign: string
  label: string
  href: string | null
  source: OpenClawRuntimeUrlSource
}

const BRIDGE_STATION_KEYS = new Set<BridgeStationKey>(["xo", "ops", "eng", "sec", "med", "cou"])
const DEFAULT_CLUSTER_SERVICE_TEMPLATE = "http://openclaw-{stationKey}.{namespace}.svc.cluster.local:18789"

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function isLoopbackHostname(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return normalized === "127.0.0.1" || normalized === "::1" || normalized === "localhost"
}

function isLoopbackUrl(value: string): boolean {
  try {
    return isLoopbackHostname(new URL(value).hostname)
  } catch {
    return false
  }
}

function isRunningInKubernetes(): boolean {
  return asString(process.env.KUBERNETES_SERVICE_HOST) !== null
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function normalizeStationKey(value: unknown): BridgeStationKey | null {
  if (typeof value !== "string") {
    return null
  }
  const normalized = value.trim().toLowerCase() as BridgeStationKey
  return BRIDGE_STATION_KEYS.has(normalized) ? normalized : null
}

function normalizeUrl(value: string | null): string | null {
  if (!value) {
    return null
  }

  try {
    const parsed = new URL(value)
    return parsed.toString().replace(/\/+$/u, "")
  } catch {
    return null
  }
}

function parseStationUrlMap(raw: string | undefined): Partial<Record<BridgeStationKey, string>> {
  const normalized = asString(raw)
  if (!normalized) {
    return {}
  }

  const parsedFromJson = (() => {
    try {
      const decoded = JSON.parse(normalized) as unknown
      const record = asRecord(decoded)
      const next: Partial<Record<BridgeStationKey, string>> = {}
      for (const [key, value] of Object.entries(record)) {
        const stationKey = normalizeStationKey(key)
        const url = normalizeUrl(asString(value))
        if (!stationKey || !url) {
          continue
        }
        next[stationKey] = url
      }
      return next
    } catch {
      return null
    }
  })()

  if (parsedFromJson) {
    return parsedFromJson
  }

  const next: Partial<Record<BridgeStationKey, string>> = {}
  for (const entry of normalized.split(",")) {
    const [rawKey, ...rawValueParts] = entry.split("=")
    const stationKey = normalizeStationKey(rawKey)
    const url = normalizeUrl(asString(rawValueParts.join("=")))
    if (!stationKey || !url) {
      continue
    }
    next[stationKey] = url
  }
  return next
}

function interpolateTemplate(args: {
  template: string
  stationKey: BridgeStationKey
  namespace: string | null
}): string | null {
  const { template, stationKey, namespace } = args
  if (template.includes("{namespace}") && !namespace) {
    return null
  }

  return normalizeUrl(
    template
      .replaceAll("{stationKey}", stationKey)
      .replaceAll("{namespace}", namespace || ""),
  )
}

export function resolveShipNamespace(config: unknown, deploymentProfile: string | null): string | null {
  const infrastructure = asRecord(asRecord(config).infrastructure)
  const explicitNamespace = asString(infrastructure.namespace)
  if (explicitNamespace) {
    return explicitNamespace
  }

  if (deploymentProfile === "cloud_shipyard") {
    return "orchwiz-shipyard"
  }

  if (deploymentProfile === "local_starship_build") {
    return "orchwiz-starship"
  }

  return null
}

export function resolveOpenClawRuntimeUrlForStation(args: {
  stationKey: BridgeStationKey
  namespace?: string | null
}): {
  href: string | null
  source: OpenClawRuntimeUrlSource
} {
  const namespace = args.namespace || null

  const uiMap = parseStationUrlMap(process.env.OPENCLAW_UI_URLS)
  const uiMapMatch = uiMap[args.stationKey]
  if (uiMapMatch) {
    return {
      href: uiMapMatch,
      source: "openclaw_ui_urls",
    }
  }

  const uiTemplate = asString(process.env.OPENCLAW_UI_URL_TEMPLATE)
  if (uiTemplate) {
    const interpolated = interpolateTemplate({
      template: uiTemplate,
      stationKey: args.stationKey,
      namespace,
    })
    if (interpolated) {
      return {
        href: interpolated,
        source: "openclaw_ui_url_template",
      }
    }
  }

  const uiSingleton = normalizeUrl(asString(process.env.OPENCLAW_UI_URL))
  if (uiSingleton) {
    return {
      href: uiSingleton,
      source: "openclaw_ui_url",
    }
  }

  const gatewayMap = parseStationUrlMap(process.env.OPENCLAW_GATEWAY_URLS)
  const gatewayMapMatch = gatewayMap[args.stationKey]
  if (gatewayMapMatch) {
    return {
      href: gatewayMapMatch,
      source: "openclaw_gateway_urls",
    }
  }

  const gatewayTemplate = asString(process.env.OPENCLAW_GATEWAY_URL_TEMPLATE)
  if (gatewayTemplate) {
    const interpolated = interpolateTemplate({
      template: gatewayTemplate,
      stationKey: args.stationKey,
      namespace,
    })
    if (interpolated) {
      return {
        href: interpolated,
        source: "openclaw_gateway_url_template",
      }
    }
  }

  const gatewaySingleton = normalizeUrl(asString(process.env.OPENCLAW_GATEWAY_URL))
  if (gatewaySingleton) {
    // When running in-cluster, treat loopback singleton URLs as misconfiguration and
    // fall back to the per-station service template instead.
    if (namespace && isRunningInKubernetes() && isLoopbackUrl(gatewaySingleton)) {
      // Skip.
    } else {
    return {
      href: gatewaySingleton,
      source: "openclaw_gateway_url",
    }
    }
  }

  if (namespace) {
    const clusterTemplate =
      asString(process.env.OPENCLAW_CLUSTER_SERVICE_URL_TEMPLATE) || DEFAULT_CLUSTER_SERVICE_TEMPLATE
    const interpolated = interpolateTemplate({
      template: clusterTemplate,
      stationKey: args.stationKey,
      namespace,
    })
    if (interpolated) {
      return {
        href: interpolated,
        source: "cluster_service_fallback",
      }
    }
  }

  return {
    href: null,
    source: "unconfigured",
  }
}

export function resolveOpenClawRuntimeUiStations(args: {
  namespace?: string | null
  callsigns?: Partial<Record<BridgeStationKey, string>>
}): OpenClawRuntimeStationUiTarget[] {
  const namespace = args.namespace || null
  const callsigns = args.callsigns || {}

  return getBridgeStationTemplates().map((template) => {
    const resolved = resolveOpenClawRuntimeUrlForStation({
      stationKey: template.stationKey,
      namespace,
    })
    const callsign = callsigns[template.stationKey] || template.callsign

    return {
      stationKey: template.stationKey,
      callsign,
      label: `${callsign} OpenClaw UI`,
      href: resolved.href,
      source: resolved.source,
    }
  })
}

export function isBridgeStationKey(value: unknown): value is BridgeStationKey {
  return normalizeStationKey(value) !== null
}
