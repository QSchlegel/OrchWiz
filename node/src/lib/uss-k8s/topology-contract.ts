import {
  GROUP_ORDER,
  SUBSYSTEM_GROUP_CONFIG,
  USS_K8S_COMMAND_HIERARCHY,
  USS_K8S_COMPONENTS,
  USS_K8S_EDGES,
  type CommandHierarchyTier,
  type ComponentType,
  type EdgeType,
  type SubsystemEdge,
  type SubsystemGroup,
  type TopologyComponent,
} from "./topology"

export type ShipSelectorStatus = "pending" | "deploying" | "active" | "inactive" | "failed" | "updating"
export type ShipSelectorNodeType = "local" | "cloud" | "hybrid"
export type ShipSelectorDeploymentProfile = "local_starship_build" | "cloud_shipyard"
export type KubeviewSource = "terraform_output" | "fallback" | "unavailable"

export interface ShipSelectorItem {
  id: string
  name: string
  status: ShipSelectorStatus
  nodeId: string
  nodeType: ShipSelectorNodeType
  deploymentProfile: ShipSelectorDeploymentProfile
}

export interface KubeviewAccess {
  enabled: boolean
  ingressEnabled: boolean
  url: string | null
  source: KubeviewSource
  reason: string | null
}

export interface ParsedUssK8sTopologyResponse {
  components: TopologyComponent[]
  edges: SubsystemEdge[]
  groups: Record<SubsystemGroup, { label: string; color: string; bgColor: string; borderColor: string }>
  groupOrder: SubsystemGroup[]
  commandHierarchy: CommandHierarchyTier[]
  availableShips: ShipSelectorItem[]
  kubeview: KubeviewAccess
  selectedShipDeploymentId: string | null
  generatedAt: string | null
}

const SUBSYSTEM_GROUPS = new Set<SubsystemGroup>(["users", "bridge", "openclaw", "obs", "k8s"])
const COMPONENT_TYPES = new Set<ComponentType>(["operator", "agent", "runtime", "observability", "k8s-workload", "ui"])
const EDGE_TYPES = new Set<EdgeType>(["data", "control", "telemetry", "alert"])
const SHIP_STATUSES = new Set<ShipSelectorStatus>(["pending", "deploying", "active", "inactive", "failed", "updating"])
const SHIP_NODE_TYPES = new Set<ShipSelectorNodeType>(["local", "cloud", "hybrid"])
const SHIP_DEPLOYMENT_PROFILES = new Set<ShipSelectorDeploymentProfile>(["local_starship_build", "cloud_shipyard"])
const KUBEVIEW_SOURCES = new Set<KubeviewSource>(["terraform_output", "fallback", "unavailable"])

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
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

function cloneGroupConfig(
  input: Record<SubsystemGroup, { label: string; color: string; bgColor: string; borderColor: string }>,
): Record<SubsystemGroup, { label: string; color: string; bgColor: string; borderColor: string }> {
  return {
    users: { ...input.users },
    bridge: { ...input.bridge },
    openclaw: { ...input.openclaw },
    obs: { ...input.obs },
    k8s: { ...input.k8s },
  }
}

function parseGroup(value: unknown): SubsystemGroup | null {
  if (typeof value !== "string") {
    return null
  }

  return SUBSYSTEM_GROUPS.has(value as SubsystemGroup) ? (value as SubsystemGroup) : null
}

function parseComponentType(value: unknown): ComponentType | null {
  if (typeof value !== "string") {
    return null
  }

  return COMPONENT_TYPES.has(value as ComponentType) ? (value as ComponentType) : null
}

function parseEdgeType(value: unknown): EdgeType | null {
  if (typeof value !== "string") {
    return null
  }

  return EDGE_TYPES.has(value as EdgeType) ? (value as EdgeType) : null
}

