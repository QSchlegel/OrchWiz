import {
  BRIDGE_CREW_ROLE_ORDER,
  isBridgeCrewRole,
  type BridgeCrewRole,
} from "@/lib/shipyard/bridge-crew"
import type {
  DeploymentProfile,
  InfrastructureConfig,
  NodeType,
  ProvisioningMode,
} from "@/lib/deployment/profile"
import {
  estimateShipBaseRequirements,
  type ShipBaseRequirementsEstimate,
} from "@/lib/shipyard/resource-estimation"
import {
  GROUP_ORDER,
  SUBSYSTEM_GROUP_CONFIG,
  USS_K8S_COMPONENTS,
  type ComponentType,
  type SubsystemGroup,
} from "@/lib/uss-k8s/topology"

export const SHIP_DEPLOYMENT_OVERVIEW_VERSION = "shipyard_overview_v1" as const

export type DeploymentOverviewWorkloadKind =
  | "logical"
  | "deployment"
  | "statefulset"
  | "daemonset"
  | "cron"

export type DeploymentOverviewProvisioningReality = "currently_provisioned" | "planned_only"

export type DeploymentOverviewRequirementCategory =
  | "infrastructure"
  | "credential"
  | "storage"
  | "network"
  | "integrations"

export type DeploymentOverviewRequirementStatus = "ready" | "warning" | "auto_generated"

export type DeploymentOverviewRequirementScope = "local" | "cluster" | "external"

interface ResourceAmount {
  cpuMillicores: number
  memoryMiB: number
}

export interface DeploymentOverviewComponent {
  id: string
  label: string
  sublabel: string
  group: SubsystemGroup
  groupLabel: string
  componentType: ComponentType
  workloadKind: DeploymentOverviewWorkloadKind
  provisioningReality: DeploymentOverviewProvisioningReality
  enabled: boolean
  replicaCount: number
  resources: ResourceAmount
  notes?: string
}

export interface DeploymentOverviewRequirement {
  id: string
  title: string
  description: string
  category: DeploymentOverviewRequirementCategory
  status: DeploymentOverviewRequirementStatus
  scope: DeploymentOverviewRequirementScope
  source: "user" | "derived" | "auto"
  value?: string
  secretRef?: string
  hints: string[]
}

export interface ShipDeploymentOverview {
  version: typeof SHIP_DEPLOYMENT_OVERVIEW_VERSION
  generatedAt: string
  coverage: "full_topology"
  topology: {
    groups: SubsystemGroup[]
    components: DeploymentOverviewComponent[]
    provisioningRealityNote: string
  }
  crewPolicy: {
    requiredRoles: BridgeCrewRole[]
    selectedRoles: BridgeCrewRole[]
    compliant: boolean
  }
  infrastructureTarget: {
    deploymentProfile: DeploymentProfile
    provisioningMode: ProvisioningMode
    nodeType: NodeType
    kind: InfrastructureConfig["kind"]
    kubeContext: string
    namespace: string
    terraformWorkspace: string
    terraformEnvDir: string
    ansibleInventory: string
    ansiblePlaybook: string
  }
  workloads: {
    plannedWorkloads: number
    plannedPods: number
    bridgeAgentPods: number
    runtimePods: number
    observabilityPods: number
    coreAppPods: number
  }
  resources: {
    baseline: ResourceAmount
    crew: ResourceAmount
    runtime: ResourceAmount
    observability: ResourceAmount
    totals: ResourceAmount
  }
  requirements: DeploymentOverviewRequirement[]
}

interface ComponentPlanDefaults {
  workloadKind: DeploymentOverviewWorkloadKind
  provisioningReality: DeploymentOverviewProvisioningReality
  replicaCount: number
  resources: ResourceAmount
  notes?: string
}

interface BuildShipDeploymentOverviewInput {
  deploymentProfile: DeploymentProfile
  provisioningMode: ProvisioningMode
  nodeType: NodeType
  infrastructure: InfrastructureConfig
  crewRoles: unknown
  generatedAt?: Date
  baseRequirementsEstimate?: ShipBaseRequirementsEstimate
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function parseNonNegativeInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return null
  }
  return value
}

