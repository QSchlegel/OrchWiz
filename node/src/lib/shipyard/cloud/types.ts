export type CloudProviderId = "hetzner"

export interface CloudClusterRoleSpec {
  machineType: string
  count: number
}

export interface CloudClusterSpec {
  clusterName: string
  location: string
  networkCidr: string
  image: string
  controlPlane: CloudClusterRoleSpec
  workers: CloudClusterRoleSpec
}

export interface CloudK3sSettings {
  channel: string
  disableTraefik: boolean
}

export interface CloudTunnelPolicy {
  manage: boolean
  target: "kubernetes_api"
  localPort: number
}

export interface CloudProviderConfig {
  provider: CloudProviderId
  cluster: CloudClusterSpec
  stackMode: "full_support_systems"
  k3s: CloudK3sSettings
  tunnelPolicy: CloudTunnelPolicy
  sshKeyId: string | null
}

export interface CloudProviderReadiness {
  provider: CloudProviderId
  displayName: string
  enabled: boolean
  ready: boolean
  checks: Array<{
    key: string
    ok: boolean
    message: string
  }>
}

export interface CloudCatalogRegion {
  id: string
  name: string
  description: string
  networkZone: string | null
}

export interface CloudCatalogMachineType {
  id: string
  name: string
  description: string
  cpu: number
  memoryGb: number
  diskGb: number
  architecture: string | null
  locations: string[]
  priceHourlyByLocationEur: Record<string, number>
  priceHourlyEur: number | null
}

export interface CloudCatalogImage {
  id: string
  name: string
  type: string
  description: string
  architecture: string | null
}

export interface CloudCatalog {
  fetchedAt: string
  regions: CloudCatalogRegion[]
  machineTypes: CloudCatalogMachineType[]
  images: CloudCatalogImage[]
}

const DEFAULT_PROVIDER: CloudProviderId = "hetzner"

const DEFAULT_CONFIG: CloudProviderConfig = {
  provider: DEFAULT_PROVIDER,
  cluster: {
    clusterName: "orchwiz-starship",
    location: "nbg1",
    networkCidr: "10.42.0.0/16",
    image: "ubuntu-24.04",
    controlPlane: {
      machineType: "cx22",
      count: 1,
    },
    workers: {
      machineType: "cx32",
      count: 2,
    },
  },
  stackMode: "full_support_systems",
  k3s: {
    channel: "stable",
    disableTraefik: true,
  },
  tunnelPolicy: {
    manage: true,
    target: "kubernetes_api",
    localPort: 16_443,
  },
  sshKeyId: null,
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value !== "boolean") {
    return null
  }
  return value
}

function asPositiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null
  }

  const floored = Math.floor(value)
  return floored > 0 ? floored : null
}

function asPort(value: unknown): number | null {
  const parsed = asPositiveInt(value)
  if (parsed === null || parsed > 65535) {
    return null
  }
  return parsed
}

function normalizeRoleSpec(
  input: Record<string, unknown>,
  defaults: CloudClusterRoleSpec,
): CloudClusterRoleSpec {
  return {
    machineType: asNonEmptyString(input.machineType) || defaults.machineType,
    count: asPositiveInt(input.count) || defaults.count,
  }
}

export function normalizeCloudProviderConfig(rawValue: unknown): CloudProviderConfig {
  const raw = asRecord(rawValue)
  const provider = asNonEmptyString(raw.provider) === "hetzner" ? "hetzner" : DEFAULT_CONFIG.provider

  const rawCluster = asRecord(raw.cluster)
  const rawControlPlane = asRecord(rawCluster.controlPlane)
  const rawWorkers = asRecord(rawCluster.workers)
  const rawK3s = asRecord(raw.k3s)
  const rawTunnelPolicy = asRecord(raw.tunnelPolicy)

  const cluster: CloudClusterSpec = {
    clusterName: asNonEmptyString(rawCluster.clusterName) || DEFAULT_CONFIG.cluster.clusterName,
    location: asNonEmptyString(rawCluster.location) || DEFAULT_CONFIG.cluster.location,
    networkCidr: asNonEmptyString(rawCluster.networkCidr) || DEFAULT_CONFIG.cluster.networkCidr,
    image: asNonEmptyString(rawCluster.image) || DEFAULT_CONFIG.cluster.image,
    controlPlane: normalizeRoleSpec(rawControlPlane, DEFAULT_CONFIG.cluster.controlPlane),
    workers: normalizeRoleSpec(rawWorkers, DEFAULT_CONFIG.cluster.workers),
  }

  const stackMode = raw.stackMode === "full_support_systems"
    ? "full_support_systems"
    : DEFAULT_CONFIG.stackMode

  const k3s: CloudK3sSettings = {
    channel: asNonEmptyString(rawK3s.channel) || DEFAULT_CONFIG.k3s.channel,
    disableTraefik: asBoolean(rawK3s.disableTraefik) ?? DEFAULT_CONFIG.k3s.disableTraefik,
  }

  const tunnelPolicy: CloudTunnelPolicy = {
    manage: asBoolean(rawTunnelPolicy.manage) ?? DEFAULT_CONFIG.tunnelPolicy.manage,
    target: rawTunnelPolicy.target === "kubernetes_api"
      ? "kubernetes_api"
      : DEFAULT_CONFIG.tunnelPolicy.target,
    localPort: asPort(rawTunnelPolicy.localPort) || DEFAULT_CONFIG.tunnelPolicy.localPort,
  }

  return {
    provider,
    cluster,
    stackMode,
    k3s,
    tunnelPolicy,
    sshKeyId: asNonEmptyString(raw.sshKeyId),
  }
}

export function readCloudProviderConfig(rawConfig: unknown): CloudProviderConfig | null {
  const config = asRecord(rawConfig)
  const cloudProvider = config.cloudProvider
  if (!cloudProvider || typeof cloudProvider !== "object" || Array.isArray(cloudProvider)) {
    return null
  }

  return normalizeCloudProviderConfig(cloudProvider)
}

export function withNormalizedCloudProviderInConfig(rawConfig: unknown): Record<string, unknown> {
  const config = asRecord(rawConfig)

  return {
    ...config,
    cloudProvider: normalizeCloudProviderConfig(config.cloudProvider),
  }
}

export function defaultCloudProviderConfig(): CloudProviderConfig {
  return {
    provider: DEFAULT_CONFIG.provider,
    cluster: {
      ...DEFAULT_CONFIG.cluster,
      controlPlane: { ...DEFAULT_CONFIG.cluster.controlPlane },
      workers: { ...DEFAULT_CONFIG.cluster.workers },
    },
    stackMode: DEFAULT_CONFIG.stackMode,
    k3s: { ...DEFAULT_CONFIG.k3s },
    tunnelPolicy: { ...DEFAULT_CONFIG.tunnelPolicy },
    sshKeyId: DEFAULT_CONFIG.sshKeyId,
  }
}
