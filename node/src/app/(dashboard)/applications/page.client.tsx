"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Activity,
  AlertCircle,
  Box,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cloud,
  Code,
  Container,
  Copy,
  ExternalLink,
  FileCode,
  GitBranch,
  HardDrive,
  Hash,
  Layers,
  Network,
  Package,
  Play,
  RefreshCw,
  Search,
  Settings2,
  Square,
  Trash2,
  X,
} from "lucide-react"
import type { Node } from "reactflow"
import Link from "next/link"
import { OrchestrationSurface } from "@/components/orchestration/OrchestrationSurface"
import { UseCaseBadge, NodeInfoCard } from "@/components/orchestration/NodeInfoCard"
import { FlowCanvas } from "@/components/flow/FlowCanvas"
import { ApplicationNode, SystemNode } from "@/components/flow/nodes"
import { layoutColumns } from "@/lib/flow/layout"
import { buildEdgesToAnchors, mapAnchorsToNodes, mapApplicationsToNodes } from "@/lib/flow/mappers"
import { useEventStream } from "@/lib/realtime/useEventStream"
import {
  parseRuntimeNodeMetricsPayload,
  RUNTIME_NODE_METRICS_EVENT_TYPE,
  type RuntimeNodeMetricsPayload,
} from "@/lib/runtime/realtime-node-metrics"
import { useShipSelection } from "@/lib/shipyard/useShipSelection"
import {
  computeApplicationSummary,
  filterApplications,
  getApplicationActionCapability,
  resolveApplicationPatchUiUrl,
  resolveSelectedApplicationId,
  type ApplicationListItem,
  type ApplicationViewFilters,
} from "@/lib/applications/view-model"

type DeploymentProfile = "local_starship_build" | "cloud_shipyard"
type ProvisioningMode = "terraform_ansible" | "terraform_only" | "ansible_only"
type NodeType = "local" | "cloud" | "hybrid"
type InfrastructureKind = "kind" | "minikube" | "existing_k8s"

interface InfrastructureConfig {
  kind: InfrastructureKind
  kubeContext: string
  namespace: string
  terraformWorkspace: string
  terraformEnvDir: string
  ansibleInventory: string
  ansiblePlaybook: string
}

interface ApplicationFormData {
  name: string
  description: string
  applicationType: Application["applicationType"]
  image: string
  repository: string
  branch: string
  buildCommand: string
  startCommand: string
  port: number
  environment: Record<string, unknown>
  shipDeploymentId: string
  nodeId: string
  nodeType: NodeType
  deploymentProfile: DeploymentProfile
  provisioningMode: ProvisioningMode
  advancedNodeTypeOverride: boolean
  infrastructure: InfrastructureConfig
  nodeUrl: string
  version: string
}

interface ShipSelectorItem {
  id: string
  name: string
  status: "pending" | "deploying" | "active" | "inactive" | "failed" | "updating"
  nodeId: string
  nodeType: NodeType
  nodeUrl: string | null
  deploymentProfile: DeploymentProfile
  provisioningMode: ProvisioningMode
  config: unknown
}

interface Application {
  id: string
  name: string
  description: string | null
  applicationType: "docker" | "nodejs" | "python" | "static" | "n8n" | "custom"
  image: string | null
  repository: string | null
  branch: string | null
  buildCommand: string | null
  startCommand: string | null
  port: number | null
  environment: Record<string, unknown>
  shipDeploymentId: string | null
  ship: {
    id: string
    name: string
    status: string
    nodeId: string
    nodeType: NodeType
    deploymentProfile: DeploymentProfile
  } | null
  nodeId: string
  nodeType: NodeType
  deploymentProfile: DeploymentProfile
  provisioningMode: ProvisioningMode
  nodeUrl: string | null
  status: "pending" | "deploying" | "active" | "inactive" | "failed" | "updating"
  config: unknown
  metadata: unknown
  deployedAt: string | null
  lastHealthCheck: string | null
  healthStatus: string | null
  version: string | null
  createdAt: string
}

interface Notice {
  type: "success" | "error" | "info"
  text: string
}

const deploymentProfileLabels: Record<DeploymentProfile, string> = {
  local_starship_build: "Local Starship Build",
  cloud_shipyard: "Cloud Shipyard",
}

const provisioningModeLabels: Record<ProvisioningMode, string> = {
  terraform_ansible: "Terraform + Ansible",
  terraform_only: "Terraform only",
  ansible_only: "Ansible only",
}

const infrastructureKindLabels: Record<InfrastructureKind, string> = {
  kind: "KIND",
  minikube: "Minikube",
  existing_k8s: "Existing Kubernetes",
}

const statusConfig = {
  pending: {
    icon: RefreshCw,
    label: "Pending",
    color: "text-amber-700 dark:text-amber-300",
    bg: "bg-amber-500/15 dark:bg-amber-500/20",
    border: "border-amber-500/30",
    pulse: true,
  },
  deploying: {
    icon: Package,
    label: "Deploying",
    color: "text-blue-700 dark:text-blue-300",
    bg: "bg-blue-500/15 dark:bg-blue-500/20",
    border: "border-blue-500/30",
    pulse: true,
  },
  active: {
    icon: Activity,
    label: "Active",
    color: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-emerald-500/15 dark:bg-emerald-500/20",
    border: "border-emerald-500/30",
    pulse: false,
  },
  inactive: {
    icon: Square,
    label: "Inactive",
    color: "text-slate-700 dark:text-slate-300",
    bg: "bg-slate-500/12 dark:bg-slate-500/20",
    border: "border-slate-500/30",
    pulse: false,
  },
  failed: {
    icon: AlertCircle,
    label: "Failed",
    color: "text-rose-700 dark:text-rose-300",
    bg: "bg-rose-500/15 dark:bg-rose-500/20",
    border: "border-rose-500/30",
    pulse: false,
  },
  updating: {
    icon: Settings2,
    label: "Updating",
    color: "text-orange-700 dark:text-orange-300",
    bg: "bg-orange-500/15 dark:bg-orange-500/20",
    border: "border-orange-500/30",
    pulse: true,
  },
}

const appTypeConfig = {
  docker: {
    icon: Container,
    label: "Docker",
    color: "text-blue-700 dark:text-blue-300",
    bg: "bg-blue-500/15 dark:bg-blue-500/20",
    description: "Containerized application",
  },
  nodejs: {
    icon: Code,
    label: "Node.js",
    color: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-emerald-500/15 dark:bg-emerald-500/20",
    description: "JavaScript runtime application",
  },
  python: {
    icon: FileCode,
    label: "Python",
    color: "text-amber-700 dark:text-amber-300",
    bg: "bg-amber-500/15 dark:bg-amber-500/20",
    description: "Python application",
  },
  static: {
    icon: Layers,
    label: "Static",
    color: "text-violet-700 dark:text-violet-300",
    bg: "bg-violet-500/15 dark:bg-violet-500/20",
    description: "Static file hosting",
  },
  n8n: {
    icon: GitBranch,
    label: "n8n",
    color: "text-cyan-700 dark:text-cyan-300",
    bg: "bg-cyan-500/15 dark:bg-cyan-500/20",
    description: "Workflow orchestration runtime",
  },
  custom: {
    icon: Box,
    label: "Custom",
    color: "text-slate-700 dark:text-slate-300",
    bg: "bg-slate-500/12 dark:bg-slate-500/20",
    description: "Custom deployment",
  },
}

const nodeTypeConfig = {
  local: { icon: HardDrive, label: "Local", color: "text-violet-700 dark:text-violet-300" },
  cloud: { icon: Cloud, label: "Cloud", color: "text-sky-700 dark:text-sky-300" },
  hybrid: { icon: Network, label: "Hybrid", color: "text-pink-700 dark:text-pink-300" },
}