function parseString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  const parsed: string[] = []
  for (const entry of value) {
    const item = parseString(entry)
    if (!item) {
      return null
    }
    parsed.push(item)
  }

  return parsed
}

function parseResourceAmount(value: unknown): ResourceAmount | null {
  const record = asRecord(value)
  if (!record) {
    return null
  }

  const cpuMillicores = parseNonNegativeInteger(record.cpuMillicores)
  const memoryMiB = parseNonNegativeInteger(record.memoryMiB)
  if (cpuMillicores === null || memoryMiB === null) {
    return null
  }

  return {
    cpuMillicores,
    memoryMiB,
  }
}

function addResourceAmounts(a: ResourceAmount, b: ResourceAmount): ResourceAmount {
  return {
    cpuMillicores: a.cpuMillicores + b.cpuMillicores,
    memoryMiB: a.memoryMiB + b.memoryMiB,
  }
}

function uniqueCrewRoles(input: unknown): BridgeCrewRole[] {
  if (!Array.isArray(input)) {
    return []
  }

  const roleSet = new Set<BridgeCrewRole>()
  for (const entry of input) {
    if (isBridgeCrewRole(entry)) {
      roleSet.add(entry)
    }
  }

  return BRIDGE_CREW_ROLE_ORDER.filter((role) => roleSet.has(role))
}

const BASE_COMPONENT_DEFAULTS: Record<string, Omit<ComponentPlanDefaults, "replicaCount"> & {
  replicaCount: number | ((profile: DeploymentProfile, roleEnabled: boolean) => number)
}> = {
  qs: {
    workloadKind: "logical",
    provisioningReality: "currently_provisioned",
    replicaCount: 0,
    resources: { cpuMillicores: 0, memoryMiB: 0 },
    notes: "Operator surface is represented inside the main OrchWiz application.",
  },
  ui: {
    workloadKind: "logical",
    provisioningReality: "currently_provisioned",
    replicaCount: 0,
    resources: { cpuMillicores: 0, memoryMiB: 0 },
    notes: "UI surface runs with the main OrchWiz web application.",
  },
  xo: {
    workloadKind: "deployment",
    provisioningReality: "planned_only",
    replicaCount: (_profile, roleEnabled) => (roleEnabled ? 1 : 0),
    resources: { cpuMillicores: 100, memoryMiB: 128 },
  },
  ops: {
    workloadKind: "deployment",
    provisioningReality: "planned_only",
    replicaCount: (_profile, roleEnabled) => (roleEnabled ? 1 : 0),
    resources: { cpuMillicores: 150, memoryMiB: 192 },
  },
  eng: {
    workloadKind: "deployment",
    provisioningReality: "planned_only",
    replicaCount: (_profile, roleEnabled) => (roleEnabled ? 1 : 0),
    resources: { cpuMillicores: 150, memoryMiB: 192 },
  },
  sec: {
    workloadKind: "deployment",
    provisioningReality: "planned_only",
    replicaCount: (_profile, roleEnabled) => (roleEnabled ? 1 : 0),
    resources: { cpuMillicores: 125, memoryMiB: 160 },
  },
  med: {
    workloadKind: "deployment",
    provisioningReality: "planned_only",
    replicaCount: (_profile, roleEnabled) => (roleEnabled ? 1 : 0),
    resources: { cpuMillicores: 100, memoryMiB: 128 },
  },
  cou: {
    workloadKind: "deployment",
    provisioningReality: "planned_only",
    replicaCount: (_profile, roleEnabled) => (roleEnabled ? 1 : 0),
    resources: { cpuMillicores: 75, memoryMiB: 96 },
  },
  gw: {
    workloadKind: "deployment",
    provisioningReality: "planned_only",
    replicaCount: 1,
    resources: { cpuMillicores: 200, memoryMiB: 256 },
  },
  cron: {
    workloadKind: "cron",
    provisioningReality: "planned_only",
    replicaCount: 1,
    resources: { cpuMillicores: 50, memoryMiB: 96 },
  },
  state: {
    workloadKind: "statefulset",
    provisioningReality: "planned_only",
    replicaCount: 1,
    resources: { cpuMillicores: 100, memoryMiB: 128 },
  },
  lf: {
    workloadKind: "deployment",
    provisioningReality: "planned_only",
    replicaCount: 1,
    resources: { cpuMillicores: 150, memoryMiB: 256 },
  },
  ch: {
    workloadKind: "statefulset",
    provisioningReality: "planned_only",
    replicaCount: 1,
    resources: { cpuMillicores: 300, memoryMiB: 512 },
  },
  loki: {
    workloadKind: "statefulset",
    provisioningReality: "planned_only",
    replicaCount: 1,
    resources: { cpuMillicores: 150, memoryMiB: 256 },
  },
  prom: {
    workloadKind: "statefulset",
    provisioningReality: "planned_only",
    replicaCount: 1,
    resources: { cpuMillicores: 150, memoryMiB: 256 },
  },
  graf: {
    workloadKind: "deployment",
    provisioningReality: "planned_only",
    replicaCount: 1,
    resources: { cpuMillicores: 100, memoryMiB: 192 },
  },
  evt: {
    workloadKind: "daemonset",
    provisioningReality: "planned_only",
    replicaCount: 1,
    resources: { cpuMillicores: 50, memoryMiB: 96 },
  },
  app: {
    workloadKind: "deployment",
    provisioningReality: "currently_provisioned",
    replicaCount: (profile) => (profile === "cloud_shipyard" ? 2 : 1),
    resources: { cpuMillicores: 0, memoryMiB: 0 },
    notes: "Core app sizing is accounted for in baseline resources.",
  },
  nodes: {
    workloadKind: "logical",
    provisioningReality: "currently_provisioned",
    replicaCount: 0,
    resources: { cpuMillicores: 0, memoryMiB: 0 },
    notes: "Cluster node capacity is external to the launch spec.",
  },
}

