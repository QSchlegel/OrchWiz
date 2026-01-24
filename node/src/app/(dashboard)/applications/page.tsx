"use client"

import { useEffect, useState } from "react"
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
  nodeId: string
  nodeType: "local" | "cloud" | "hybrid"
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

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [formData, setFormData] = useState({
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
    nodeId: "",
    nodeType: "local" as "local" | "cloud" | "hybrid",
    nodeUrl: "",
    version: "",
  })

  useEffect(() => {
    fetchApplications()
  }, [])

  const fetchApplications = async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/applications")
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
    setIsCreating(true)

    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formData,
          port: formData.port || null,
          environment: formData.environment || {},
        }),
      })

      if (response.ok) {
        setShowCreateForm(false)
        setFormData({
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
          nodeId: "",
          nodeType: "local",
          nodeUrl: "",
          version: "",
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
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:from-blue-700 hover:to-cyan-700 transition-all duration-300 stack-2 transform hover:scale-105"
          >
            <Package className="w-5 h-5" />
            Deploy Application
          </button>
        </div>

        {showCreateForm && (
          <OrchestrationSurface level={5} className="mb-8">
            <h2 className="text-2xl font-semibold mb-6">Deploy New Application</h2>
            <form onSubmit={handleCreate} className="space-y-4">
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
                    <option value="local">Local</option>
                    <option value="cloud">Cloud</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
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
                    className="w-full px-4 py-2 glass dark:glass-dark rounded-lg border border-white/20"
                    placeholder="https://node.example.com"
                  />
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
                  disabled={isCreating}
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
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:from-blue-700 hover:to-cyan-700 transition-all"
            >
              Deploy First Application
            </button>
          </OrchestrationSurface>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {applications.map((application, index) => {
              const StatusIcon = statusConfig[application.status].icon
              const AppTypeIcon = appTypeConfig[application.applicationType].icon
              const appTypeInfo = appTypeConfig[application.applicationType]
              const statusInfo = statusConfig[application.status]
              const stackLevel = ((index % 5) + 1) as 1 | 2 | 3 | 4 | 5

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
                  className="h-full min-h-[380px]"
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