const nodeTypes = {
  applicationNode: ApplicationNode,
  systemNode: SystemNode,
}

const STATUS_FILTER_VALUES: Array<"all" | Application["status"]> = [
  "all",
  "pending",
  "deploying",
  "active",
  "inactive",
  "failed",
  "updating",
]

const APPLICATION_TYPE_FILTER_VALUES: Array<"all" | Application["applicationType"]> = [
  "all",
  "docker",
  "nodejs",
  "python",
  "static",
  "n8n",
  "custom",
]

const DEPLOY_APP_TYPE_ORDER: Application["applicationType"][] = [
  "docker",
  "nodejs",
  "python",
  "static",
  "n8n",
  "custom",
]

const NODE_TYPE_FILTER_VALUES: Array<"all" | NodeType> = ["all", "local", "cloud", "hybrid"]

function isInfrastructureKind(value: unknown): value is InfrastructureKind {
  return value === "kind" || value === "minikube" || value === "existing_k8s"
}

function kubeContextForKind(kind: InfrastructureKind): string {
  if (kind === "kind") return "kind-orchwiz"
  if (kind === "minikube") return "minikube"
  return "existing-cluster"
}

function defaultInfrastructure(profile: DeploymentProfile): InfrastructureConfig {
  if (profile === "cloud_shipyard") {
    return {
      kind: "existing_k8s",
      kubeContext: "existing-cluster",
      namespace: "orchwiz-shipyard",
      terraformWorkspace: "shipyard-cloud",
      terraformEnvDir: "infra/terraform/environments/shipyard-cloud",
      ansibleInventory: "infra/ansible/inventory/cloud.ini",
      ansiblePlaybook: "infra/ansible/playbooks/shipyard_cloud.yml",
    }
  }

  return {
    kind: "kind",
    kubeContext: "kind-orchwiz",
    namespace: "orchwiz-starship",
    terraformWorkspace: "starship-local",
    terraformEnvDir: "infra/terraform/environments/starship-local",
    ansibleInventory: "infra/ansible/inventory/local.ini",
    ansiblePlaybook: "infra/ansible/playbooks/starship_local.yml",
  }
}

function deriveNodeType(
  profile: DeploymentProfile,
  advancedNodeTypeOverride: boolean,
  requestedNodeType: NodeType,
): NodeType {
  if (profile === "local_starship_build") {
    return "local"
  }

  if (advancedNodeTypeOverride && requestedNodeType === "hybrid") {
    return "hybrid"
  }

  return "cloud"
}