function componentDefaultsFor(
  id: string,
  deploymentProfile: DeploymentProfile,
  roleEnabled: boolean,
): ComponentPlanDefaults {
  const defaults = BASE_COMPONENT_DEFAULTS[id]
  if (!defaults) {
    return {
      workloadKind: "logical",
      provisioningReality: "planned_only",
      replicaCount: 0,
      resources: { cpuMillicores: 0, memoryMiB: 0 },
    }
  }

  const replicaCount =
    typeof defaults.replicaCount === "function"
      ? defaults.replicaCount(deploymentProfile, roleEnabled)
      : defaults.replicaCount

  return {
    workloadKind: defaults.workloadKind,
    provisioningReality: defaults.provisioningReality,
    replicaCount,
    resources: defaults.resources,
    ...(defaults.notes ? { notes: defaults.notes } : {}),
  }
}

function buildRequirements(input: {
  deploymentProfile: DeploymentProfile
  infrastructure: InfrastructureConfig
}): DeploymentOverviewRequirement[] {
  const requirements: DeploymentOverviewRequirement[] = [
    {
      id: "infra.kubeContext",
      title: "Kubernetes context",
      description: "Target kube context is set for this launch profile.",
      category: "infrastructure",
      status: "ready",
      scope: "cluster",
      source: "user",
      value: input.infrastructure.kubeContext,
      hints: ["Verify current kube context access before launch."],
    },
    {
      id: "infra.namespace",
      title: "Namespace target",
      description: "Namespace is resolved for Terraform + Ansible execution.",
      category: "infrastructure",
      status: "ready",
      scope: "cluster",
      source: "user",
      value: input.infrastructure.namespace,
      hints: ["Ensure RBAC permissions allow writes in this namespace."],
    },
    {
      id: "storage.clickhouse",
      title: "ClickHouse persistent volume",
      description: "ClickHouse requires durable storage class allocation.",
      category: "storage",
      status: "warning",
      scope: "cluster",
      source: "derived",
      hints: [
        "Confirm default StorageClass availability.",
        "Set retention and volume sizing policy for analytics data.",
      ],
    },
    {
      id: "storage.loki",
      title: "Loki persistent volume",
      description: "Loki log retention depends on persistent storage.",
      category: "storage",
      status: "warning",
      scope: "cluster",
      source: "derived",
      hints: [
        "Provision storage for expected log ingestion rate.",
        "Set retention windows consistent with compliance policy.",
      ],
    },
    {
      id: "storage.prometheus",
      title: "Prometheus persistent volume",
      description: "Prometheus metrics history requires persistent storage.",
      category: "storage",
      status: "warning",
      scope: "cluster",
      source: "derived",
      hints: [
        "Define scrape retention and disk sizing.",
        "Validate StatefulSet PVC binding in target namespace.",
      ],
    },
    {
      id: "credential.auth",
      title: "BETTER_AUTH_SECRET",
      description: "Generated local secret reference for auth signing.",
      category: "credential",
      status: "auto_generated",
      scope: "local",
      source: "auto",
      secretRef: `${input.infrastructure.namespace}/orchwiz-generated-auth-secret`,
      hints: ["Rotate this generated secret for production workloads."],
    },
    {
      id: "credential.runtimeSigning",
      title: "OpenClaw runtime signing key",
      description: "Generated local signing key reference for runtime integrity.",
      category: "credential",
      status: "auto_generated",
      scope: "local",
      source: "auto",
      secretRef: `${input.infrastructure.namespace}/orchwiz-runtime-signing-key`,
      hints: ["Pin runtime identity and rotate periodically."],
    },
    {
      id: "credential.privateMemory",
      title: "Private memory encryption key",
      description: "Generated local key reference for encrypted private memory.",
      category: "credential",
      status: "auto_generated",
      scope: "local",
      source: "auto",
      secretRef: `${input.infrastructure.namespace}/orchwiz-private-memory-key`,
      hints: ["Keep key scope limited to runtime containers."],
    },
    {
      id: "integration.githubOAuth",
      title: "GitHub OAuth client credentials (optional)",
      description: "External OAuth credentials are optional unless GitHub integrations are enabled.",
      category: "integrations",
      status: "ready",
      scope: "external",
      source: "derived",
      hints: [
        "Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET only when enabling GitHub integrations.",
        "If configured, confirm callback URL matches deployment domain.",
      ],
    },
    {
      id: "integration.modelProvider",
      title: "Runtime model provider credentials",
      description: "External model/tool provider credentials are not auto-generated.",
      category: "integrations",
      status: "warning",
      scope: "external",
      source: "derived",
      hints: [
        "Configure provider API keys in secrets manager.",
        "Validate egress/network policy for provider endpoints.",
      ],
    },
    {
      id: "network.serviceExposure",
      title: "Service exposure posture",
      description:
        input.deploymentProfile === "cloud_shipyard"
          ? "Cloud profile requires ingress/TLS exposure planning."
          : "Local profile access is expected through port-forward or minikube service.",
      category: "network",
      status: input.deploymentProfile === "cloud_shipyard" ? "warning" : "ready",
      scope: "cluster",
      source: "derived",
      hints:
        input.deploymentProfile === "cloud_shipyard"
          ? [
              "Define ingress host and TLS termination.",
              "Confirm network policy and load balancer routing.",
            ]
          : ["Use kubectl port-forward or minikube service for local access."],
    },
    {
      id: "scope.currentProvisioning",
      title: "Provisioning reality",
      description:
        "Current Terraform/Ansible modules provision core app infrastructure; bridge runtime and observability components are represented as planned topology in this overview.",
      category: "infrastructure",
      status: "warning",
      scope: "cluster",
      source: "derived",
      hints: ["Treat planned components as target-state design until infra modules are expanded."],
    },
  ]

  return requirements
}

