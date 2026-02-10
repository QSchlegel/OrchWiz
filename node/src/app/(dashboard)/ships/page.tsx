"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Rocket,
  Server,
  Cloud,
  XCircle,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Play,
  Square,
  Trash2,
  Network,
  Activity,
  HardDrive,
  Package,
  Bot,
  RefreshCw,
  ExternalLink,
  Settings,
  Copy,
  Search,
} from "lucide-react"
import { OrchestrationSurface } from "@/components/orchestration/OrchestrationSurface"
import { NodeInfoCard, nodeTypeInfo, UseCaseBadge } from "@/components/orchestration/NodeInfoCard"
import { FlipCard } from "@/components/orchestration/FlipCard"
import { ShipQuartermasterPanel } from "@/components/quartermaster/ShipQuartermasterPanel"
import { FlowCanvas } from "@/components/flow/FlowCanvas"
import { DeploymentNode, SystemNode } from "@/components/flow/nodes"
import { layoutColumns } from "@/lib/flow/layout"
import { buildEdgesToAnchors, mapAnchorsToNodes, mapDeploymentsToNodes } from "@/lib/flow/mappers"
import type { Node } from "reactflow"
import { useEventStream } from "@/lib/realtime/useEventStream"

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

interface DeploymentFormData {
  name: string
  description: string
  subagentId: string
  nodeId: string
  nodeType: NodeType
  deploymentProfile: DeploymentProfile
  provisioningMode: ProvisioningMode
  advancedNodeTypeOverride: boolean
  nodeUrl: string
  infrastructure: InfrastructureConfig
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

function isInfrastructureKind(value: unknown): value is InfrastructureKind {
  return value === "kind" || value === "minikube" || value === "existing_k8s"
}

function kubeContextForKind(kind: InfrastructureKind): string {
  if (kind === "kind") {
    return "kind-orchwiz"
  }
  if (kind === "minikube") {
    return "minikube"
  }
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

interface Deployment {
  id: string
  name: string
  description: string | null
  subagentId: string | null
  nodeId: string
  nodeType: NodeType
  deploymentProfile: DeploymentProfile
  provisioningMode: ProvisioningMode
  nodeUrl: string | null
  status: "pending" | "deploying" | "active" | "inactive" | "failed" | "updating"
  config: any
  metadata: any
  deployedAt: string | null
  lastHealthCheck: string | null
  healthStatus: string | null
  createdAt: string
  subagent?: {
    id: string
    name: string
    description: string | null
  }
}

interface RuntimeSnapshot {
  checkedAt: string
  docker: {
    available: boolean
    currentContext: string | null
    contexts: {
      name: string
      description: string
      dockerEndpoint: string
      current: boolean
      error: string | null
    }[]
    error?: string
  }
  kubernetes: {
    available: boolean
    currentContext: string | null
    contexts: string[]
    error?: string
  }
  kind: {
    available: boolean
    clusters: {
      name: string
      kubeContext: string
      kubeContextPresent: boolean
      controlPlaneContainer: string | null
      runningNodeCount: number
      totalNodeCount: number
      nodeContainers: {
        name: string
        image: string
        state: string | null
        status: string
      }[]
    }[]
    error?: string
  }
}

interface DeploymentWithInfrastructure extends Deployment {
  infrastructure: InfrastructureConfig | null
}

const statusConfig = {
  pending: {
    icon: Clock,
    color: "text-yellow-400",
    bg: "bg-yellow-500/20",
    border: "border-yellow-500/30",
    label: "Pending",
    pulse: true
  },
  deploying: {
    icon: Rocket,
    color: "text-blue-400",
    bg: "bg-blue-500/20",
    border: "border-blue-500/30",
    label: "Deploying",
    pulse: true
  },
  active: {
    icon: Activity,
    color: "text-green-400",
    bg: "bg-green-500/20",
    border: "border-green-500/30",
    label: "Active",
    pulse: false
  },
  inactive: {
    icon: Square,
    color: "text-gray-400",
    bg: "bg-gray-500/20",
    border: "border-gray-500/30",
    label: "Inactive",
    pulse: false
  },
  failed: {
    icon: XCircle,
    color: "text-red-400",
    bg: "bg-red-500/20",
    border: "border-red-500/30",
    label: "Failed",
    pulse: false
  },
  updating: {
    icon: Package,
    color: "text-orange-400",
    bg: "bg-orange-500/20",
    border: "border-orange-500/30",
    label: "Updating",
    pulse: true
  },
}

const nodeTypeConfig = {
  local: { icon: HardDrive, label: "Local", color: "text-purple-400" },
  cloud: { icon: Cloud, label: "Cloud", color: "text-blue-400" },
  hybrid: { icon: Network, label: "Hybrid", color: "text-pink-400" },
}

const nodeTypes = {
  deploymentNode: DeploymentNode,
  systemNode: SystemNode,
}

// Helper function to format uptime
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

function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return "Never"
  const then = new Date(value)
  if (Number.isNaN(then.getTime())) return "Unknown"

  const diffMs = Date.now() - then.getTime()
  if (diffMs < 60_000) return "Just now"
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function ShipsPage() {
  const initialDeploymentProfile: DeploymentProfile = "local_starship_build"

  const [deployments, setDeployments] = useState<Deployment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [includeForwarded, setIncludeForwarded] = useState(false)
  const [sourceNodeId, setSourceNodeId] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | Deployment["status"]>("all")
  const [infrastructureFilter, setInfrastructureFilter] = useState<"all" | InfrastructureKind>("all")
  const [subagents, setSubagents] = useState<any[]>([])
  const [runtime, setRuntime] = useState<RuntimeSnapshot | null>(null)
  const [isRuntimeLoading, setIsRuntimeLoading] = useState(true)
  const [formData, setFormData] = useState<DeploymentFormData>({
    name: "",
    description: "",
    subagentId: "",
    nodeId: "",
    nodeType: "local" as NodeType,
    deploymentProfile: initialDeploymentProfile,
    provisioningMode: "terraform_ansible" as ProvisioningMode,
    advancedNodeTypeOverride: false,
    nodeUrl: "",
    infrastructure: defaultInfrastructure(initialDeploymentProfile),
  })

  const derivedNodeType = useMemo(
    () => deriveNodeType(formData.deploymentProfile, formData.advancedNodeTypeOverride, formData.nodeType),
    [formData.advancedNodeTypeOverride, formData.deploymentProfile, formData.nodeType],
  )

  useEffect(() => {
    fetchDeployments()
  }, [includeForwarded, sourceNodeId])

  useEffect(() => {
    fetchSubagents()
    fetchRuntime()
    const timer = window.setInterval(() => {
      fetchRuntime()
    }, 20_000)

    return () => {
      window.clearInterval(timer)
    }
  }, [])

  useEventStream({
    enabled: true,
    types: ["ship.updated", "deployment.updated", "forwarding.received"],
    onEvent: () => {
      fetchDeployments()
      fetchRuntime()
    },
  })

  useEffect(() => {
    if (!showCreateForm) return
    if (!runtime || runtime.kind.clusters.length === 0) return
    if (formData.deploymentProfile !== "local_starship_build") return
    if (formData.infrastructure.kind !== "kind") return

    const defaultLocalContext = defaultInfrastructure("local_starship_build").kubeContext
    if (formData.infrastructure.kubeContext !== defaultLocalContext) return

    const preferredContext =
      runtime.kind.clusters.find((cluster) => cluster.runningNodeCount > 0)?.kubeContext ||
      runtime.kind.clusters[0]?.kubeContext

    if (!preferredContext || preferredContext === formData.infrastructure.kubeContext) {
      return
    }

    setFormData((current) => ({
      ...current,
      infrastructure: {
        ...current.infrastructure,
        kubeContext: preferredContext,
      },
    }))
  }, [formData.deploymentProfile, formData.infrastructure.kind, formData.infrastructure.kubeContext, runtime, showCreateForm])

  const fetchDeployments = async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (includeForwarded) params.append("includeForwarded", "true")
      if (sourceNodeId.trim()) params.append("sourceNodeId", sourceNodeId.trim())
      const response = await fetch(`/api/ships?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setDeployments(data)
      }
    } catch (error) {
      console.error("Error fetching ships:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchSubagents = async () => {
    try {
      const response = await fetch("/api/subagents")
      if (response.ok) {
        const data = await response.json()
        setSubagents(data)
      }
    } catch (error) {
      console.error("Error fetching subagents:", error)
    }
  }

  const fetchRuntime = async () => {
    setIsRuntimeLoading(true)
    try {
      const response = await fetch("/api/ships/runtime")
      if (response.ok) {
        const payload = (await response.json()) as RuntimeSnapshot
        setRuntime(payload)
      }
    } catch (error) {
      console.error("Error fetching local runtime state:", error)
    } finally {
      setIsRuntimeLoading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsCreating(true)

    try {
      const response = await fetch("/api/ships", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          subagentId: formData.subagentId || null,
          nodeId: formData.nodeId,
          nodeType: formData.nodeType,
          deploymentType: "ship",
          deploymentProfile: formData.deploymentProfile,
          provisioningMode: formData.provisioningMode,
          advancedNodeTypeOverride: formData.advancedNodeTypeOverride,
          nodeUrl: formData.nodeUrl || null,
          config: {
            infrastructure: formData.infrastructure,
          },
        }),
      })

      if (response.ok) {
        setShowCreateForm(false)
        setFormData({
          name: "",
          description: "",
          subagentId: "",
          nodeId: "",
          nodeType: "local",
          deploymentProfile: initialDeploymentProfile,
          provisioningMode: "terraform_ansible",
          advancedNodeTypeOverride: false,
          nodeUrl: "",
          infrastructure: defaultInfrastructure(initialDeploymentProfile),
        })
        fetchDeployments()
      }
    } catch (error) {
      console.error("Error creating deployment:", error)
    } finally {
      setIsCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this ship?")) return

    try {
      const response = await fetch(`/api/ships/${id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        fetchDeployments()
      }
    } catch (error) {
      console.error("Error deleting deployment:", error)
    }
  }

  const handleStatusUpdate = async (id: string, status: Deployment["status"]) => {
    try {
      const response = await fetch(`/api/ships/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      })

      if (response.ok) {
        fetchDeployments()
      }
    } catch (error) {
      console.error("Error updating deployment:", error)
    }
  }

  const deploymentsWithInfrastructure = useMemo<DeploymentWithInfrastructure[]>(
    () =>
      deployments.map((deployment) => ({
        ...deployment,
        infrastructure: extractInfrastructureConfig(
          deployment.config,
          deployment.deploymentProfile,
        ),
      })),
    [deployments],
  )

  const filteredDeployments = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()

    return deploymentsWithInfrastructure.filter((deployment) => {
      if (
        statusFilter !== "all" &&
        deployment.status !== statusFilter
      ) {
        return false
      }

      const infrastructureKind = deployment.infrastructure?.kind
      if (
        infrastructureFilter !== "all" &&
        infrastructureKind !== infrastructureFilter
      ) {
        return false
      }

      if (!normalizedQuery) {
        return true
      }

      return [
        deployment.name,
        deployment.nodeId,
        deployment.subagent?.name || "",
        deployment.infrastructure?.kubeContext || "",
        deployment.infrastructure?.namespace || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    })
  }, [deploymentsWithInfrastructure, infrastructureFilter, searchQuery, statusFilter])

  const kindClustersByContext = useMemo(() => {
    const entries = runtime?.kind.clusters || []
    return new Map(entries.map((cluster) => [cluster.kubeContext, cluster]))
  }, [runtime])

  const fleetSummary = useMemo(() => {
    const total = deploymentsWithInfrastructure.length
    const active = deploymentsWithInfrastructure.filter(
      (deployment) => deployment.status === "active",
    ).length
    const failed = deploymentsWithInfrastructure.filter(
      (deployment) => deployment.status === "failed",
    ).length
    const localKinds = deploymentsWithInfrastructure.filter(
      (deployment) => deployment.infrastructure?.kind === "kind",
    ).length
    const readyKindClusters = (runtime?.kind.clusters || []).filter(
      (cluster) => cluster.kubeContextPresent && cluster.runningNodeCount > 0,
    ).length

    return {
      total,
      active,
      failed,
      localKinds,
      readyKindClusters,
      filtered: filteredDeployments.length,
    }
  }, [deploymentsWithInfrastructure, filteredDeployments.length, runtime])

  useEffect(() => {
    if (!selectedDeploymentId) return
    const isVisible = filteredDeployments.some((deployment) => deployment.id === selectedDeploymentId)
    if (!isVisible) {
      setSelectedDeploymentId(filteredDeployments[0]?.id || null)
    }
  }, [filteredDeployments, selectedDeploymentId])

  const fleetNodes = useMemo(() => {
    const deploymentInputs = filteredDeployments.map((deployment) => ({
      id: deployment.id,
      name: deployment.name,
      status: deployment.status,
      nodeType: deployment.nodeType,
      deploymentProfile: deployment.deploymentProfile,
      provisioningMode: deployment.provisioningMode,
      infrastructureKind: deployment.infrastructure?.kind,
      meta: deployment.subagent?.name || deployment.nodeId,
    }))

    const localInputs = deploymentInputs.filter((item) => item.nodeType === "local")
    const cloudInputs = deploymentInputs.filter((item) => item.nodeType === "cloud")
    const hybridInputs = deploymentInputs.filter((item) => item.nodeType === "hybrid")

    const anchorInputs = [
      {
        id: "anchor-local",
        label: "Local Nodes",
        status: "nominal" as const,
        detail: `${localInputs.length} ships`,
      },
      {
        id: "anchor-cloud",
        label: "Cloud Nodes",
        status: "nominal" as const,
        detail: `${cloudInputs.length} ships`,
      },
      {
        id: "anchor-hybrid",
        label: "Hybrid Nodes",
        status: "nominal" as const,
        detail: `${hybridInputs.length} ships`,
      },
    ]

    const [localAnchor, cloudAnchor, hybridAnchor] = mapAnchorsToNodes(anchorInputs)

    const localNodes = mapDeploymentsToNodes(localInputs, selectedDeploymentId || undefined)
    const cloudNodes = mapDeploymentsToNodes(cloudInputs, selectedDeploymentId || undefined)
    const hybridNodes = mapDeploymentsToNodes(hybridInputs, selectedDeploymentId || undefined)

    return layoutColumns(
      [
        { key: "local", nodes: [localAnchor, ...localNodes] },
        { key: "cloud", nodes: [cloudAnchor, ...cloudNodes] },
        { key: "hybrid", nodes: [hybridAnchor, ...hybridNodes] },
      ],
      260,
      150
    )
  }, [filteredDeployments, selectedDeploymentId])

  const fleetEdges = useMemo(() => {
    const edgeItems = filteredDeployments.map((deployment) => ({
      id: deployment.id,
      status: deployment.status,
      anchorId: `anchor-${deployment.nodeType}`,
    }))
    return buildEdgesToAnchors(edgeItems)
  }, [filteredDeployments])

  const quartermasterShip = useMemo(() => {
    if (selectedDeploymentId) {
      const selected = filteredDeployments.find((deployment) => deployment.id === selectedDeploymentId)
      if (selected) {
        return selected
      }
    }

    return filteredDeployments[0] || null
  }, [filteredDeployments, selectedDeploymentId])

  const handleFleetNodeClick = (_: unknown, node: Node) => {
    if (node.type === "deploymentNode") {
      setSelectedDeploymentId(node.id)
    }
  }

  return (
    <div className="min-h-screen gradient-orb perspective p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20">
              <Rocket className="w-8 h-8 text-purple-400" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
              Ships
            </h1>
          </div>
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all duration-300 stack-2 transform hover:scale-105"
          >
            <Rocket className="w-5 h-5" />
            Launch Ship
          </button>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-gray-500">Total ships</p>
            <p className="mt-1 text-lg font-semibold text-white">{fleetSummary.total}</p>
          </div>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-emerald-300/80">Active ships</p>
            <p className="mt-1 text-lg font-semibold text-emerald-300">{fleetSummary.active}</p>
          </div>
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-red-300/80">Failed ships</p>
            <p className="mt-1 text-lg font-semibold text-red-300">{fleetSummary.failed}</p>
          </div>
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-cyan-300/80">Kind targets</p>
            <p className="mt-1 text-lg font-semibold text-cyan-200">{fleetSummary.localKinds}</p>
          </div>
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-blue-300/80">Ready kind clusters</p>
            <p className="mt-1 text-lg font-semibold text-blue-200">{fleetSummary.readyKindClusters}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-gray-500">Showing</p>
            <p className="mt-1 text-lg font-semibold text-white">{fleetSummary.filtered}</p>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-5">
          <label className="lg:col-span-2 flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-gray-300">
            <Search className="h-4 w-4 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ship, node, context, namespace"
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-gray-500"
            />
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | Deployment["status"])}
            className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-white"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="deploying">Deploying</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="failed">Failed</option>
            <option value="updating">Updating</option>
          </select>
          <select
            value={infrastructureFilter}
            onChange={(e) => setInfrastructureFilter(e.target.value as "all" | InfrastructureKind)}
            className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-white"
          >
            <option value="all">All infrastructure</option>
            <option value="kind">{infrastructureKindLabels.kind}</option>
            <option value="minikube">{infrastructureKindLabels.minikube}</option>
            <option value="existing_k8s">{infrastructureKindLabels.existing_k8s}</option>
          </select>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setSearchQuery("")
                setStatusFilter("all")
                setInfrastructureFilter("all")
              }}
              className="w-full rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-gray-300 hover:bg-white/[0.08] transition-all"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => fetchRuntime()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-500/20 transition-all"
            >
              <RefreshCw className={`h-4 w-4 ${isRuntimeLoading ? "animate-spin" : ""}`} />
              Runtime
            </button>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={includeForwarded}
              onChange={(e) => setIncludeForwarded(e.target.checked)}
            />
            Include forwarded
          </label>
          <input
            type="text"
            value={sourceNodeId}
            onChange={(e) => setSourceNodeId(e.target.value)}
            placeholder="Source node filter"
            className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-white"
          />
        </div>

        <OrchestrationSurface level={4} className="mb-8 bg-white/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Local Runtime</h2>
            <span className="text-xs text-gray-500">
              Last check: {formatRelativeTime(runtime?.checkedAt)}
            </span>
          </div>
          {isRuntimeLoading && !runtime ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-gray-400">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Inspecting Docker and kind runtime...
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-gray-500">Docker context</p>
                <div className="mt-1 flex items-center gap-2">
                  <Server className="h-4 w-4 text-cyan-300" />
                  <span className="text-sm font-medium text-white">
                    {runtime?.docker.currentContext || "Unavailable"}
                  </span>
                  {runtime?.docker.currentContext === "desktop-linux" ? (
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300">
                      Desktop ready
                    </span>
                  ) : (
                    <span className="rounded-full border border-yellow-500/30 bg-yellow-500/15 px-2 py-0.5 text-[10px] text-yellow-200">
                      Not desktop-linux
                    </span>
                  )}
                </div>
                {runtime?.docker.error && (
                  <p className="mt-1 text-xs text-red-300">{runtime.docker.error}</p>
                )}
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-gray-500">kind clusters</p>
                <div className="mt-1 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-300" />
                  <span className="text-sm font-medium text-white">
                    {runtime?.kind.clusters.length || 0} detected
                  </span>
                </div>
                {runtime?.kind.error && (
                  <p className="mt-1 text-xs text-red-300">{runtime.kind.error}</p>
                )}
                {!runtime?.kind.error && (runtime?.kind.clusters.length || 0) === 0 && (
                  <p className="mt-1 text-xs text-yellow-200">
                    No kind cluster found. Create one with `kind create cluster --name orchwiz`.
                  </p>
                )}
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-gray-500">Kube contexts</p>
                <div className="mt-1 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-purple-300" />
                  <span className="text-sm font-medium text-white">
                    {runtime?.kubernetes.currentContext || "Unavailable"}
                  </span>
                </div>
                {runtime?.kubernetes.error && (
                  <p className="mt-1 text-xs text-red-300">{runtime.kubernetes.error}</p>
                )}
              </div>
            </div>
          )}
          {!!runtime?.kind.clusters.length && (
            <div className="mt-3 flex flex-wrap gap-2">
              {runtime.kind.clusters.map((cluster) => (
                <div
                  key={cluster.kubeContext}
                  className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-gray-300"
                >
                  <span className="font-medium text-cyan-300">{cluster.name}</span>
                  {" · "}
                  {cluster.kubeContext}
                  {" · "}
                  {cluster.runningNodeCount}/{cluster.totalNodeCount || 0} nodes running
                </div>
              ))}
            </div>
          )}
        </OrchestrationSurface>

        <OrchestrationSurface level={4} className="mb-8 bg-white/5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Fleet Map</h2>
            <span className="text-xs text-gray-500 dark:text-gray-400">Interactive ship topology</span>
          </div>
          <div className="mt-4">
            <FlowCanvas
              nodes={fleetNodes}
              edges={fleetEdges}
              nodeTypes={nodeTypes}
              onNodeClick={handleFleetNodeClick}
              showMiniMap
              className="h-[360px]"
            />
          </div>
        </OrchestrationSurface>

        <OrchestrationSurface level={4} className="mb-8 bg-white/5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Quartermaster</h2>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {quartermasterShip ? `Ship: ${quartermasterShip.name}` : "No ship selected"}
            </span>
          </div>
          <ShipQuartermasterPanel
            shipDeploymentId={quartermasterShip?.id || null}
            shipName={quartermasterShip?.name}
            className="mt-3"
          />
        </OrchestrationSurface>

        {showCreateForm && (
          <OrchestrationSurface level={5} className="mb-8">
            <h2 className="text-2xl font-semibold mb-6">Launch New Ship</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                    placeholder="my-ship"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Subagent</label>
                  <select
                    value={formData.subagentId}
                    onChange={(e) => setFormData({ ...formData, subagentId: e.target.value })}
                    className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                  >
                    <option value="">None (Custom Agent)</option>
                    {subagents.map((subagent) => (
                      <option key={subagent.id} value={subagent.id}>
                        {subagent.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Node ID</label>
                  <input
                    type="text"
                    value={formData.nodeId}
                    onChange={(e) => setFormData({ ...formData, nodeId: e.target.value })}
                    required
                    className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                    placeholder="node-001"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Deployment Profile</label>
                  <select
                    value={formData.deploymentProfile}
                    onChange={(e) => {
                      const deploymentProfile = e.target.value as DeploymentProfile
                      const nodeType =
                        deploymentProfile === "local_starship_build"
                          ? "local"
                          : formData.nodeType === "hybrid"
                            ? "hybrid"
                            : "cloud"
                      setFormData({
                        ...formData,
                        deploymentProfile,
                        advancedNodeTypeOverride:
                          deploymentProfile === "cloud_shipyard" ? formData.advancedNodeTypeOverride : false,
                        nodeType,
                        infrastructure: defaultInfrastructure(deploymentProfile),
                      })
                    }}
                    className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                  >
                    <option value="local_starship_build">Local Starship Build</option>
                    <option value="cloud_shipyard">Cloud Shipyard</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-2">Provisioning Mode</label>
                  <select
                    value={formData.provisioningMode}
                    onChange={(e) =>
                      setFormData({ ...formData, provisioningMode: e.target.value as ProvisioningMode })
                    }
                    className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                  >
                    <option value="terraform_ansible">Terraform + Ansible</option>
                    <option value="terraform_only" disabled>
                      Terraform only (coming soon)
                    </option>
                    <option value="ansible_only" disabled>
                      Ansible only (coming soon)
                    </option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    {provisioningModeLabels[formData.provisioningMode]}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-2">Derived Node Type</label>
                  <div className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20 text-sm">
                    {deploymentProfileLabels[formData.deploymentProfile]}
                    {" -> "}
                    {nodeTypeConfig[derivedNodeType].label}
                  </div>
                  {formData.deploymentProfile === "cloud_shipyard" && (
                    <div className="mt-2 space-y-2">
                      <label className="inline-flex items-center gap-2 text-sm text-gray-300">
                        <input
                          type="checkbox"
                          checked={formData.advancedNodeTypeOverride}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              advancedNodeTypeOverride: e.target.checked,
                              nodeType: e.target.checked ? formData.nodeType : "cloud",
                            })
                          }
                        />
                        Advanced override (allow hybrid)
                      </label>
                      {formData.advancedNodeTypeOverride && (
                        <select
                          value={formData.nodeType}
                          onChange={(e) => setFormData({ ...formData, nodeType: e.target.value as NodeType })}
                          className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                        >
                          <option value="cloud">Cloud</option>
                          <option value="hybrid">Hybrid</option>
                        </select>
                      )}
                    </div>
                  )}
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-2">Node URL (optional)</label>
                  <input
                    type="url"
                    value={formData.nodeUrl}
                    onChange={(e) => setFormData({ ...formData, nodeUrl: e.target.value })}
                    className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                    placeholder="https://node.example.com"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-2">Infrastructure (config.infrastructure)</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <select
                      value={formData.infrastructure.kind}
                      onChange={(e) => {
                        const selectedKind = e.target.value as InfrastructureKind
                        const infrastructureKind =
                          formData.deploymentProfile === "cloud_shipyard" ? "existing_k8s" : selectedKind
                        setFormData({
                          ...formData,
                          infrastructure: {
                            ...formData.infrastructure,
                            kind: infrastructureKind,
                            kubeContext: kubeContextForKind(infrastructureKind),
                          },
                        })
                      }}
                      disabled={formData.deploymentProfile === "cloud_shipyard"}
                      className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                    >
                      {formData.deploymentProfile === "cloud_shipyard" ? (
                        <option value="existing_k8s">
                          {infrastructureKindLabels.existing_k8s}
                        </option>
                      ) : (
                        <>
                          <option value="kind">{infrastructureKindLabels.kind}</option>
                          <option value="minikube">{infrastructureKindLabels.minikube}</option>
                        </>
                      )}
                    </select>
                    <input
                      type="text"
                      value={formData.infrastructure.kubeContext}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          infrastructure: { ...formData.infrastructure, kubeContext: e.target.value },
                        })
                      }
                      className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                      placeholder="kube context"
                    />
                    <input
                      type="text"
                      value={formData.infrastructure.namespace}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          infrastructure: { ...formData.infrastructure, namespace: e.target.value },
                        })
                      }
                      className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                      placeholder="namespace"
                    />
                    <input
                      type="text"
                      value={formData.infrastructure.terraformWorkspace}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          infrastructure: { ...formData.infrastructure, terraformWorkspace: e.target.value },
                        })
                      }
                      className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                      placeholder="terraform workspace"
                    />
                    <input
                      type="text"
                      value={formData.infrastructure.terraformEnvDir}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          infrastructure: { ...formData.infrastructure, terraformEnvDir: e.target.value },
                        })
                      }
                      className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                      placeholder="terraform environment directory"
                    />
                    <input
                      type="text"
                      value={formData.infrastructure.ansibleInventory}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          infrastructure: { ...formData.infrastructure, ansibleInventory: e.target.value },
                        })
                      }
                      className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                      placeholder="ansible inventory path"
                    />
                    <input
                      type="text"
                      value={formData.infrastructure.ansiblePlaybook}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          infrastructure: { ...formData.infrastructure, ansiblePlaybook: e.target.value },
                        })
                      }
                      className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                      placeholder="ansible playbook path"
                    />
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-2">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                    placeholder="Ship description..."
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all duration-300 disabled:opacity-50 stack-2"
                >
                  {isCreating ? "Launching..." : "Launch"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-6 py-3 glass dark:glass-dark rounded-xl border border-white/20 hover:bg-white/10 transition-all"
                >
                  Cancel
                </button>
              </div>
            </form>
          </OrchestrationSurface>
        )}

        {isLoading ? (
          <div className="text-center py-12">
            <RefreshCw className="w-8 h-8 text-purple-400 mx-auto mb-4 animate-spin" />
            <p className="text-gray-500 dark:text-gray-400">Loading ships...</p>
          </div>
        ) : fleetSummary.total === 0 ? (
          <OrchestrationSurface level={3} className="text-center py-12">
            <Rocket className="w-16 h-16 text-purple-400 mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-semibold mb-2">No Ships Yet</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Launch your first ship to start deploying applications by ship.
            </p>
            <div className="flex flex-wrap justify-center gap-2 mb-6">
              {Object.entries(nodeTypeInfo).map(([type, info]) => (
                <UseCaseBadge
                  key={type}
                  label={info.label}
                  variant={type === "local" ? "purple" : type === "cloud" ? "blue" : "pink"}
                />
              ))}
            </div>
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all"
            >
              Launch First Ship
            </button>
          </OrchestrationSurface>
        ) : filteredDeployments.length === 0 ? (
          <OrchestrationSurface level={3} className="text-center py-12">
            <AlertTriangle className="w-14 h-14 text-amber-300 mx-auto mb-4 opacity-80" />
            <h3 className="text-xl font-semibold mb-2">No Ships Match Filters</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Adjust search, status, or infrastructure filters to see your fleet.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("")
                setStatusFilter("all")
                setInfrastructureFilter("all")
              }}
              className="px-5 py-2.5 rounded-lg border border-white/20 bg-white/[0.04] hover:bg-white/[0.1] transition-all"
            >
              Reset Filters
            </button>
          </OrchestrationSurface>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredDeployments.map((deployment, index) => {
              const StatusIcon = statusConfig[deployment.status].icon
              const stackLevel = ((index % 5) + 1) as 1 | 2 | 3 | 4 | 5
              const statusInfo = statusConfig[deployment.status]
              const isSelected = deployment.id === selectedDeploymentId
              const kindCluster =
                deployment.infrastructure?.kind === "kind"
                  ? kindClustersByContext.get(deployment.infrastructure.kubeContext)
                  : undefined
              const hasMissingKindContext =
                deployment.infrastructure?.kind === "kind" &&
                !!deployment.infrastructure.kubeContext &&
                !!runtime &&
                !kindCluster
              const hasStoppedKindCluster =
                !!kindCluster && kindCluster.totalNodeCount > 0 && kindCluster.runningNodeCount === 0

              const frontContent = (
                <div className="h-full flex flex-col">
                  {/* Header with Status */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20">
                        {deployment.subagent ? (
                          <Bot className="w-5 h-5 text-purple-400" />
                        ) : (
                          <Rocket className="w-5 h-5 text-purple-400" />
                        )}
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold leading-tight">{deployment.name}</h3>
                        {deployment.subagent && (
                          <span className="text-xs text-purple-400">{deployment.subagent.name}</span>
                        )}
                      </div>
                    </div>
                    <div
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${statusInfo.bg} ${statusInfo.border}`}
                    >
                      <StatusIcon
                        className={`w-3.5 h-3.5 ${statusInfo.color} ${statusInfo.pulse ? "animate-pulse" : ""}`}
                      />
                      <span className={`text-xs font-medium ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                  </div>

                  {/* Description */}
                  {deployment.description && (
                    <p className="text-sm text-gray-400 mb-4 line-clamp-2">
                      {deployment.description}
                    </p>
                  )}

                  {deployment.infrastructure && (
                    <div className="mb-3 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300">
                        {infrastructureKindLabels[deployment.infrastructure.kind]}
                      </span>
                      <span className="rounded-full border border-white/20 bg-white/[0.05] px-2 py-0.5 text-[10px] text-gray-300">
                        {deployment.infrastructure.kubeContext}
                      </span>
                      {deployment.infrastructure.kind === "kind" && kindCluster && kindCluster.runningNodeCount > 0 && (
                        <span className="rounded-full border border-green-500/30 bg-green-500/15 px-2 py-0.5 text-[10px] text-green-300">
                          kind ready ({kindCluster.runningNodeCount}/{kindCluster.totalNodeCount})
                        </span>
                      )}
                      {hasStoppedKindCluster && (
                        <span className="rounded-full border border-yellow-500/30 bg-yellow-500/15 px-2 py-0.5 text-[10px] text-yellow-200">
                          kind cluster stopped
                        </span>
                      )}
                      {hasMissingKindContext && (
                        <span className="rounded-full border border-red-500/30 bg-red-500/15 px-2 py-0.5 text-[10px] text-red-200">
                          kind context missing
                        </span>
                      )}
                    </div>
                  )}

                  {/* Node Info Summary */}
                  <div className="flex-1 space-y-3">
                    <NodeInfoCard
                      nodeType={deployment.nodeType}
                      nodeId={deployment.nodeId}
                      nodeUrl={deployment.nodeUrl}
                      healthStatus={deployment.healthStatus}
                      deploymentProfile={deployment.deploymentProfile}
                      provisioningMode={deployment.provisioningMode}
                      infrastructure={deployment.infrastructure}
                      showCapabilities={false}
                      showConfig={false}
                      showSecurity={true}
                      showUseCases={true}
                      compact={true}
                    />
                  </div>

                  {/* Quick Actions */}
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/10">
                    <div className="flex items-center gap-1">
                      {deployment.healthStatus && (
                        <div
                          className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs ${
                            deployment.healthStatus === "healthy"
                              ? "bg-green-500/10 text-green-400"
                              : "bg-red-500/10 text-red-400"
                          }`}
                        >
                          <Activity className="w-3 h-3" />
                          <span className="capitalize">{deployment.healthStatus}</span>
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-500">Hover for deep details</span>
                  </div>
                </div>
              )

              const backContent = (
                <div className="h-full flex flex-col">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Settings className="w-4 h-4 text-gray-400" />
                      <h3 className="text-sm font-medium text-gray-300">Ship Details</h3>
                    </div>
                    <div
                      className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md ${statusInfo.bg}`}
                    >
                      <StatusIcon className={`w-3 h-3 ${statusInfo.color}`} />
                      <span className={`text-[10px] font-medium ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                  </div>

                  {/* Full Node Info */}
                  <div className="flex-1 overflow-hidden">
                    <NodeInfoCard
                      nodeType={deployment.nodeType}
                      nodeId={deployment.nodeId}
                      nodeUrl={deployment.nodeUrl}
                      healthStatus={deployment.healthStatus}
                      deployedAt={deployment.deployedAt}
                      deploymentProfile={deployment.deploymentProfile}
                      provisioningMode={deployment.provisioningMode}
                      infrastructure={deployment.infrastructure}
                      showCapabilities={true}
                      showConfig={true}
                      showSecurity={true}
                      showUseCases={false}
                      dataForwarding={{
                        enabled: deployment.nodeType !== "local" || !!deployment.metadata?.forwardingEnabled,
                        targetNode: deployment.metadata?.forwardTarget,
                        sourceNodes: deployment.metadata?.sourceNodeCount,
                      }}
                      metrics={
                        deployment.status === "active"
                          ? {
                              uptime: deployment.deployedAt
                                ? formatUptime(new Date(deployment.deployedAt))
                                : undefined,
                              activeSessions:
                                typeof deployment.metadata?.activeSessions === "number"
                                  ? deployment.metadata.activeSessions
                                  : undefined,
                            }
                          : undefined
                      }
                    />

                    {/* Subagent Details */}
                    {deployment.subagent && (
                      <div className="mt-3 pt-3 border-t border-white/10">
                        <div className="flex items-center gap-2 mb-1">
                          <Bot className="w-3.5 h-3.5 text-purple-400" />
                          <span className="text-xs font-medium text-purple-400">
                            {deployment.subagent.name}
                          </span>
                        </div>
                        {deployment.subagent.description && (
                          <p className="text-[10px] text-gray-500 line-clamp-2">
                            {deployment.subagent.description}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="mt-auto pt-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      {deployment.status === "active" ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleStatusUpdate(deployment.id, "inactive")
                          }}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 glass dark:glass-dark rounded-lg border border-orange-500/20 text-orange-400 hover:bg-orange-500/10 transition-all text-xs"
                        >
                          <Square className="w-3.5 h-3.5" />
                          Stop
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleStatusUpdate(deployment.id, "active")
                          }}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all text-xs"
                        >
                          <Play className="w-3.5 h-3.5" />
                          Start
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          navigator.clipboard.writeText(deployment.nodeId)
                        }}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 glass dark:glass-dark rounded-lg border border-white/20 hover:bg-white/10 transition-all text-xs"
                        title="Copy Node ID"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copy ID
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {deployment.nodeUrl && (
                        <a
                          href={deployment.nodeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 glass dark:glass-dark rounded-lg border border-blue-500/20 text-blue-400 hover:bg-blue-500/10 transition-all text-xs"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Open
                        </a>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(deployment.id)
                        }}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 glass dark:glass-dark rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-all text-xs"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )

              return (
                <FlipCard
                  key={deployment.id}
                  front={frontContent}
                  back={backContent}
                  level={stackLevel}
                  className={`h-full min-h-[340px] ${
                    isSelected ? "ring-2 ring-cyan-400/60 shadow-[0_0_20px_rgba(34,211,238,0.25)]" : ""
                  }`}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
