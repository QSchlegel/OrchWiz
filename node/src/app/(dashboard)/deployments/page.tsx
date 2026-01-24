"use client"

import { useEffect, useState } from "react"
import {
  Rocket,
  Server,
  Cloud,
  Cpu,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Play,
  Square,
  Trash2,
  Network,
  Activity,
  Globe,
  HardDrive,
  Package,
  Bot,
  RefreshCw,
  ExternalLink,
  MoreVertical,
  Settings,
  Copy,
  Terminal
} from "lucide-react"
import { OrchestrationSurface, OrchestrationCard } from "@/components/orchestration/OrchestrationSurface"
import { NodeInfoCard, nodeTypeInfo, UseCaseBadge } from "@/components/orchestration/NodeInfoCard"
import { FlipCard } from "@/components/orchestration/FlipCard"

interface Deployment {
  id: string
  name: string
  description: string | null
  subagentId: string | null
  nodeId: string
  nodeType: "local" | "cloud" | "hybrid"
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

export default function DeploymentsPage() {
  const [deployments, setDeployments] = useState<Deployment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [subagents, setSubagents] = useState<any[]>([])
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    subagentId: "",
    nodeId: "",
    nodeType: "local" as "local" | "cloud" | "hybrid",
    nodeUrl: "",
    config: {},
  })

  useEffect(() => {
    fetchDeployments()
    fetchSubagents()
  }, [])

  const fetchDeployments = async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/deployments")
      if (response.ok) {
        const data = await response.json()
        setDeployments(data)
      }
    } catch (error) {
      console.error("Error fetching deployments:", error)
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsCreating(true)

    try {
      const response = await fetch("/api/deployments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formData,
          subagentId: formData.subagentId || null,
          nodeUrl: formData.nodeUrl || null,
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
          nodeUrl: "",
          config: {},
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
    if (!confirm("Are you sure you want to delete this deployment?")) return

    try {
      const response = await fetch(`/api/deployments/${id}`, {
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
      const response = await fetch(`/api/deployments/${id}`, {
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

  return (
    <div className="min-h-screen gradient-orb perspective p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20">
              <Rocket className="w-8 h-8 text-purple-400" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
              Agent Deployments
            </h1>
          </div>
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all duration-300 stack-2 transform hover:scale-105"
          >
            <Rocket className="w-5 h-5" />
            Deploy Agent
          </button>
        </div>

        {showCreateForm && (
          <OrchestrationSurface level={5} className="mb-8">
            <h2 className="text-2xl font-semibold mb-6">Deploy New Agent</h2>
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
                    placeholder="my-agent-deployment"
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
                  <label className="block text-sm font-medium mb-2">Node Type</label>
                  <select
                    value={formData.nodeType}
                    onChange={(e) => setFormData({ ...formData, nodeType: e.target.value as any })}
                    className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                  >
                    <option value="local">
                      <HardDrive className="w-4 h-4 inline mr-2" />
                      Local
                    </option>
                    <option value="cloud">Cloud</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
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
                  <label className="block text-sm font-medium mb-2">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                    placeholder="Deployment description..."
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all duration-300 disabled:opacity-50 stack-2"
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
            <RefreshCw className="w-8 h-8 text-purple-400 mx-auto mb-4 animate-spin" />
            <p className="text-gray-500 dark:text-gray-400">Loading deployments...</p>
          </div>
        ) : deployments.length === 0 ? (
          <OrchestrationSurface level={3} className="text-center py-12">
            <Rocket className="w-16 h-16 text-purple-400 mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-semibold mb-2">No Deployments Yet</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Deploy your first agent to get started with Orchwiz orchestration.
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
              Deploy First Agent
            </button>
          </OrchestrationSurface>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {deployments.map((deployment, index) => {
              const StatusIcon = statusConfig[deployment.status].icon
              const stackLevel = ((index % 5) + 1) as 1 | 2 | 3 | 4 | 5
              const nodeInfo = nodeTypeInfo[deployment.nodeType]
              const statusInfo = statusConfig[deployment.status]

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

                  {/* Node Info Summary */}
                  <div className="flex-1 space-y-3">
                    <NodeInfoCard
                      nodeType={deployment.nodeType}
                      nodeId={deployment.nodeId}
                      nodeUrl={deployment.nodeUrl}
                      healthStatus={deployment.healthStatus}
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
                      <h3 className="text-sm font-medium text-gray-300">Deployment Details</h3>
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
                              activeSessions: Math.floor(Math.random() * 5),
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
                  className="h-full min-h-[340px]"
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