export function hasCompleteBridgeCrewCoverage(crewRoles: unknown): boolean {
  const selectedRoles = uniqueCrewRoles(crewRoles)
  if (selectedRoles.length !== BRIDGE_CREW_ROLE_ORDER.length) {
    return false
  }
  return BRIDGE_CREW_ROLE_ORDER.every((role) => selectedRoles.includes(role))
}

function categoryForGroup(group: SubsystemGroup): "bridge" | "runtime" | "observability" | "other" {
  if (group === "bridge") {
    return "bridge"
  }
  if (group === "openclaw") {
    return "runtime"
  }
  if (group === "obs") {
    return "observability"
  }
  return "other"
}

export function buildShipDeploymentOverview(input: BuildShipDeploymentOverviewInput): ShipDeploymentOverview {
  const selectedRoles = uniqueCrewRoles(input.crewRoles)
  const baseRequirementsEstimate =
    input.baseRequirementsEstimate ||
    estimateShipBaseRequirements({
      deploymentProfile: input.deploymentProfile,
      crewRoles: selectedRoles,
    })

  const crewRoleSet = new Set<BridgeCrewRole>(selectedRoles)

  const components = USS_K8S_COMPONENTS.map<DeploymentOverviewComponent>((component) => {
    const roleEnabled = isBridgeCrewRole(component.id) ? crewRoleSet.has(component.id) : true
    const defaults = componentDefaultsFor(component.id, input.deploymentProfile, roleEnabled)

    return {
      id: component.id,
      label: component.label,
      sublabel: component.sublabel || "",
      group: component.group,
      groupLabel: SUBSYSTEM_GROUP_CONFIG[component.group]?.label || component.group,
      componentType: component.componentType,
      workloadKind: defaults.workloadKind,
      provisioningReality: defaults.provisioningReality,
      enabled: roleEnabled,
      replicaCount: defaults.replicaCount,
      resources: defaults.resources,
      ...(defaults.notes ? { notes: defaults.notes } : {}),
    }
  })

  const workloadComponents = components.filter((component) => component.workloadKind !== "logical" && component.enabled)

  const bridgeAgentPods = workloadComponents
    .filter((component) => categoryForGroup(component.group) === "bridge")
    .reduce((sum, component) => sum + component.replicaCount, 0)
  const runtimePods = workloadComponents
    .filter((component) => categoryForGroup(component.group) === "runtime")
    .reduce((sum, component) => sum + component.replicaCount, 0)
  const observabilityPods = workloadComponents
    .filter((component) => categoryForGroup(component.group) === "observability")
    .reduce((sum, component) => sum + component.replicaCount, 0)
  const coreAppPods = workloadComponents
    .filter((component) => component.id === "app")
    .reduce((sum, component) => sum + component.replicaCount, 0)

  const runtimeResources = workloadComponents
    .filter((component) => categoryForGroup(component.group) === "runtime")
    .reduce<ResourceAmount>(
      (sum, component) =>
        addResourceAmounts(sum, {
          cpuMillicores: component.resources.cpuMillicores * component.replicaCount,
          memoryMiB: component.resources.memoryMiB * component.replicaCount,
        }),
      { cpuMillicores: 0, memoryMiB: 0 },
    )

  const observabilityResources = workloadComponents
    .filter((component) => categoryForGroup(component.group) === "observability")
    .reduce<ResourceAmount>(
      (sum, component) =>
        addResourceAmounts(sum, {
          cpuMillicores: component.resources.cpuMillicores * component.replicaCount,
          memoryMiB: component.resources.memoryMiB * component.replicaCount,
        }),
      { cpuMillicores: 0, memoryMiB: 0 },
    )

  return {
    version: SHIP_DEPLOYMENT_OVERVIEW_VERSION,
    generatedAt: (input.generatedAt || new Date()).toISOString(),
    coverage: "full_topology",
    topology: {
      groups: GROUP_ORDER,
      components,
      provisioningRealityNote:
        "Core app infrastructure is currently provisioned; bridge runtime and observability elements remain planned topology in this phase.",
    },
    crewPolicy: {
      requiredRoles: [...BRIDGE_CREW_ROLE_ORDER],
      selectedRoles,
      compliant: hasCompleteBridgeCrewCoverage(selectedRoles),
    },
    infrastructureTarget: {
      deploymentProfile: input.deploymentProfile,
      provisioningMode: input.provisioningMode,
      nodeType: input.nodeType,
      kind: input.infrastructure.kind,
      kubeContext: input.infrastructure.kubeContext,
      namespace: input.infrastructure.namespace,
      terraformWorkspace: input.infrastructure.terraformWorkspace,
      terraformEnvDir: input.infrastructure.terraformEnvDir,
      ansibleInventory: input.infrastructure.ansibleInventory,
      ansiblePlaybook: input.infrastructure.ansiblePlaybook,
    },
    workloads: {
      plannedWorkloads: workloadComponents.length,
      plannedPods: workloadComponents.reduce((sum, component) => sum + component.replicaCount, 0),
      bridgeAgentPods,
      runtimePods,
      observabilityPods,
      coreAppPods,
    },
    resources: {
      baseline: baseRequirementsEstimate.baseline,
      crew: baseRequirementsEstimate.crew.totals,
      runtime: runtimeResources,
      observability: observabilityResources,
      totals: addResourceAmounts(
        addResourceAmounts(
          addResourceAmounts(baseRequirementsEstimate.baseline, baseRequirementsEstimate.crew.totals),
          runtimeResources,
        ),
        observabilityResources,
      ),
    },
    requirements: buildRequirements({
      deploymentProfile: input.deploymentProfile,
      infrastructure: input.infrastructure,
    }),
  }
}