function parseComponents(value: unknown): TopologyComponent[] {
  if (!Array.isArray(value)) {
    return USS_K8S_COMPONENTS.map((component) => ({ ...component }))
  }

  const parsed: TopologyComponent[] = []

  for (const entry of value) {
    const record = asRecord(entry)
    if (!record) {
      continue
    }

    const id = asNonEmptyString(record.id)
    const label = asNonEmptyString(record.label)
    const group = parseGroup(record.group)
    const componentType = parseComponentType(record.componentType)

    if (!id || !label || !group || !componentType) {
      continue
    }

    parsed.push({
      id,
      label,
      group,
      componentType,
      ...(asNonEmptyString(record.sublabel) ? { sublabel: asNonEmptyString(record.sublabel) || undefined } : {}),
      ...(asNonEmptyString(record.subagentId) ? { subagentId: asNonEmptyString(record.subagentId) || undefined } : {}),
      ...(asNonEmptyString(record.subagentName) ? { subagentName: asNonEmptyString(record.subagentName) || undefined } : {}),
      ...(asNonEmptyString(record.subagentDescription)
        ? { subagentDescription: asNonEmptyString(record.subagentDescription) || undefined }
        : {}),
      ...(typeof record.status === "string" ? { status: record.status } : {}),
    })
  }

  return parsed
}

function parseEdges(value: unknown): SubsystemEdge[] {
  if (!Array.isArray(value)) {
    return USS_K8S_EDGES.map((edge) => ({ ...edge }))
  }

  const parsed: SubsystemEdge[] = []

  for (const entry of value) {
    const record = asRecord(entry)
    if (!record) {
      continue
    }

    const source = asNonEmptyString(record.source)
    const target = asNonEmptyString(record.target)
    const edgeType = parseEdgeType(record.edgeType)

    if (!source || !target || !edgeType) {
      continue
    }

    parsed.push({
      source,
      target,
      edgeType,
      ...(asNonEmptyString(record.label) ? { label: asNonEmptyString(record.label) || undefined } : {}),
      ...(typeof record.animated === "boolean" ? { animated: record.animated } : {}),
    })
  }

  return parsed
}

function parseGroups(value: unknown): Record<SubsystemGroup, { label: string; color: string; bgColor: string; borderColor: string }> {
  const fallback = cloneGroupConfig(SUBSYSTEM_GROUP_CONFIG)
  const record = asRecord(value)
  if (!record) {
    return fallback
  }

  for (const group of GROUP_ORDER) {
    const configRecord = asRecord(record[group])
    if (!configRecord) {
      continue
    }

    fallback[group] = {
      label: asNonEmptyString(configRecord.label) || fallback[group].label,
      color: asNonEmptyString(configRecord.color) || fallback[group].color,
      bgColor: asNonEmptyString(configRecord.bgColor) || fallback[group].bgColor,
      borderColor: asNonEmptyString(configRecord.borderColor) || fallback[group].borderColor,
    }
  }

  return fallback
}

function parseGroupOrder(value: unknown): SubsystemGroup[] {
  if (!Array.isArray(value)) {
    return [...GROUP_ORDER]
  }

  const deduped: SubsystemGroup[] = []
  for (const entry of value) {
    const group = parseGroup(entry)
    if (!group || deduped.includes(group)) {
      continue
    }
    deduped.push(group)
  }

  for (const fallbackGroup of GROUP_ORDER) {
    if (!deduped.includes(fallbackGroup)) {
      deduped.push(fallbackGroup)
    }
  }

  return deduped
}

function parseCommandHierarchy(value: unknown): CommandHierarchyTier[] {
  if (!Array.isArray(value)) {
    return USS_K8S_COMMAND_HIERARCHY.map((tier) => ({ ...tier, nodeIds: [...tier.nodeIds] }))
  }

  const parsed: CommandHierarchyTier[] = []

  for (const entry of value) {
    const record = asRecord(entry)
    if (!record) {
      continue
    }

    const tier = typeof record.tier === "number" && Number.isFinite(record.tier)
      ? Math.max(1, Math.floor(record.tier))
      : null
    const label = asNonEmptyString(record.label)
    const description = asNonEmptyString(record.description)
    const nodeIds = Array.isArray(record.nodeIds)
      ? record.nodeIds
          .map((nodeId) => asNonEmptyString(nodeId))
          .filter((nodeId): nodeId is string => Boolean(nodeId))
      : []

    if (!tier || !label || !description || nodeIds.length === 0) {
      continue
    }

    parsed.push({
      tier,
      label,
      description,
      nodeIds,
    })
  }

  if (parsed.length === 0) {
    return USS_K8S_COMMAND_HIERARCHY.map((tier) => ({ ...tier, nodeIds: [...tier.nodeIds] }))
  }

  return parsed.sort((left, right) => left.tier - right.tier)
}

