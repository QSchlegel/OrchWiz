"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Package,
  Server,
  Cloud,
  HardDrive,
  Network,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Play,
  Square,
  Trash2,
  Activity,
  Globe,
  Box,
  Layers,
  Code,
  FileCode,
  Container,
  GitBranch,
  RefreshCw,
  ExternalLink,
  Copy,
  Settings,
  Terminal,
  Hash
} from "lucide-react"
import { OrchestrationSurface } from "@/components/orchestration/OrchestrationSurface"
import { FlipCard } from "@/components/orchestration/FlipCard"
import { NodeInfoCard, nodeTypeInfo, UseCaseBadge } from "@/components/orchestration/NodeInfoCard"
import { FlowCanvas } from "@/components/flow/FlowCanvas"
import { ApplicationNode, SystemNode } from "@/components/flow/nodes"
import { layoutColumns } from "@/lib/flow/layout"
import { buildEdgesToAnchors, mapAnchorsToNodes, mapApplicationsToNodes } from "@/lib/flow/mappers"
import type { Node } from "reactflow"
import { useEventStream } from "@/lib/realtime/useEventStream"
import Link from "next/link"

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

interface Application {
  id: string
  name: string
  description: string | null
  applicationType: "docker" | "nodejs" | "python" | "static" | "custom"
  image: string | null
  repository: string | null
  branch: string | null
  buildCommand: string | null
  startCommand: string | null
  port: number | null
  environment: any
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
  config: any
  metadata: any
  deployedAt: string | null
  lastHealthCheck: string | null
  healthStatus: string | null
  version: string | null
  createdAt: string
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
    icon: Package,
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
    icon: AlertCircle,
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

const appTypeConfig = {
  docker: {
    icon: Container,
    label: "Docker",
    color: "text-blue-400",
    bg: "bg-blue-500/20",
    description: "Containerized application"
  },
  nodejs: {
    icon: Code,
    label: "Node.js",
    color: "text-green-400",
    bg: "bg-green-500/20",
    description: "JavaScript runtime application"
  },
  python: {
    icon: FileCode,
    label: "Python",
    color: "text-yellow-400",
    bg: "bg-yellow-500/20",
    description: "Python application"
  },
  static: {
    icon: Layers,
    label: "Static",
    color: "text-purple-400",
    bg: "bg-purple-500/20",
    description: "Static file hosting"
  },
  custom: {
    icon: Box,
    label: "Custom",
    color: "text-gray-400",
    bg: "bg-gray-500/20",
    description: "Custom deployment"
  },
}

const nodeTypes = {
  applicationNode: ApplicationNode,
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

export default function ApplicationsPage() {
  const initialDeploymentProfile: DeploymentProfile = "local_starship_build"

  const [applications, setApplications] = useState<Application[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [includeForwarded, setIncludeForwarded] = useState(false)
  const [sourceNodeId, setSourceNodeId] = useState("")
  const [ships, setShips] = useState<ShipSelectorItem[]>([])
  const [isLoadingShips, setIsLoadingShips] = useState(true)
  const [formData, setFormData] = useState<ApplicationFormData>({
    name: "",
    description: "",
    applicationType: "docker" as Application["applicationType"],
    image: "",
    repository: "",
    branch: "main",
    buildCommand: "",
    startCommand: "",
    port: 3000,
    environment: {},
    shipDeploymentId: "",
    nodeId: "",
    nodeType: "local" as NodeType,
    deploymentProfile: initialDeploymentProfile,
    provisioningMode: "terraform_ansible" as ProvisioningMode,
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

  const applyShipToForm = (ship: ShipSelectorItem, current: ApplicationFormData): ApplicationFormData => {
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
  }

  const fetchShips = async () => {
    setIsLoadingShips(true)
    try {
      const response = await fetch("/api/ships")
      if (response.ok) {
        const data = (await response.json()) as ShipSelectorItem[]
        const nextShips = Array.isArray(data) ? data : []
        setShips(nextShips)
        setFormData((current) => {
          if (nextShips.length === 0) {
            return { ...current, shipDeploymentId: "" }
          }
          const existing = nextShips.find((ship) => ship.id === current.shipDeploymentId)
          if (existing) {
            return applyShipToForm(existing, current)
          }
          return applyShipToForm(nextShips[0], current)
        })
      }
    } catch (error) {
      console.error("Error fetching ships:", error)
    } finally {
      setIsLoadingShips(false)
    }
  }

  useEffect(() => {
    fetchShips()
  }, [])

  useEffect(() => {
    fetchApplications()
  }, [includeForwarded, sourceNodeId])

  useEventStream({
    enabled: true,
    types: ["ship.application.updated", "application.updated", "ship.updated", "forwarding.received"],
    onEvent: () => {
      fetchApplications()
      fetchShips()
    },
  })

  const fetchApplications = async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (includeForwarded) params.append("includeForwarded", "true")
      if (sourceNodeId.trim()) params.append("sourceNodeId", sourceNodeId.trim())
      const response = await fetch(`/api/applications?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setApplications(data)
      }
    } catch (error) {
      console.error("Error fetching applications:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.shipDeploymentId) {
      return
    }
    setIsCreating(true)

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

      if (response.ok) {
        setShowCreateForm(false)
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
            shipDeploymentId: current.shipDeploymentId,
            nodeId: "",
            nodeType: "local",
            deploymentProfile: initialDeploymentProfile,
            provisioningMode: "terraform_ansible",
            advancedNodeTypeOverride: false,
            infrastructure: defaultInfrastructure(initialDeploymentProfile),
            nodeUrl: "",
            version: "",
          }
          const activeShip = ships.find((ship) => ship.id === base.shipDeploymentId)
          return activeShip ? applyShipToForm(activeShip, base) : base
        })
        fetchApplications()
      }
    } catch (error) {
      console.error("Error creating application:", error)
    } finally {
      setIsCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this application deployment?")) return

    try {
      const response = await fetch(`/api/applications/${id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        fetchApplications()
      }
    } catch (error) {
      console.error("Error deleting application:", error)
    }
  }

  const handleStatusUpdate = async (id: string, status: Application["status"]) => {
    try {
      const response = await fetch(`/api/applications/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      })

      if (response.ok) {
        fetchApplications()
      }
    } catch (error) {
      console.error("Error updating application:", error)
    }
  }

  const topologyNodes = useMemo(() => {
    const appInputs = applications.map((app) => {
      const infrastructure = extractInfrastructureConfig(app.config, app.deploymentProfile)
      return {
        id: app.id,
        name: app.name,
        status: app.status,
        nodeType: app.nodeType,
        applicationType: app.applicationType,
        shipName: app.ship?.name,
        deploymentProfile: app.deploymentProfile,
        provisioningMode: app.provisioningMode,
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
      150
    )
  }, [applications, selectedApplicationId])

  const topologyEdges = useMemo(() => {
    const edgeItems = applications.map((app) => ({
      id: app.id,
      status: app.status,
      anchorId: `anchor-${app.nodeType}`,
    }))
    return buildEdgesToAnchors(edgeItems)
  }, [applications])

  const handleTopologyNodeClick = (_: unknown, node: Node) => {
    if (node.type === "applicationNode") {
      setSelectedApplicationId(node.id)
    }
  }

  return (
    <div className="min-h-screen gradient-orb perspective p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20">
              <Package className="w-8 h-8 text-blue-400" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-400 bg-clip-text text-transparent">
              Application Deployments
            </h1>
          </div>
          <button
            onClick={() => setShowCreateForm(true)}
            disabled={isLoadingShips || ships.length === 0}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:from-blue-700 hover:to-cyan-700 transition-all duration-300 stack-2 transform hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
          >
            <Package className="w-5 h-5" />
            Deploy Application
          </button>
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
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Application Topology</h2>
            <span className="text-xs text-gray-500 dark:text-gray-400">Interactive runtime map</span>
          </div>
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
        </OrchestrationSurface>

        {showCreateForm && (
          <OrchestrationSurface level={5} className="mb-8">
            <h2 className="text-2xl font-semibold mb-6">Deploy New Application</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              {ships.length === 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                  No ships available. Launch a ship in{" "}
                  <Link href="/ship-yard" className="underline underline-offset-2">
                    Ship Yard
                  </Link>{" "}
                  before deploying applications.
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Application Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                    placeholder="my-app"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Application Type</label>
                  <select
                    value={formData.applicationType}
                    onChange={(e) => setFormData({ ...formData, applicationType: e.target.value as any })}
                    className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                  >
                    <option value="docker">Docker</option>
                    <option value="nodejs">Node.js</option>
                    <option value="python">Python</option>
                    <option value="static">Static</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-2">Target Ship</label>
                  <select
                    value={formData.shipDeploymentId}
                    onChange={(e) => {
                      const selectedId = e.target.value
                      const ship = ships.find((entry) => entry.id === selectedId)
                      if (!ship) {
                        setFormData({ ...formData, shipDeploymentId: selectedId })
                        return
                      }
                      setFormData((current) => applyShipToForm(ship, { ...current, shipDeploymentId: selectedId }))
                    }}
                    required
                    disabled={ships.length === 0}
                    className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20 disabled:opacity-60"
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
                    <p className="mt-1 text-xs text-cyan-300">
                      Deploying to {selectedShip.nodeType} node `{selectedShip.nodeId}` via {deploymentProfileLabels[selectedShip.deploymentProfile]}.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Node ID</label>
                  <input
                    type="text"
                    value={formData.nodeId}
                    onChange={(e) => setFormData({ ...formData, nodeId: e.target.value })}
                    required
                    readOnly
                    disabled
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
                    disabled
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
                    disabled
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
                          disabled
                        />
                        Advanced override (allow hybrid)
                      </label>
                      {formData.advancedNodeTypeOverride && (
                        <select
                          value={formData.nodeType}
                          onChange={(e) => setFormData({ ...formData, nodeType: e.target.value as NodeType })}
                          disabled
                          className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                        >
                          <option value="cloud">Cloud</option>
                          <option value="hybrid">Hybrid</option>
                        </select>
                      )}
                    </div>
                  )}
                </div>
                {formData.applicationType === "docker" && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium mb-2">Docker Image</label>
                    <input
                      type="text"
                      value={formData.image}
                      onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                      className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                      placeholder="nginx:latest or myregistry/myapp:v1.0"
                    />
                  </div>
                )}
                {(formData.applicationType === "nodejs" || formData.applicationType === "python" || formData.applicationType === "static") && (
                  <>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-2">Repository URL</label>
                      <input
                        type="url"
                        value={formData.repository}
                        onChange={(e) => setFormData({ ...formData, repository: e.target.value })}
                        className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                        placeholder="https://github.com/user/repo"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Branch</label>
                      <input
                        type="text"
                        value={formData.branch}
                        onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                        className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                        placeholder="main"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Port</label>
                      <input
                        type="number"
                        value={formData.port}
                        onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 3000 })}
                        className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                        placeholder="3000"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-2">Build Command (optional)</label>
                      <input
                        type="text"
                        value={formData.buildCommand}
                        onChange={(e) => setFormData({ ...formData, buildCommand: e.target.value })}
                        className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                        placeholder="npm install && npm run build"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-2">Start Command</label>
                      <input
                        type="text"
                        value={formData.startCommand}
                        onChange={(e) => setFormData({ ...formData, startCommand: e.target.value })}
                        className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                        placeholder="npm start or python app.py"
                      />
                    </div>
                  </>
                )}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-2">Node URL (optional)</label>
                  <input
                    type="url"
                    value={formData.nodeUrl}
                    onChange={(e) => setFormData({ ...formData, nodeUrl: e.target.value })}
                    readOnly
                    disabled
                    className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                    placeholder="https://node.example.com"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-2">Infrastructure (config.infrastructure)</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 opacity-70 pointer-events-none">
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
                <div>
                  <label className="block text-sm font-medium mb-2">Version (optional)</label>
                  <input
                    type="text"
                    value={formData.version}
                    onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                    className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                    placeholder="v1.0.0"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-2">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                    placeholder="Application description..."
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={isCreating || ships.length === 0 || !formData.shipDeploymentId}
                  className="px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:from-blue-700 hover:to-cyan-700 transition-all duration-300 disabled:opacity-50 stack-2"
                >
                  {isCreating ? "Deploying..." : "Deploy"}
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
            <RefreshCw className="w-8 h-8 text-blue-400 mx-auto mb-4 animate-spin" />
            <p className="text-gray-500 dark:text-gray-400">Loading applications...</p>
          </div>
        ) : applications.length === 0 ? (
          <OrchestrationSurface level={3} className="text-center py-12">
            <Package className="w-16 h-16 text-blue-400 mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-semibold mb-2">No Applications Yet</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Deploy your first application to get started with Orchwiz.
            </p>
            <div className="flex flex-wrap justify-center gap-2 mb-6">
              {Object.entries(appTypeConfig).map(([type, config]) => (
                <UseCaseBadge
                  key={type}
                  label={config.label}
                  variant={type === "docker" ? "blue" : type === "nodejs" ? "green" : type === "python" ? "orange" : "purple"}
                />
              ))}
            </div>
            {ships.length === 0 ? (
              <Link
                href="/ship-yard"
                className="inline-flex px-6 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl hover:from-indigo-700 hover:to-violet-700 transition-all"
              >
                Open Ship Yard
              </Link>
            ) : (
              <button
                onClick={() => setShowCreateForm(true)}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:from-blue-700 hover:to-cyan-700 transition-all"
              >
                Deploy First Application
              </button>
            )}
          </OrchestrationSurface>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {applications.map((application, index) => {
              const StatusIcon = statusConfig[application.status].icon
              const AppTypeIcon = appTypeConfig[application.applicationType].icon
              const appTypeInfo = appTypeConfig[application.applicationType]
              const statusInfo = statusConfig[application.status]
              const stackLevel = ((index % 5) + 1) as 1 | 2 | 3 | 4 | 5
              const isSelected = application.id === selectedApplicationId

              const frontContent = (
                <div className="h-full flex flex-col">
                  {/* Header with Status */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl ${appTypeInfo.bg}`}>
                        <AppTypeIcon className={`w-5 h-5 ${appTypeInfo.color}`} />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold leading-tight">{application.name}</h3>
                        <span className={`text-xs ${appTypeInfo.color}`}>{appTypeInfo.label}</span>
                        {application.ship?.name && (
                          <span className="ml-2 text-xs text-cyan-300">on {application.ship.name}</span>
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
                  {application.description && (
                    <p className="text-sm text-gray-400 mb-4 line-clamp-2">
                      {application.description}
                    </p>
                  )}

                  {/* Application Info */}
                  <div className="flex-1 space-y-2">
                    {/* Docker Image or Repository */}
                    {application.image && (
                      <div className="flex items-center gap-2 text-xs">
                        <Container className="w-3.5 h-3.5 text-blue-400" />
                        <code className="bg-black/30 px-1.5 py-0.5 rounded font-mono text-gray-300 truncate max-w-[200px]">
                          {application.image}
                        </code>
                      </div>
                    )}
                    {application.repository && (
                      <div className="flex items-center gap-2 text-xs">
                        <GitBranch className="w-3.5 h-3.5 text-purple-400" />
                        <span className="text-gray-400 truncate max-w-[180px]">
                          {application.repository.replace('https://github.com/', '')}
                        </span>
                        {application.branch && (
                          <code className="bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded text-[10px]">
                            {application.branch}
                          </code>
                        )}
                      </div>
                    )}

                    {/* Port & Version */}
                    <div className="flex items-center gap-3 text-xs">
                      {application.port && (
                        <div className="flex items-center gap-1.5 text-cyan-400">
                          <Hash className="w-3 h-3" />
                          <span>:{application.port}</span>
                        </div>
                      )}
                      {application.version && (
                        <div className="flex items-center gap-1.5 text-gray-400">
                          <Layers className="w-3 h-3" />
                          <span>{application.version}</span>
                        </div>
                      )}
                    </div>

                    {/* Node Info Summary */}
                    <div className="pt-2 mt-2 border-t border-white/5">
                      <NodeInfoCard
                        nodeType={application.nodeType}
                        nodeId={application.nodeId}
                        nodeUrl={application.nodeUrl}
                        healthStatus={application.healthStatus}
                        deploymentProfile={application.deploymentProfile}
                        provisioningMode={application.provisioningMode}
                        infrastructure={extractInfrastructureConfig(
                          application.config,
                          application.deploymentProfile,
                        )}
                        showCapabilities={false}
                        showConfig={false}
                        showSecurity={false}
                        showUseCases={false}
                        compact={true}
                      />
                    </div>
                  </div>

                  {/* Quick Status */}
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/10">
                    <div className="flex items-center gap-2">
                      {application.healthStatus && (
                        <div
                          className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs ${
                            application.healthStatus === "healthy"
                              ? "bg-green-500/10 text-green-400"
                              : "bg-red-500/10 text-red-400"
                          }`}
                        >
                          <Activity className="w-3 h-3" />
                          <span className="capitalize">{application.healthStatus}</span>
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-500">Hover to see details</span>
                  </div>
                </div>
              )

              const backContent = (
                <div className="h-full flex flex-col">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Settings className="w-4 h-4 text-gray-400" />
                      <h3 className="text-sm font-medium text-gray-300">Application Details</h3>
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

                  {/* Application Details */}
                  <div className="flex-1 space-y-3 overflow-hidden">
                    {/* Type Info */}
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${appTypeInfo.bg}`}>
                        <AppTypeIcon className={`w-3.5 h-3.5 ${appTypeInfo.color}`} />
                      </div>
                      <div>
                        <div className={`text-xs font-medium ${appTypeInfo.color}`}>
                          {appTypeInfo.label}
                        </div>
                        <div className="text-[10px] text-gray-500">{appTypeInfo.description}</div>
                      </div>
                    </div>

                    {/* Build & Run Commands */}
                    {(application.buildCommand || application.startCommand) && (
                      <div className="space-y-1.5">
                        {application.buildCommand && (
                          <div className="flex items-start gap-2">
                            <Terminal className="w-3 h-3 text-orange-400 mt-0.5" />
                            <div>
                              <div className="text-[10px] text-gray-500">Build</div>
                              <code className="text-[10px] text-orange-300 font-mono">
                                {application.buildCommand}
                              </code>
                            </div>
                          </div>
                        )}
                        {application.startCommand && (
                          <div className="flex items-start gap-2">
                            <Play className="w-3 h-3 text-green-400 mt-0.5" />
                            <div>
                              <div className="text-[10px] text-gray-500">Start</div>
                              <code className="text-[10px] text-green-300 font-mono">
                                {application.startCommand}
                              </code>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Node Info */}
                    <div className="pt-2 border-t border-white/10">
                      <NodeInfoCard
                        nodeType={application.nodeType}
                        nodeId={application.nodeId}
                        nodeUrl={application.nodeUrl}
                        healthStatus={application.healthStatus}
                        deployedAt={application.deployedAt}
                        deploymentProfile={application.deploymentProfile}
                        provisioningMode={application.provisioningMode}
                        infrastructure={extractInfrastructureConfig(
                          application.config,
                          application.deploymentProfile,
                        )}
                        showCapabilities={true}
                        showConfig={false}
                        showSecurity={true}
                        showUseCases={false}
                        metrics={
                          application.status === "active"
                            ? {
                                uptime: application.deployedAt
                                  ? formatUptime(new Date(application.deployedAt))
                                  : undefined,
                              }
                            : undefined
                        }
                        compact={false}
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-auto pt-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      {application.status === "active" ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleStatusUpdate(application.id, "inactive")
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
                            handleStatusUpdate(application.id, "active")
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
                          navigator.clipboard.writeText(application.nodeId)
                        }}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 glass dark:glass-dark rounded-lg border border-white/20 hover:bg-white/10 transition-all text-xs"
                        title="Copy Node ID"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copy ID
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {application.nodeUrl && (
                        <a
                          href={application.nodeUrl}
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
                          handleDelete(application.id)
                        }}
                        className={`flex items-center justify-center gap-1.5 px-3 py-2 glass dark:glass-dark rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-all text-xs ${
                          !application.nodeUrl ? "col-span-2" : ""
                        }`}
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
                  key={application.id}
                  front={frontContent}
                  back={backContent}
                  level={stackLevel}
                  className={`h-full min-h-[380px] ${
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