export function readShipDeploymentOverview(metadata: unknown): ShipDeploymentOverview | null {
  const metadataRecord = asRecord(metadata)
  if (!metadataRecord) {
    return null
  }

  const candidate =
    "deploymentOverview" in metadataRecord
      ? metadataRecord.deploymentOverview
      : metadataRecord

  const overview = asRecord(candidate)
  if (!overview) {
    return null
  }

  if (overview.version !== SHIP_DEPLOYMENT_OVERVIEW_VERSION) {
    return null
  }

  if (overview.coverage !== "full_topology") {
    return null
  }

  const generatedAt = parseString(overview.generatedAt)
  if (!generatedAt) {
    return null
  }

  const topology = asRecord(overview.topology)
  const crewPolicy = asRecord(overview.crewPolicy)
  const infrastructureTarget = asRecord(overview.infrastructureTarget)
  const workloads = asRecord(overview.workloads)
  const resources = asRecord(overview.resources)

  if (!topology || !crewPolicy || !infrastructureTarget || !workloads || !resources) {
    return null
  }

  const groups = parseStringArray(topology.groups)
  if (!groups) {
    return null
  }

  const componentsRaw = Array.isArray(topology.components) ? topology.components : null
  if (!componentsRaw) {
    return null
  }

  const components: DeploymentOverviewComponent[] = []
  for (const entry of componentsRaw) {
    const component = asRecord(entry)
    if (!component) {
      return null
    }

    const id = parseString(component.id)
    const label = parseString(component.label)
    const sublabel = parseString(component.sublabel) || ""
    const group = parseString(component.group)
    const groupLabel = parseString(component.groupLabel)
    const componentType = parseString(component.componentType)
    const workloadKind = parseString(component.workloadKind)
    const provisioningReality = parseString(component.provisioningReality)
    const enabled = typeof component.enabled === "boolean" ? component.enabled : null
    const replicaCount = parseNonNegativeInteger(component.replicaCount)
    const resourceAmount = parseResourceAmount(component.resources)

    if (
      !id ||
      !label ||
      !group ||
      !groupLabel ||
      !componentType ||
      !workloadKind ||
      !provisioningReality ||
      enabled === null ||
      replicaCount === null ||
      !resourceAmount
    ) {
      return null
    }

    components.push({
      id,
      label,
      sublabel,
      group: group as SubsystemGroup,
      groupLabel,
      componentType: componentType as ComponentType,
      workloadKind: workloadKind as DeploymentOverviewWorkloadKind,
      provisioningReality: provisioningReality as DeploymentOverviewProvisioningReality,
      enabled,
      replicaCount,
      resources: resourceAmount,
      ...(parseString(component.notes) ? { notes: parseString(component.notes) || undefined } : {}),
    })
  }

  const requiredRolesRaw = parseStringArray(crewPolicy.requiredRoles)
  const selectedRolesRaw = parseStringArray(crewPolicy.selectedRoles)
  const compliant = typeof crewPolicy.compliant === "boolean" ? crewPolicy.compliant : null
  if (!requiredRolesRaw || !selectedRolesRaw || compliant === null) {
    return null
  }

  const requiredRoles = requiredRolesRaw.filter((role): role is BridgeCrewRole => isBridgeCrewRole(role))
  const selectedRoles = selectedRolesRaw.filter((role): role is BridgeCrewRole => isBridgeCrewRole(role))

  const deploymentProfile = parseString(infrastructureTarget.deploymentProfile)
  const provisioningMode = parseString(infrastructureTarget.provisioningMode)
  const nodeType = parseString(infrastructureTarget.nodeType)
  const kind = parseString(infrastructureTarget.kind)
  const kubeContext = parseString(infrastructureTarget.kubeContext)
  const namespace = parseString(infrastructureTarget.namespace)
  const terraformWorkspace = parseString(infrastructureTarget.terraformWorkspace)
  const terraformEnvDir = parseString(infrastructureTarget.terraformEnvDir)
  const ansibleInventory = parseString(infrastructureTarget.ansibleInventory)
  const ansiblePlaybook = parseString(infrastructureTarget.ansiblePlaybook)

  if (
    !deploymentProfile ||
    !provisioningMode ||
    !nodeType ||
    !kind ||
    !kubeContext ||
    !namespace ||
    !terraformWorkspace ||
    !terraformEnvDir ||
    !ansibleInventory ||
    !ansiblePlaybook
  ) {
    return null
  }

  const plannedWorkloads = parseNonNegativeInteger(workloads.plannedWorkloads)
  const plannedPods = parseNonNegativeInteger(workloads.plannedPods)
  const bridgeAgentPods = parseNonNegativeInteger(workloads.bridgeAgentPods)
  const runtimePods = parseNonNegativeInteger(workloads.runtimePods)
  const observabilityPods = parseNonNegativeInteger(workloads.observabilityPods)
  const coreAppPods = parseNonNegativeInteger(workloads.coreAppPods)

  if (
    plannedWorkloads === null ||
    plannedPods === null ||
    bridgeAgentPods === null ||
    runtimePods === null ||
    observabilityPods === null ||
    coreAppPods === null
  ) {
    return null
  }

  const baseline = parseResourceAmount(resources.baseline)
  const crew = parseResourceAmount(resources.crew)
  const runtime = parseResourceAmount(resources.runtime)
  const observability = parseResourceAmount(resources.observability)
  const totals = parseResourceAmount(resources.totals)

  if (!baseline || !crew || !runtime || !observability || !totals) {
    return null
  }

  const requirementsRaw = Array.isArray(overview.requirements) ? overview.requirements : null
  if (!requirementsRaw) {
    return null
  }

  const requirements: DeploymentOverviewRequirement[] = []
  for (const entry of requirementsRaw) {
    const requirement = asRecord(entry)
    if (!requirement) {
      return null
    }

    const id = parseString(requirement.id)
    const title = parseString(requirement.title)
    const description = parseString(requirement.description)
    const category = parseString(requirement.category)
    const status = parseString(requirement.status)
    const scope = parseString(requirement.scope)
    const source = parseString(requirement.source)
    const hints = parseStringArray(requirement.hints)

    if (!id || !title || !description || !category || !status || !scope || !source || !hints) {
      return null
    }

    requirements.push({
      id,
      title,
      description,
      category: category as DeploymentOverviewRequirementCategory,
      status: status as DeploymentOverviewRequirementStatus,
      scope: scope as DeploymentOverviewRequirementScope,
      source: source as "user" | "derived" | "auto",
      ...(parseString(requirement.value) ? { value: parseString(requirement.value) || undefined } : {}),
      ...(parseString(requirement.secretRef)
        ? { secretRef: parseString(requirement.secretRef) || undefined }
        : {}),
      hints,
    })
  }

  const provisioningRealityNote = parseString(topology.provisioningRealityNote)
  if (!provisioningRealityNote) {
    return null
  }

  return {
    version: SHIP_DEPLOYMENT_OVERVIEW_VERSION,
    generatedAt,
    coverage: "full_topology",
    topology: {
      groups: groups as SubsystemGroup[],
      components,
      provisioningRealityNote,
    },
    crewPolicy: {
      requiredRoles,
      selectedRoles,
      compliant,
    },
    infrastructureTarget: {
      deploymentProfile: deploymentProfile as DeploymentProfile,
      provisioningMode: provisioningMode as ProvisioningMode,
      nodeType: nodeType as NodeType,
      kind: kind as InfrastructureConfig["kind"],
      kubeContext,
      namespace,
      terraformWorkspace,
      terraformEnvDir,
      ansibleInventory,
      ansiblePlaybook,
    },
    workloads: {
      plannedWorkloads,
      plannedPods,
      bridgeAgentPods,
      runtimePods,
      observabilityPods,
      coreAppPods,
    },
    resources: {
      baseline,
      crew,
      runtime,
      observability,
      totals,
    },
    requirements,
  }
}