function parseShipStatus(value: unknown): ShipSelectorStatus | null {
  if (typeof value !== "string") {
    return null
  }
  return SHIP_STATUSES.has(value as ShipSelectorStatus) ? (value as ShipSelectorStatus) : null
}

function parseShipNodeType(value: unknown): ShipSelectorNodeType | null {
  if (typeof value !== "string") {
    return null
  }
  return SHIP_NODE_TYPES.has(value as ShipSelectorNodeType) ? (value as ShipSelectorNodeType) : null
}

function parseShipDeploymentProfile(value: unknown): ShipSelectorDeploymentProfile | null {
  if (typeof value !== "string") {
    return null
  }
  return SHIP_DEPLOYMENT_PROFILES.has(value as ShipSelectorDeploymentProfile)
    ? (value as ShipSelectorDeploymentProfile)
    : null
}

function parseAvailableShips(value: unknown): ShipSelectorItem[] {
  if (!Array.isArray(value)) {
    return []
  }

  const parsed: ShipSelectorItem[] = []

  for (const entry of value) {
    const record = asRecord(entry)
    if (!record) {
      continue
    }

    const id = asNonEmptyString(record.id)
    const name = asNonEmptyString(record.name)
    const status = parseShipStatus(record.status)
    const nodeType = parseShipNodeType(record.nodeType)
    const deploymentProfile = parseShipDeploymentProfile(record.deploymentProfile)

    if (!id || !name || !status || !nodeType || !deploymentProfile) {
      continue
    }

    parsed.push({
      id,
      name,
      status,
      nodeId: asNonEmptyString(record.nodeId) || "",
      nodeType,
      deploymentProfile,
    })
  }

  return parsed
}

function parseGeneratedAt(value: unknown): string | null {
  const generatedAt = asNonEmptyString(value)
  if (!generatedAt) {
    return null
  }

  const timestamp = Date.parse(generatedAt)
  return Number.isNaN(timestamp) ? null : generatedAt
}

function parseKubeview(value: unknown): KubeviewAccess {
  const fallback: KubeviewAccess = {
    enabled: false,
    ingressEnabled: false,
    url: null,
    source: "unavailable",
    reason: "KubeView data unavailable.",
  }

  const record = asRecord(value)
  if (!record) {
    return fallback
  }

  const source = typeof record.source === "string" && KUBEVIEW_SOURCES.has(record.source as KubeviewSource)
    ? (record.source as KubeviewSource)
    : fallback.source
  const url = asNonEmptyString(record.url)
  const reason = asNonEmptyString(record.reason)

  return {
    enabled: typeof record.enabled === "boolean" ? record.enabled : fallback.enabled,
    ingressEnabled: typeof record.ingressEnabled === "boolean" ? record.ingressEnabled : fallback.ingressEnabled,
    url,
    source,
    reason: url ? null : (reason || fallback.reason),
  }
}

export function parseUssK8sTopologyResponse(value: unknown): ParsedUssK8sTopologyResponse {
  const record = asRecord(value)

  if (!record) {
    return {
      components: USS_K8S_COMPONENTS.map((component) => ({ ...component })),
      edges: USS_K8S_EDGES.map((edge) => ({ ...edge })),
      groups: cloneGroupConfig(SUBSYSTEM_GROUP_CONFIG),
      groupOrder: [...GROUP_ORDER],
      commandHierarchy: USS_K8S_COMMAND_HIERARCHY.map((tier) => ({ ...tier, nodeIds: [...tier.nodeIds] })),
      availableShips: [],
      kubeview: parseKubeview(null),
      selectedShipDeploymentId: null,
      generatedAt: null,
    }
  }

  return {
    components: parseComponents(record.components),
    edges: parseEdges(record.edges),
    groups: parseGroups(record.groups),
    groupOrder: parseGroupOrder(record.groupOrder),
    commandHierarchy: parseCommandHierarchy(record.commandHierarchy),
    availableShips: parseAvailableShips(record.availableShips),
    kubeview: parseKubeview(record.kubeview),
    selectedShipDeploymentId: asNonEmptyString(record.selectedShipDeploymentId),
    generatedAt: parseGeneratedAt(record.generatedAt),
  }
}