function formatUptime(deployedAt: Date): string {
  const now = new Date()
  const diff = now.getTime() - deployedAt.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function extractInfrastructureConfig(
  config: unknown,
  deploymentProfile?: DeploymentProfile,
): InfrastructureConfig | null {
  if (!config || typeof config !== "object") {
    return null
  }

  const infrastructure = (config as Record<string, unknown>).infrastructure
  if (!infrastructure || typeof infrastructure !== "object") {
    return null
  }

  const raw = infrastructure as Record<string, unknown>
  const defaultConfig = defaultInfrastructure(deploymentProfile || "local_starship_build")
  const inferredKind = isInfrastructureKind(raw.kind)
    ? raw.kind
    : deploymentProfile === "cloud_shipyard"
      ? "existing_k8s"
      : typeof raw.kubeContext === "string" && raw.kubeContext.toLowerCase().includes("minikube")
        ? "minikube"
        : "kind"

  return {
    kind: inferredKind,
    kubeContext: typeof raw.kubeContext === "string" ? raw.kubeContext : kubeContextForKind(inferredKind),
    namespace: typeof raw.namespace === "string" ? raw.namespace : defaultConfig.namespace,
    terraformWorkspace:
      typeof raw.terraformWorkspace === "string"
        ? raw.terraformWorkspace
        : defaultConfig.terraformWorkspace,
    terraformEnvDir:
      typeof raw.terraformEnvDir === "string" ? raw.terraformEnvDir : defaultConfig.terraformEnvDir,
    ansibleInventory:
      typeof raw.ansibleInventory === "string" ? raw.ansibleInventory : defaultConfig.ansibleInventory,
    ansiblePlaybook:
      typeof raw.ansiblePlaybook === "string" ? raw.ansiblePlaybook : defaultConfig.ansiblePlaybook,
  }
}

async function readResponseError(response: Response, fallback: string): Promise<string> {
  const payload = (await response.json().catch(() => null)) as { error?: unknown } | null
  if (payload && typeof payload.error === "string" && payload.error.trim().length > 0) {
    return payload.error
  }

  return fallback
}

function asApplicationListItem(application: Application): ApplicationListItem {
  return {
    id: application.id,
    name: application.name,
    status: application.status,
    applicationType: application.applicationType,
    nodeType: application.nodeType,
    nodeId: application.nodeId,
    repository: application.repository,
    ship: application.ship ? { name: application.ship.name } : null,
    metadata: application.metadata,
  }
}

export default function ApplicationsPage() {
  const initialDeploymentProfile: DeploymentProfile = "local_starship_build"
  const { selectedShipDeploymentId, setSelectedShipDeploymentId } = useShipSelection()

  const [applications, setApplications] = useState<Application[]>([])
  const [ships, setShips] = useState<ShipSelectorItem[]>([])

  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingShips, setIsLoadingShips] = useState(true)
  const [isCreating, setIsCreating] = useState(false)

  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showTopology, setShowTopology] = useState(true)
  const [showAdvancedDeployConfig, setShowAdvancedDeployConfig] = useState(false)

  const [includeForwarded, setIncludeForwarded] = useState(false)
  const [sourceNodeId, setSourceNodeId] = useState("")

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | Application["status"]>("all")
  const [appTypeFilter, setAppTypeFilter] = useState<"all" | Application["applicationType"]>("all")
  const [nodeTypeFilter, setNodeTypeFilter] = useState<"all" | NodeType>("all")

  const [notice, setNotice] = useState<Notice | null>(null)
  const [pendingAction, setPendingAction] = useState<{ id: string; type: "status" | "delete" } | null>(null)
  const [runtimeMetrics, setRuntimeMetrics] = useState<RuntimeNodeMetricsPayload | null>(null)

  const [formData, setFormData] = useState<ApplicationFormData>({
    name: "",
    description: "",
    applicationType: "docker",
    image: "",
    repository: "",
    branch: "main",
    buildCommand: "",
    startCommand: "",
    port: 3000,
    environment: {},
    shipDeploymentId: "",
    nodeId: "",
    nodeType: "local",
    deploymentProfile: initialDeploymentProfile,
    provisioningMode: "terraform_ansible",
    advancedNodeTypeOverride: false,
    infrastructure: defaultInfrastructure(initialDeploymentProfile),
    nodeUrl: "",
    version: "",
  })

  const selectedShip = useMemo(
    () => ships.find((ship) => ship.id === formData.shipDeploymentId) || null,
    [formData.shipDeploymentId, ships],
  )

  const derivedNodeType = useMemo(
    () => deriveNodeType(formData.deploymentProfile, formData.advancedNodeTypeOverride, formData.nodeType),
    [formData.advancedNodeTypeOverride, formData.deploymentProfile, formData.nodeType],
  )

  const viewFilters = useMemo<ApplicationViewFilters>(
    () => ({
      query: search,
      status: statusFilter,
      applicationType: appTypeFilter,
      nodeType: nodeTypeFilter,
    }),
    [appTypeFilter, nodeTypeFilter, search, statusFilter],
  )

  const filteredApplications = useMemo(
    () => {
      const filteredItems = filterApplications(applications.map(asApplicationListItem), viewFilters)
      if (filteredItems.length === 0) {
        return []
      }

      const applicationById = new Map(applications.map((application) => [application.id, application] as const))
      return filteredItems
        .map((item) => applicationById.get(item.id))
        .filter((application): application is Application => Boolean(application))
    },
    [applications, viewFilters],
  )

  const summary = useMemo(
    () => computeApplicationSummary(applications.map(asApplicationListItem), filteredApplications.map(asApplicationListItem)),
    [applications, filteredApplications],
  )

  const hasFilters =
    search.trim().length > 0 || statusFilter !== "all" || appTypeFilter !== "all" || nodeTypeFilter !== "all"

  const selectedApplication = useMemo(
    () => filteredApplications.find((application) => application.id === selectedApplicationId) || null,
    [filteredApplications, selectedApplicationId],
  )

  const applyShipToForm = useCallback((ship: ShipSelectorItem, current: ApplicationFormData): ApplicationFormData => {
    const infrastructure = extractInfrastructureConfig(ship.config, ship.deploymentProfile)

    return {
      ...current,
      shipDeploymentId: ship.id,
      nodeId: ship.nodeId,
      nodeType: ship.nodeType,
      deploymentProfile: ship.deploymentProfile,
      provisioningMode: ship.provisioningMode,
      advancedNodeTypeOverride: false,
      nodeUrl: ship.nodeUrl || "",
      infrastructure: infrastructure || defaultInfrastructure(ship.deploymentProfile),
    }
  }, [])

  const fetchShips = useCallback(async () => {
    setIsLoadingShips(true)

    try {
      const response = await fetch("/api/ships")
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const payload = (await response.json()) as unknown
      const nextShips = Array.isArray(payload) ? (payload as ShipSelectorItem[]) : []
      setShips(nextShips)
    } catch (error) {
      console.error("Error fetching ships:", error)
      setNotice({
        type: "error",
        text: "Unable to load ships. Deploying a new application may be unavailable.",
      })
      setShips([])
    } finally {
      setIsLoadingShips(false)
    }
  }, [])

  const fetchApplications = useCallback(async () => {
    setIsLoading(true)

    try {
      const params = new URLSearchParams()
      if (includeForwarded) params.append("includeForwarded", "true")
      if (sourceNodeId.trim()) params.append("sourceNodeId", sourceNodeId.trim())
      const response = await fetch(`/api/applications?${params.toString()}`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const payload = (await response.json()) as unknown
      const nextApplications = Array.isArray(payload) ? (payload as Application[]) : []
      setApplications(nextApplications)
    } catch (error) {
      console.error("Error fetching applications:", error)
      setNotice({ type: "error", text: "Unable to load applications." })
      setApplications([])
    } finally {
      setIsLoading(false)
    }
  }, [includeForwarded, sourceNodeId])

  const fetchRuntimeMetrics = useCallback(async () => {
    try {
      const response = await fetch("/api/runtime/node/metrics", {
        cache: "no-store",
      })
      if (!response.ok) {
        return
      }

      const payload = parseRuntimeNodeMetricsPayload(await response.json())
      if (payload) {
        setRuntimeMetrics(payload)
      }
    } catch (error) {
      console.error("Error fetching runtime metrics:", error)
    }
  }, [])

  useEffect(() => {
    void fetchShips()
  }, [fetchShips])

  useEffect(() => {
    void fetchApplications()
  }, [fetchApplications])

  useEffect(() => {
    void fetchRuntimeMetrics()

    const poller = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return
      }
      void fetchRuntimeMetrics()
    }, 5_000)

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchRuntimeMetrics()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.clearInterval(poller)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [fetchRuntimeMetrics])

  useEventStream({
    enabled: true,
    types: [
      "ship.application.updated",
      "application.updated",
      "ship.updated",
      "forwarding.received",
      RUNTIME_NODE_METRICS_EVENT_TYPE,
    ],
    onEvent: (event) => {
      if (event.type === RUNTIME_NODE_METRICS_EVENT_TYPE) {
        const parsedMetrics = parseRuntimeNodeMetricsPayload(event.payload)
        if (parsedMetrics) {
          setRuntimeMetrics(parsedMetrics)
        }
        return
      }
      void fetchApplications()
      void fetchShips()
    },
  })

  useEffect(() => {
    if (ships.length === 0) {
      if (selectedShipDeploymentId) {
        setSelectedShipDeploymentId(null)
      }

      setFormData((current) => ({
        ...current,
        shipDeploymentId: "",
      }))
      return
    }

    const resolvedShipId =
      selectedShipDeploymentId && ships.some((ship) => ship.id === selectedShipDeploymentId)
        ? selectedShipDeploymentId
        : ships[0].id

    if (resolvedShipId !== selectedShipDeploymentId) {
      setSelectedShipDeploymentId(resolvedShipId)
    }

    const ship = ships.find((entry) => entry.id === resolvedShipId) || ships[0]
    setFormData((current) => applyShipToForm(ship, { ...current, shipDeploymentId: ship.id }))
  }, [applyShipToForm, selectedShipDeploymentId, setSelectedShipDeploymentId, ships])

  useEffect(() => {
    setSelectedApplicationId((current) => resolveSelectedApplicationId(filteredApplications, current))
  }, [filteredApplications])

  const topologyNodes = useMemo(() => {
    const appInputs = filteredApplications.map((application) => {
      const infrastructure = extractInfrastructureConfig(application.config, application.deploymentProfile)
      return {
        id: application.id,
        name: application.name,
        status: application.status,
        nodeType: application.nodeType,
        applicationType: application.applicationType,
        shipName: application.ship?.name,
        deploymentProfile: application.deploymentProfile,
        provisioningMode: application.provisioningMode,
        infrastructureKind: infrastructure?.kind,
      }
    })

    const localInputs = appInputs.filter((item) => item.nodeType === "local")
    const cloudInputs = appInputs.filter((item) => item.nodeType === "cloud")
    const hybridInputs = appInputs.filter((item) => item.nodeType === "hybrid")

    const anchorInputs = [
      {
        id: "anchor-local",
        label: "Local Nodes",
        status: "nominal" as const,
        detail: `${localInputs.length} apps`,
      },
      {
        id: "anchor-cloud",
        label: "Cloud Nodes",
        status: "nominal" as const,
        detail: `${cloudInputs.length} apps`,
      },
      {
        id: "anchor-hybrid",
        label: "Hybrid Nodes",
        status: "nominal" as const,
        detail: `${hybridInputs.length} apps`,
      },
    ]

    const [localAnchor, cloudAnchor, hybridAnchor] = mapAnchorsToNodes(anchorInputs)

    const localNodes = mapApplicationsToNodes(localInputs, selectedApplicationId || undefined)
    const cloudNodes = mapApplicationsToNodes(cloudInputs, selectedApplicationId || undefined)
    const hybridNodes = mapApplicationsToNodes(hybridInputs, selectedApplicationId || undefined)

    return layoutColumns(
      [
        { key: "local", nodes: [localAnchor, ...localNodes] },
        { key: "cloud", nodes: [cloudAnchor, ...cloudNodes] },
        { key: "hybrid", nodes: [hybridAnchor, ...hybridNodes] },
      ],
      260,
      150,
    )
  }, [filteredApplications, selectedApplicationId])

  const topologyEdges = useMemo(() => {
    const edgeItems = filteredApplications.map((application) => ({
      id: application.id,
      status: application.status,
      anchorId: `anchor-${application.nodeType}`,
    }))
    return buildEdgesToAnchors(edgeItems)
  }, [filteredApplications])

  const handleTopologyNodeClick = useCallback((_: unknown, node: Node) => {
    if (node.type === "applicationNode") {
      setSelectedApplicationId(node.id)
    }
  }, [])

  const resetCreateForm = useCallback(() => {
    setShowAdvancedDeployConfig(false)

    setFormData((current) => {
      const base: ApplicationFormData = {
        name: "",
        description: "",
        applicationType: "docker",
        image: "",
        repository: "",
        branch: "main",
        buildCommand: "",
        startCommand: "",
        port: 3000,
        environment: {},
        shipDeploymentId: selectedShipDeploymentId || current.shipDeploymentId,
        nodeId: "",
        nodeType: "local",
        deploymentProfile: initialDeploymentProfile,
        provisioningMode: "terraform_ansible",
        advancedNodeTypeOverride: false,
        infrastructure: defaultInfrastructure(initialDeploymentProfile),
        nodeUrl: "",
        version: "",
      }

      const ship = ships.find((entry) => entry.id === base.shipDeploymentId)
      return ship ? applyShipToForm(ship, base) : base
    })
  }, [applyShipToForm, selectedShipDeploymentId, ships])

  const selectDeployApplicationType = useCallback((applicationType: Application["applicationType"]) => {
    setFormData((current) => {
      if (current.applicationType === applicationType) {
        return current
      }

      const next: ApplicationFormData = {
        ...current,
        applicationType,
      }

      if (applicationType === "n8n") {
        if (current.image.trim().length === 0) {
          next.image = "docker.n8n.io/n8nio/n8n:latest"
        }
        if (!Number.isFinite(current.port) || current.port <= 0 || current.port === 3000) {
          next.port = 5678
        }
      }

      return next
    })
  }, [])

  const handleCreate = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()

      if (!formData.shipDeploymentId) {
        setNotice({ type: "error", text: "Select a ship before deploying an application." })
        return
      }

      setIsCreating(true)
      setNotice(null)

      try {
        const response = await fetch("/api/applications", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: formData.name,
            description: formData.description,
            applicationType: formData.applicationType,
            image: formData.image,
            repository: formData.repository,
            branch: formData.branch,
            buildCommand: formData.buildCommand,
            startCommand: formData.startCommand,
            port: formData.port || null,
            environment: formData.environment || {},
            shipDeploymentId: formData.shipDeploymentId,
            version: formData.version || null,
            config: {
              infrastructure: formData.infrastructure,
            },
          }),
        })

        if (!response.ok) {
          throw new Error(await readResponseError(response, "Failed to deploy application."))
        }

        const created = (await response.json()) as Application
        setShowCreateForm(false)
        resetCreateForm()
        if (created?.id) {
          setSelectedApplicationId(created.id)
        }
        setNotice({ type: "success", text: `Deployment created for ${formData.name}.` })
        await fetchApplications()
      } catch (error) {
        console.error("Error creating application:", error)
        setNotice({
          type: "error",
          text: error instanceof Error ? error.message : "Failed to deploy application.",
        })
      } finally {
        setIsCreating(false)
      }
    },
    [fetchApplications, formData, resetCreateForm],
  )

  const handleDelete = useCallback(
    async (application: Application) => {
      const capability = getApplicationActionCapability(asApplicationListItem(application))
      if (!capability.canMutate) {
        setNotice({ type: "info", text: capability.reason || "Mutating actions are disabled for this entry." })
        return
      }

      if (!confirm("Are you sure you want to delete this application deployment?")) {
        return
      }

      setPendingAction({ id: application.id, type: "delete" })
      setNotice(null)

      try {
        const response = await fetch(`/api/applications/${application.id}`, {
          method: "DELETE",
        })

        if (!response.ok) {
          throw new Error(await readResponseError(response, "Failed to delete application."))
        }

        setNotice({ type: "success", text: `Deleted ${application.name}.` })
        await fetchApplications()
      } catch (error) {
        console.error("Error deleting application:", error)
        setNotice({
          type: "error",
          text: error instanceof Error ? error.message : "Failed to delete application.",
        })
      } finally {
        setPendingAction(null)
      }
    },
    [fetchApplications],
  )

  const handleStatusUpdate = useCallback(
    async (application: Application, status: Application["status"]) => {
      const capability = getApplicationActionCapability(asApplicationListItem(application))
      if (!capability.canMutate) {
        setNotice({ type: "info", text: capability.reason || "Mutating actions are disabled for this entry." })
        return
      }

      setPendingAction({ id: application.id, type: "status" })
      setNotice(null)

      try {
        const response = await fetch(`/api/applications/${application.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status }),
        })

        if (!response.ok) {
          throw new Error(await readResponseError(response, "Failed to update application status."))
        }

        setNotice({
          type: "success",
          text: `${application.name} is now ${statusConfig[status].label.toLowerCase()}.`,
        })
        await fetchApplications()
      } catch (error) {
        console.error("Error updating application:", error)
        setNotice({
          type: "error",
          text: error instanceof Error ? error.message : "Failed to update application status.",
        })
      } finally {
        setPendingAction(null)
      }
    },
    [fetchApplications],
  )

  const handleShipSelect = useCallback(
    (selectedId: string) => {
      if (!selectedId) {
        setSelectedShipDeploymentId(null)
        setFormData((current) => ({ ...current, shipDeploymentId: "" }))
        return
      }

      setSelectedShipDeploymentId(selectedId)
      const ship = ships.find((entry) => entry.id === selectedId)
      if (ship) {
        setFormData((current) => applyShipToForm(ship, { ...current, shipDeploymentId: selectedId }))
      }
    },
    [applyShipToForm, setSelectedShipDeploymentId, ships],
  )

  const handleCopyNodeId = useCallback(async (nodeId: string) => {
    try {
      await navigator.clipboard.writeText(nodeId)
      setNotice({ type: "success", text: "Node ID copied to clipboard." })
    } catch {
      setNotice({ type: "error", text: "Unable to copy Node ID." })
    }
  }, [])

  const inputCls =
    "w-full rounded-lg border border-slate-300/70 dark:border-white/15 bg-white/60 dark:bg-white/[0.04] px-3 py-2 text-sm text-slate-900 dark:text-white outline-none placeholder:text-slate-400 dark:placeholder:text-gray-500 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-colors"
  const selectCls =
    "rounded-lg border border-slate-300/70 dark:border-white/15 bg-white/60 dark:bg-white/[0.04] px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-colors"

  return (
    <div className="min-h-screen gradient-orb">
      <div className="pointer-events-none fixed inset-0 bridge-grid opacity-40 dark:opacity-100" />

      <div className="relative mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <div className="rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 p-3">
                <Package className="h-7 w-7 text-blue-600 dark:text-blue-300" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                  Application Deployments
                </h1>
                <p className="readout mt-1 text-slate-500 dark:text-gray-500">MANAGE DEPLOYED APPLICATIONS</p>
              </div>
            </div>

            <button
              onClick={() => {
                resetCreateForm()
                setShowCreateForm(true)
              }}
              disabled={isLoadingShips || ships.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-5 py-2.5 text-sm font-medium text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Package className="h-4 w-4" />
              Deploy Application
            </button>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {[
              { label: "TOTAL", value: summary.total, cls: "border-slate-300/70 text-slate-700 dark:text-slate-200" },
              { label: "ACTIVE", value: summary.active, cls: "border-emerald-500/25 text-emerald-700 dark:text-emerald-300" },
              { label: "FAILED", value: summary.failed, cls: "border-rose-500/25 text-rose-700 dark:text-rose-300" },
              ...(hasFilters
                ? [
                    {
                      label: "SHOWING",
                      value: summary.showing,
                      cls: "border-cyan-500/25 text-cyan-700 dark:text-cyan-200",
                    },
                  ]
                : []),
            ].map((stat) => (
              <div key={stat.label} className={`glass rounded-lg border px-3 py-1.5 ${stat.cls}`}>
                <span className="readout opacity-70">{stat.label}</span>{" "}
                <span className="font-semibold font-tactical tabular-nums">{stat.value}</span>
              </div>
            ))}
          </div>

          {notice && (
            <div
              className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
                notice.type === "success"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : notice.type === "error"
                    ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                    : "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
              }`}
            >
              {notice.text}
            </div>
          )}
        </header>

        <div className="mb-4 rounded-xl border border-slate-300/70 bg-white/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,170px))_auto]">
            <label className="flex items-center gap-2 rounded-lg border border-slate-300/70 bg-white/70 px-3 py-2 dark:border-white/15 dark:bg-white/[0.04]">
              <Search className="h-4 w-4 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search applications, ships, node IDs..."
                className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-gray-500"
              />
            </label>

            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className={selectCls}>
              {STATUS_FILTER_VALUES.map((status) => (
                <option key={status} value={status}>
                  {status === "all" ? "All statuses" : statusConfig[status].label}
                </option>
              ))}
            </select>

            <select value={appTypeFilter} onChange={(event) => setAppTypeFilter(event.target.value as typeof appTypeFilter)} className={selectCls}>
              {APPLICATION_TYPE_FILTER_VALUES.map((appType) => (
                <option key={appType} value={appType}>
                  {appType === "all" ? "All app types" : appTypeConfig[appType].label}
                </option>
              ))}
            </select>

            <select value={nodeTypeFilter} onChange={(event) => setNodeTypeFilter(event.target.value as typeof nodeTypeFilter)} className={selectCls}>
              {NODE_TYPE_FILTER_VALUES.map((nodeType) => (
                <option key={nodeType} value={nodeType}>
                  {nodeType === "all" ? "All node types" : nodeTypeConfig[nodeType].label}
                </option>
              ))}
            </select>

            {hasFilters ? (
              <button
                type="button"
                onClick={() => {
                  setSearch("")
                  setStatusFilter("all")
                  setAppTypeFilter("all")
                  setNodeTypeFilter("all")
                }}
                className="rounded-lg border border-slate-300/70 px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.1]"
              >
                Clear
              </button>
            ) : (
              <div className="hidden lg:block" />
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300/70 bg-white/70 px-3 py-2 text-sm text-slate-700 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-300">
              <input
                type="checkbox"
                checked={includeForwarded}
                onChange={(event) => setIncludeForwarded(event.target.checked)}
              />
              Include forwarded
            </label>

            {includeForwarded && (
              <input
                type="text"
                value={sourceNodeId}
                onChange={(event) => setSourceNodeId(event.target.value)}
                placeholder="Source node filter"
                className={`${inputCls} w-full md:max-w-sm`}
              />
            )}
          </div>
        </div>

        <OrchestrationSurface level={4} className="mb-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Application Topology</h2>
              <p className="text-xs text-slate-500 dark:text-gray-400">Interactive runtime map</p>
            </div>
            <button
              type="button"
              onClick={() => setShowTopology((open) => !open)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300/70 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.12]"
            >
              {showTopology ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {showTopology ? "Hide topology" : "Show topology"}
            </button>
          </div>

          {showTopology ? (
            <div className="mt-4">
              <FlowCanvas
                nodes={topologyNodes}
                edges={topologyEdges}
                nodeTypes={nodeTypes}
                onNodeClick={handleTopologyNodeClick}
                showMiniMap
                className="h-[360px]"
              />
            </div>
          ) : null}
        </OrchestrationSurface>

        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          <aside className="w-full shrink-0 lg:w-[410px] xl:w-[450px]">
            <div className="card-scroll space-y-2 overflow-y-auto pr-1" style={{ maxHeight: "calc(100vh - 350px)" }}>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="skeleton-shimmer h-[74px] rounded-xl" />
                ))
              ) : filteredApplications.length === 0 ? (
                <div className="glass rounded-xl px-5 py-10 text-center">
                  {applications.length === 0 ? (
                    <>
                      <Package className="mx-auto mb-3 h-10 w-10 text-blue-500/70 dark:text-blue-300/70" />
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">No applications yet</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Deploy your first application to get started.
                      </p>
                      <div className="mt-4 flex flex-wrap justify-center gap-2">
                        {Object.entries(appTypeConfig).map(([type, config]) => (
                          <UseCaseBadge
                            key={type}
                            label={config.label}
                            variant={
                              type === "docker"
                                ? "blue"
                                : type === "nodejs"
                                  ? "green"
                                  : type === "python"
                                    ? "orange"
                                    : type === "n8n"
                                      ? "blue"
                                      : "purple"
                            }
                          />
                        ))}
                      </div>
                      {ships.length === 0 ? (
                        <Link
                          href="/ship-yard"
                          className="mt-4 inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500"
                        >
                          Open Ship Yard
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            resetCreateForm()
                            setShowCreateForm(true)
                          }}
                          className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-500"
                        >
                          Deploy First Application
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <AlertCircle className="mx-auto mb-2 h-8 w-8 text-amber-600 dark:text-amber-300" />
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">No applications match filters</p>
                      <button
                        type="button"
                        onClick={() => {
                          setSearch("")
                          setStatusFilter("all")
                          setAppTypeFilter("all")
                          setNodeTypeFilter("all")
                        }}
                        className="mt-2 text-xs text-cyan-700 hover:underline dark:text-cyan-300"
                      >
                        Reset filters
                      </button>
                    </>
                  )}
                </div>
              ) : (
                filteredApplications.map((application) => {
                  const statusInfo = statusConfig[application.status]
                  const StatusIcon = statusInfo.icon
                  const appTypeInfo = appTypeConfig[application.applicationType]
                  const AppTypeIcon = appTypeInfo.icon
                  const selected = application.id === selectedApplicationId
                  const capability = getApplicationActionCapability(asApplicationListItem(application))

                  return (
                    <button
                      key={application.id}
                      type="button"
                      onClick={() => setSelectedApplicationId(application.id)}
                      className={`group relative w-full rounded-xl border text-left transition-all ${
                        selected
                          ? "glass-elevated border-cyan-500/35 surface-glow-cyan"
                          : "glass border-transparent hover:border-slate-300/70 dark:hover:border-white/15"
                      }`}
                    >
                      <div className="flex items-center gap-3 px-4 py-3">
                        <div className={`rounded-lg border p-1.5 ${appTypeInfo.bg} ${statusInfo.border}`}>
                          <AppTypeIcon className={`h-4 w-4 ${appTypeInfo.color}`} />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-slate-800 dark:text-white">{application.name}</span>
                            {capability.isForwarded && (
                              <span className="rounded-full border border-cyan-500/35 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-700 dark:text-cyan-200">
                                Forwarded
                              </span>
                            )}
                          </div>

                          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-gray-500">
                            <span className="font-tactical truncate">{application.nodeId}</span>
                            {application.ship?.name && (
                              <>
                                <span className="text-slate-300 dark:text-white/20">&middot;</span>
                                <span className="truncate">{application.ship.name}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 ${statusInfo.bg} ${statusInfo.border}`}>
                          <StatusIcon className={`h-3 w-3 ${statusInfo.color} ${statusInfo.pulse ? "animate-pulse" : ""}`} />
                          <span className={`readout ${statusInfo.color}`}>{statusInfo.label}</span>
                        </div>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </aside>

          <main className="min-w-0 flex-1">
            {selectedApplication ? (
              <ApplicationDetailPanel
                application={selectedApplication}
                runtimeMetrics={runtimeMetrics}
                pendingAction={pendingAction}
                onCopyNodeId={handleCopyNodeId}
                onDelete={handleDelete}
                onStatusUpdate={handleStatusUpdate}
              />
            ) : (
              <div className="glass flex min-h-[420px] flex-col items-center justify-center rounded-2xl text-center">
                <Package className="mb-3 h-10 w-10 text-slate-400 dark:text-slate-500" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {summary.total === 0 ? "Deploy an application to begin" : "Select an application to view details"}
                </p>
                <p className="mt-1 readout text-slate-500 dark:text-gray-500">
                  {summary.total === 0 ? "NO DEPLOYMENTS" : `${summary.total} DEPLOYMENT${summary.total === 1 ? "" : "S"}`}
                </p>
              </div>
            )}
          </main>
        </div>
      </div>

      {showCreateForm && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 pt-[5vh] pb-12 backdrop-blur-sm"
          onClick={() => {
            if (!isCreating) {
              setShowCreateForm(false)
            }
          }}
        >
          <div
            className="relative w-full max-w-3xl rounded-2xl border border-slate-200/80 bg-white/95 p-6 shadow-2xl dark:border-white/15 dark:bg-slate-950/95"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Deploy New Application</h2>
                <p className="readout mt-1 text-slate-500 dark:text-gray-500">CONFIGURE DEPLOYMENT TARGET</p>
              </div>

              <button
                type="button"
                disabled={isCreating}
                onClick={() => setShowCreateForm(false)}
                className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.08]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              {ships.length === 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
                  No ships available. Launch a ship in{" "}
                  <Link href="/ship-yard" className="underline underline-offset-2">
                    Ship Yard
                  </Link>{" "}
                  before deploying applications.
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="readout mb-1.5 block text-slate-500 dark:text-gray-400">APPLICATION NAME</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                    required
                    className={inputCls}
                    placeholder="my-app"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="readout mb-1.5 block text-slate-500 dark:text-gray-400">APPS GRID</label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {DEPLOY_APP_TYPE_ORDER.map((type) => {
                      const config = appTypeConfig[type]
                      const Icon = config.icon
                      const active = formData.applicationType === type

                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => selectDeployApplicationType(type)}
                          className={`rounded-xl border px-3 py-2 text-left transition-all ${
                            active
                              ? "border-cyan-500/45 bg-cyan-500/12 shadow-sm"
                              : "border-slate-300/70 bg-white/70 hover:border-cyan-300/40 dark:border-white/15 dark:bg-white/[0.04]"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={`rounded-lg border p-1 ${config.bg}`}>
                              <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                            </span>
                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                              {config.label}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
                            {config.description}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="readout mb-1.5 block text-slate-500 dark:text-gray-400">TARGET SHIP</label>
                  <select
                    value={formData.shipDeploymentId}
                    onChange={(event) => handleShipSelect(event.target.value)}
                    required
                    disabled={ships.length === 0}
                    className={`${selectCls} w-full disabled:opacity-60`}
                  >
                    {ships.length === 0 ? (
                      <option value="">No ships available</option>
                    ) : (
                      ships.map((ship) => (
                        <option key={ship.id} value={ship.id}>
                          {ship.name} ({ship.status})
                        </option>
                      ))
                    )}
                  </select>
                  {selectedShip && (
                    <p className="mt-1 text-xs text-cyan-700 dark:text-cyan-300">
                      Deploying to {selectedShip.nodeType} node `{selectedShip.nodeId}` via{" "}
                      {deploymentProfileLabels[selectedShip.deploymentProfile]}.
                    </p>
                  )}
                </div>

                <div>
                  <label className="readout mb-1.5 block text-slate-500 dark:text-gray-400">NODE ID</label>
                  <input
                    type="text"
                    value={formData.nodeId}
                    readOnly
                    disabled
                    className={`${inputCls} disabled:opacity-70`}
                  />
                </div>

                <div>
                  <label className="readout mb-1.5 block text-slate-500 dark:text-gray-400">DERIVED NODE TYPE</label>
                  <div className="rounded-lg border border-slate-300/70 bg-white/60 px-3 py-2 text-sm text-slate-700 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200">
                    {deploymentProfileLabels[formData.deploymentProfile]} &rarr; {nodeTypeConfig[derivedNodeType].label}
                  </div>
                </div>

                {formData.applicationType === "docker" && (
                  <div className="sm:col-span-2 rounded-xl border border-blue-400/30 bg-blue-500/8 p-3">
                    <p className="readout mb-2 text-blue-700 dark:text-blue-300">DOCKER CONFIG CARD</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label className="readout mb-1.5 block text-slate-500 dark:text-gray-400">DOCKER IMAGE</label>
                        <input
                          type="text"
                          value={formData.image}
                          onChange={(event) => setFormData({ ...formData, image: event.target.value })}
                          className={inputCls}
                          placeholder="nginx:latest or myregistry/myapp:v1.0"
                        />
                      </div>
                      <div>
                        <label className="readout mb-1.5 block text-slate-500 dark:text-gray-400">PORT</label>
                        <input
                          type="number"
                          value={formData.port}
                          onChange={(event) =>
                            setFormData({ ...formData, port: parseInt(event.target.value, 10) || 3000 })
                          }
                          className={inputCls}
                          placeholder="3000"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {(formData.applicationType === "nodejs" ||
                  formData.applicationType === "python" ||
                  formData.applicationType === "static") && (
                  <div className="sm:col-span-2 rounded-xl border border-emerald-400/30 bg-emerald-500/8 p-3">
                    <p className="readout mb-2 text-emerald-700 dark:text-emerald-300">
                      REPOSITORY CONFIG CARD
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label className="readout mb-1.5 block text-slate-500 dark:text-gray-400">REPOSITORY URL</label>
                        <input
                          type="url"
                          value={formData.repository}
                          onChange={(event) => setFormData({ ...formData, repository: event.target.value })}
                          className={inputCls}
                          placeholder="https://github.com/user/repo"
                        />
                      </div>
                      <div>
                        <label className="readout mb-1.5 block text-slate-500 dark:text-gray-400">BRANCH</label>
                        <input
                          type="text"
                          value={formData.branch}
                          onChange={(event) => setFormData({ ...formData, branch: event.target.value })}
                          className={inputCls}
                          placeholder="main"
                        />
                      </div>
                      <div>
                        <label className="readout mb-1.5 block text-slate-500 dark:text-gray-400">PORT</label>
                        <input
                          type="number"
                          value={formData.port}
                          onChange={(event) =>
                            setFormData({ ...formData, port: parseInt(event.target.value, 10) || 3000 })
                          }
                          className={inputCls}
                          placeholder="3000"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="readout mb-1.5 block text-slate-500 dark:text-gray-400">BUILD COMMAND (OPTIONAL)</label>
                        <input
                          type="text"
                          value={formData.buildCommand}
                          onChange={(event) => setFormData({ ...formData, buildCommand: event.target.value })}
                          className={inputCls}
                          placeholder="npm install && npm run build"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="readout mb-1.5 block text-slate-500 dark:text-gray-400">START COMMAND</label>
                        <input
                          type="text"
                          value={formData.startCommand}
                          onChange={(event) => setFormData({ ...formData, startCommand: event.target.value })}
                          className={inputCls}
                          placeholder="npm start or python app.py"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {formData.applicationType === "n8n" && (
                  <div className="sm:col-span-2 rounded-xl border border-cyan-400/30 bg-cyan-500/8 p-3">
                    <p className="readout mb-2 text-cyan-700 dark:text-cyan-300">N8N CONFIG CARD</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label className="readout mb-1.5 block text-slate-500 dark:text-gray-400">N8N IMAGE</label>
                        <input
                          type="text"
                          value={formData.image}
                          onChange={(event) => setFormData({ ...formData, image: event.target.value })}
                          className={inputCls}
                          placeholder="docker.n8n.io/n8nio/n8n:latest"
                        />
                      </div>
                      <div>
                        <label className="readout mb-1.5 block text-slate-500 dark:text-gray-400">N8N PORT</label>
                        <input
                          type="number"
                          value={formData.port}
                          onChange={(event) =>
                            setFormData({ ...formData, port: parseInt(event.target.value, 10) || 5678 })
                          }
                          className={inputCls}
                          placeholder="5678"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {formData.applicationType === "custom" && (
                  <div className="sm:col-span-2 rounded-xl border border-slate-400/30 bg-slate-500/8 p-3">
                    <p className="readout mb-2 text-slate-700 dark:text-slate-300">CUSTOM CONFIG CARD</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label className="readout mb-1.5 block text-slate-500 dark:text-gray-400">IMAGE (OPTIONAL)</label>
                        <input
                          type="text"
                          value={formData.image}
                          onChange={(event) => setFormData({ ...formData, image: event.target.value })}
                          className={inputCls}
                          placeholder="myregistry/my-custom-app:latest"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="readout mb-1.5 block text-slate-500 dark:text-gray-400">REPOSITORY URL (OPTIONAL)</label>
                        <input
                          type="url"
                          value={formData.repository}
                          onChange={(event) => setFormData({ ...formData, repository: event.target.value })}
                          className={inputCls}
                          placeholder="https://github.com/user/repo"
                        />
                      </div>
                      <div>
                        <label className="readout mb-1.5 block text-slate-500 dark:text-gray-400">PORT (OPTIONAL)</label>
                        <input
                          type="number"
                          value={formData.port}
                          onChange={(event) =>
                            setFormData({ ...formData, port: parseInt(event.target.value, 10) || 3000 })
                          }
                          className={inputCls}
                          placeholder="3000"
                        />
                      </div>
                      <div>
                        <label className="readout mb-1.5 block text-slate-500 dark:text-gray-400">START COMMAND (OPTIONAL)</label>
                        <input
                          type="text"
                          value={formData.startCommand}
                          onChange={(event) => setFormData({ ...formData, startCommand: event.target.value })}
                          className={inputCls}
                          placeholder="./run.sh"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="readout mb-1.5 block text-slate-500 dark:text-gray-400">VERSION (OPTIONAL)</label>
                  <input
                    type="text"
                    value={formData.version}
                    onChange={(event) => setFormData({ ...formData, version: event.target.value })}
                    className={inputCls}
                    placeholder="v1.0.0"
                  />
                </div>

                <div>
                  <label className="readout mb-1.5 block text-slate-500 dark:text-gray-400">PROVISIONING MODE</label>
                  <div className="rounded-lg border border-slate-300/70 bg-white/60 px-3 py-2 text-sm text-slate-700 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200">
                    {provisioningModeLabels[formData.provisioningMode]}
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="readout mb-1.5 block text-slate-500 dark:text-gray-400">DESCRIPTION</label>
                  <textarea
                    value={formData.description}
                    onChange={(event) => setFormData({ ...formData, description: event.target.value })}
                    rows={3}
                    className={inputCls}
                    placeholder="Application description..."
                  />
                </div>
              </div>

              <div className="rounded-lg border border-slate-300/70 bg-white/70 p-3 dark:border-white/15 dark:bg-white/[0.03]">
                <button
                  type="button"
                  onClick={() => setShowAdvancedDeployConfig((open) => !open)}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                >
                  {showAdvancedDeployConfig ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  Advanced deployment config (read-only defaults)
                </button>

                {showAdvancedDeployConfig && (
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="rounded border border-slate-300/70 bg-white/70 px-3 py-2 text-xs text-slate-600 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-300">
                      Kind: {infrastructureKindLabels[formData.infrastructure.kind]}
                    </div>
                    <div className="rounded border border-slate-300/70 bg-white/70 px-3 py-2 text-xs text-slate-600 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-300">
                      Kube Context: {formData.infrastructure.kubeContext}
                    </div>
                    <div className="rounded border border-slate-300/70 bg-white/70 px-3 py-2 text-xs text-slate-600 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-300">
                      Namespace: {formData.infrastructure.namespace}
                    </div>
                    <div className="rounded border border-slate-300/70 bg-white/70 px-3 py-2 text-xs text-slate-600 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-300">
                      Terraform Workspace: {formData.infrastructure.terraformWorkspace}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  disabled={isCreating}
                  onClick={() => setShowCreateForm(false)}
                  className="rounded-lg border border-slate-300/70 px-4 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.1]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating || ships.length === 0 || !formData.shipDeploymentId}
                  className="rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 px-5 py-2 text-sm font-medium text-white transition-all hover:brightness-110 disabled:opacity-60"
                >
                  {isCreating ? "Deploying..." : "Deploy"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function ApplicationDetailPanel({
  application,
  runtimeMetrics,
  pendingAction,
  onCopyNodeId,
  onDelete,
  onStatusUpdate,
}: {
  application: Application
  runtimeMetrics: RuntimeNodeMetricsPayload | null
  pendingAction: { id: string; type: "status" | "delete" } | null
  onCopyNodeId: (nodeId: string) => void
  onDelete: (application: Application) => void
  onStatusUpdate: (application: Application, status: Application["status"]) => void
}) {
  const statusInfo = statusConfig[application.status]
  const appTypeInfo = appTypeConfig[application.applicationType]
  const StatusIcon = statusInfo.icon
  const AppTypeIcon = appTypeInfo.icon

  const capability = getApplicationActionCapability(asApplicationListItem(application))
  const isStatusPending = pendingAction?.id === application.id && pendingAction.type === "status"
  const isDeletePending = pendingAction?.id === application.id && pendingAction.type === "delete"
  const patchUiUrl = useMemo(
    () =>
      resolveApplicationPatchUiUrl({
        applicationType: application.applicationType,
        environment: application.environment,
        nodeUrl: application.nodeUrl,
      }),
    [application.applicationType, application.environment, application.nodeUrl],
  )
  const [showPatchUi, setShowPatchUi] = useState(false)

  useEffect(() => {
    setShowPatchUi(false)
  }, [application.id, patchUiUrl])

  return (
    <div className="glass-elevated overflow-hidden rounded-2xl">
      <div className="border-b border-slate-200/60 px-6 py-5 dark:border-white/10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <div className={`rounded-xl border p-2.5 ${appTypeInfo.bg} ${statusInfo.border}`}>
                <AppTypeIcon className={`h-5 w-5 ${appTypeInfo.color}`} />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-xl font-bold tracking-tight text-slate-900 dark:text-white">{application.name}</h2>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="font-tactical text-xs text-slate-500 dark:text-gray-500">{application.nodeId}</span>
                  {application.ship?.name && (
                    <>
                      <span className="text-slate-300 dark:text-white/20">&middot;</span>
                      <span className="text-xs text-cyan-700 dark:text-cyan-300">{application.ship.name}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 ${statusInfo.bg} ${statusInfo.border}`}>
            <StatusIcon className={`h-3.5 w-3.5 ${statusInfo.color} ${statusInfo.pulse ? "animate-pulse" : ""}`} />
            <span className={`readout ${statusInfo.color}`}>{statusInfo.label}</span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full border px-2.5 py-0.5 readout ${appTypeInfo.bg} ${appTypeInfo.color}`}>
            {appTypeInfo.label}
          </span>
          <span className="rounded-full border border-slate-300/70 bg-slate-100/70 px-2.5 py-0.5 readout text-slate-600 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-300">
            {nodeTypeConfig[application.nodeType].label}
          </span>
          <span className="rounded-full border border-slate-300/70 bg-slate-100/70 px-2.5 py-0.5 readout text-slate-600 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-300">
            {deploymentProfileLabels[application.deploymentProfile]}
          </span>
          {capability.isForwarded && (
            <span className="rounded-full border border-cyan-500/35 bg-cyan-500/12 px-2.5 py-0.5 readout text-cyan-700 dark:text-cyan-200">
              Forwarded
            </span>
          )}
          {application.healthStatus && (
            <span
              className={`rounded-full border px-2.5 py-0.5 readout ${
                application.healthStatus === "healthy"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
              }`}
            >
              {application.healthStatus}
            </span>
          )}
        </div>

        {!capability.canMutate && capability.reason && (
          <div className="mt-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-700 dark:text-cyan-200">
            {capability.reason}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {application.status === "active" ? (
            <button
              type="button"
              onClick={() => onStatusUpdate(application, "inactive")}
              disabled={isStatusPending || !capability.canMutate}
              className="inline-flex items-center gap-1.5 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-xs font-medium text-orange-700 transition-colors hover:bg-orange-500/20 disabled:opacity-60 dark:text-orange-300"
            >
              <Square className="h-3.5 w-3.5" />
              {isStatusPending ? "Stopping..." : "Stop"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onStatusUpdate(application, "active")}
              disabled={isStatusPending || !capability.canMutate}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-green-600 px-3 py-1.5 text-xs font-medium text-white transition-all hover:brightness-110 disabled:opacity-60"
            >
              <Play className="h-3.5 w-3.5" />
              {isStatusPending ? "Starting..." : "Start"}
            </button>
          )}

          <button
            type="button"
            onClick={() => onCopyNodeId(application.nodeId)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300/70 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.12]"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy ID
          </button>

          {application.nodeUrl && (
            <a
              href={application.nodeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-500/20 dark:text-blue-300"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open
            </a>
          )}

          <button
            type="button"
            onClick={() => onDelete(application)}
            disabled={isDeletePending || !capability.canMutate}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-500/20 disabled:opacity-60 dark:text-rose-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {isDeletePending ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>

      <div className="space-y-5 p-6">
        {application.description && (
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{application.description}</p>
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {application.image && (
            <div className="glass rounded-lg px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
              <div className="mb-1 flex items-center gap-1.5 text-slate-500 dark:text-gray-500">
                <Container className="h-3.5 w-3.5" />
                Image
              </div>
              <code className="break-all font-tactical text-[11px]">{application.image}</code>
            </div>
          )}

          {application.repository && (
            <div className="glass rounded-lg px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
              <div className="mb-1 flex items-center gap-1.5 text-slate-500 dark:text-gray-500">
                <GitBranch className="h-3.5 w-3.5" />
                Repository
              </div>
              <div className="break-all font-tactical text-[11px]">{application.repository}</div>
              {application.branch && (
                <span className="mt-1 inline-flex rounded bg-violet-500/12 px-1.5 py-0.5 text-[10px] text-violet-700 dark:text-violet-300">
                  {application.branch}
                </span>
              )}
            </div>
          )}

          {application.port && (
            <div className="glass rounded-lg px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
              <div className="mb-1 flex items-center gap-1.5 text-slate-500 dark:text-gray-500">
                <Hash className="h-3.5 w-3.5" />
                Port
              </div>
              <div className="font-tactical text-[11px]">:{application.port}</div>
            </div>
          )}

          {application.version && (
            <div className="glass rounded-lg px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
              <div className="mb-1 flex items-center gap-1.5 text-slate-500 dark:text-gray-500">
                <Layers className="h-3.5 w-3.5" />
                Version
              </div>
              <div className="font-tactical text-[11px]">{application.version}</div>
            </div>
          )}

          {application.deployedAt && application.status === "active" && (
            <div className="glass rounded-lg px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
              <div className="mb-1 flex items-center gap-1.5 text-slate-500 dark:text-gray-500">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Uptime
              </div>
              <div className="font-tactical text-[11px]">{formatUptime(new Date(application.deployedAt))}</div>
            </div>
          )}
        </div>

        {(application.buildCommand || application.startCommand) && (
          <div className="rounded-xl border border-slate-300/70 bg-white/70 p-3 dark:border-white/12 dark:bg-white/[0.03]">
            <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Build & Runtime Commands</h3>
            <div className="space-y-2 text-xs">
              {application.buildCommand && (
                <div>
                  <div className="readout text-slate-500 dark:text-gray-500">BUILD</div>
                  <code className="font-tactical text-orange-700 dark:text-orange-300">{application.buildCommand}</code>
                </div>
              )}
              {application.startCommand && (
                <div>
                  <div className="readout text-slate-500 dark:text-gray-500">START</div>
                  <code className="font-tactical text-emerald-700 dark:text-emerald-300">{application.startCommand}</code>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-cyan-400/35 bg-cyan-500/8 p-3 dark:border-cyan-300/35">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="readout text-cyan-700 dark:text-cyan-300">Patch UI</p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                Open the runtime patch surface inside Applications for quick config edits.
              </p>
            </div>

            {!capability.isForwarded && patchUiUrl && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPatchUi((current) => !current)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/45 bg-cyan-500/12 px-3 py-1.5 text-xs font-medium text-cyan-700 dark:border-cyan-300/45 dark:text-cyan-200"
                >
                  {showPatchUi ? "Hide Patch UI" : "Open Patch UI"}
                </button>
                <a
                  href={patchUiUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300/70 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-300"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open in new tab
                </a>
              </div>
            )}
          </div>

          {capability.isForwarded ? (
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
              Patch UI is disabled for forwarded applications.
            </p>
          ) : !patchUiUrl ? (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-200">
              No patch URL detected. For n8n, set <code>N8N_EDITOR_BASE_URL</code> or <code>N8N_PUBLIC_BASE_URL</code>;
              otherwise provide a valid application node URL.
            </p>
          ) : (
            <>
              {showPatchUi && (
                <div className="mt-2 overflow-hidden rounded-lg border border-slate-300/70 bg-white dark:border-white/12 dark:bg-slate-900/70">
                  <iframe
                    key={patchUiUrl}
                    src={patchUiUrl}
                    title={`${application.name} patch ui`}
                    className="h-[560px] w-full bg-white"
                  />
                </div>
              )}
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                If embedding is blocked by browser or app security headers, use <span className="font-medium">Open in new tab</span>.
              </p>
            </>
          )}
        </div>

        <NodeInfoCard
          nodeType={application.nodeType}
          nodeId={application.nodeId}
          nodeUrl={application.nodeUrl}
          healthStatus={application.healthStatus}
          deployedAt={application.deployedAt}
          deploymentProfile={application.deploymentProfile}
          provisioningMode={application.provisioningMode}
          infrastructure={extractInfrastructureConfig(application.config, application.deploymentProfile)}
          showCapabilities
          showConfig
          showSecurity
          showUseCases={false}
          metrics={
            application.status === "active"
              ? {
                  uptime: application.deployedAt ? formatUptime(new Date(application.deployedAt)) : undefined,
                  cpu: runtimeMetrics?.signals.cpuPercent,
                  memory: runtimeMetrics?.signals.heapPressurePercent,
                }
              : undefined
          }
        />
      </div>
    </div>
  )
}
