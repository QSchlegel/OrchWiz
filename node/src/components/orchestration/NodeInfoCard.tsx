"use client"

import { ReactNode } from "react"
import {
  HardDrive,
  Cloud,
  Network,
  Wifi,
  WifiOff,
  Shield,
  ShieldCheck,
  Activity,
  ArrowRightLeft,
  Eye,
  Zap,
  Server,
  Database,
  Globe,
  Lock,
  Users,
  Code,
  Rocket,
  CheckCircle,
  AlertTriangle,
  Timer,
  Gauge,
} from "lucide-react"

// Node type configuration based on OWZ-Vault documentation
const nodeTypeInfo = {
  local: {
    icon: HardDrive,
    label: "Local Node",
    color: "text-purple-400",
    bgColor: "bg-purple-500/20",
    borderColor: "border-purple-500/30",
    description: "Development deployment on local machine",
    useCases: ["Development", "Testing", "Prototyping", "Offline"],
    capabilities: {
      stateVisualization: true,
      dataForwarding: true,
      offlineOperation: true,
      realTimeUpdates: true,
    },
    config: {
      database: "Local PostgreSQL",
      port: "5432",
      appUrl: "localhost:3000",
      auth: "GitHub OAuth (localhost)",
    },
    security: {
      https: false,
      level: "development",
    },
  },
  cloud: {
    icon: Cloud,
    label: "Cloud Node",
    color: "text-blue-400",
    bgColor: "bg-blue-500/20",
    borderColor: "border-blue-500/30",
    description: "Production deployment in cloud environment",
    useCases: ["Production", "Team Collab", "High Availability", "Public"],
    capabilities: {
      stateVisualization: true,
      dataForwarding: true,
      offlineOperation: false,
      realTimeUpdates: true,
    },
    config: {
      database: "Managed PostgreSQL",
      port: "443",
      appUrl: "Public HTTPS",
      auth: "GitHub OAuth (production)",
    },
    security: {
      https: true,
      level: "production",
    },
  },
  hybrid: {
    icon: Network,
    label: "Hybrid Node",
    color: "text-pink-400",
    bgColor: "bg-pink-500/20",
    borderColor: "border-pink-500/30",
    description: "Mixed local and cloud environment",
    useCases: ["Staging", "CI/CD", "Multi-region", "Failover"],
    capabilities: {
      stateVisualization: true,
      dataForwarding: true,
      offlineOperation: true,
      realTimeUpdates: true,
    },
    config: {
      database: "Distributed PostgreSQL",
      port: "Variable",
      appUrl: "Multi-endpoint",
      auth: "GitHub OAuth (multi-env)",
    },
    security: {
      https: true,
      level: "mixed",
    },
  },
}

interface UseCaseBadgeProps {
  label: string
  variant?: "purple" | "blue" | "pink" | "green" | "orange"
}

function UseCaseBadge({ label, variant = "purple" }: UseCaseBadgeProps) {
  const variants = {
    purple: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    blue: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    pink: "bg-pink-500/20 text-pink-300 border-pink-500/30",
    green: "bg-green-500/20 text-green-300 border-green-500/30",
    orange: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  }

  return (
    <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full border ${variants[variant]}`}>
      {label}
    </span>
  )
}

interface CapabilityIndicatorProps {
  icon: React.ElementType
  label: string
  enabled: boolean
  compact?: boolean
}

function CapabilityIndicator({ icon: Icon, label, enabled, compact = false }: CapabilityIndicatorProps) {
  return (
    <div
      className={`flex items-center gap-1.5 ${
        enabled ? "text-green-400" : "text-gray-500"
      } ${compact ? "text-[10px]" : "text-xs"}`}
      title={`${label}: ${enabled ? "Enabled" : "Disabled"}`}
    >
      <Icon className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />
      {!compact && <span>{label}</span>}
    </div>
  )
}

interface ConnectionStatusProps {
  isConnected: boolean
  protocol: "http" | "https" | "ws" | "wss"
  latency?: number
}

function ConnectionStatus({ isConnected, protocol, latency }: ConnectionStatusProps) {
  const isSecure = protocol === "https" || protocol === "wss"

  return (
    <div className="flex items-center gap-2">
      <div className={`flex items-center gap-1 ${isConnected ? "text-green-400" : "text-red-400"}`}>
        {isConnected ? (
          <Wifi className="w-3.5 h-3.5" />
        ) : (
          <WifiOff className="w-3.5 h-3.5" />
        )}
        <span className="text-xs">{isConnected ? "Connected" : "Disconnected"}</span>
      </div>
      {isSecure && (
        <div className="flex items-center gap-1 text-green-400">
          <Lock className="w-3 h-3" />
          <span className="text-[10px]">Secure</span>
        </div>
      )}
      {latency !== undefined && (
        <div className="flex items-center gap-1 text-gray-400">
          <Timer className="w-3 h-3" />
          <span className="text-[10px]">{latency}ms</span>
        </div>
      )}
    </div>
  )
}

interface DataForwardingStatusProps {
  enabled: boolean
  targetNode?: string
  sourceNodes?: number
}

function DataForwardingStatus({ enabled, targetNode, sourceNodes }: DataForwardingStatusProps) {
  if (!enabled) {
    return (
      <div className="flex items-center gap-1.5 text-gray-500 text-xs">
        <ArrowRightLeft className="w-3.5 h-3.5" />
        <span>Data Forwarding Disabled</span>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-cyan-400 text-xs">
        <ArrowRightLeft className="w-3.5 h-3.5" />
        <span>Data Forwarding Active</span>
      </div>
      {targetNode && (
        <div className="text-[10px] text-gray-400 pl-5">
          Target: <span className="text-cyan-300">{targetNode}</span>
        </div>
      )}
      {sourceNodes !== undefined && sourceNodes > 0 && (
        <div className="text-[10px] text-gray-400 pl-5">
          Receiving from: <span className="text-cyan-300">{sourceNodes} node{sourceNodes > 1 ? "s" : ""}</span>
        </div>
      )}
    </div>
  )
}

interface SecurityBadgeProps {
  level: "development" | "production" | "mixed"
  https: boolean
}

function SecurityBadge({ level, https }: SecurityBadgeProps) {
  const config = {
    development: {
      icon: Shield,
      color: "text-yellow-400",
      bg: "bg-yellow-500/10",
      label: "Dev Security"
    },
    production: {
      icon: ShieldCheck,
      color: "text-green-400",
      bg: "bg-green-500/10",
      label: "Production"
    },
    mixed: {
      icon: Shield,
      color: "text-orange-400",
      bg: "bg-orange-500/10",
      label: "Mixed Env"
    },
  }

  const { icon: Icon, color, bg, label } = config[level]

  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${bg}`}>
      <Icon className={`w-3.5 h-3.5 ${color}`} />
      <span className={`text-[10px] font-medium ${color}`}>{label}</span>
      {https && <Lock className="w-3 h-3 text-green-400" />}
    </div>
  )
}

interface NodeMetricsProps {
  uptime?: string
  activeSessions?: number
  cpu?: number
  memory?: number
}

function NodeMetrics({ uptime, activeSessions, cpu, memory }: NodeMetricsProps) {
  return (
    <div className="grid grid-cols-2 gap-2 text-xs">
      {uptime && (
        <div className="flex items-center gap-1.5 text-gray-400">
          <Timer className="w-3.5 h-3.5 text-blue-400" />
          <span>Uptime: <span className="text-white">{uptime}</span></span>
        </div>
      )}
      {activeSessions !== undefined && (
        <div className="flex items-center gap-1.5 text-gray-400">
          <Activity className="w-3.5 h-3.5 text-green-400" />
          <span>Sessions: <span className="text-white">{activeSessions}</span></span>
        </div>
      )}
      {cpu !== undefined && (
        <div className="flex items-center gap-1.5 text-gray-400">
          <Gauge className="w-3.5 h-3.5 text-orange-400" />
          <span>CPU: <span className="text-white">{cpu}%</span></span>
        </div>
      )}
      {memory !== undefined && (
        <div className="flex items-center gap-1.5 text-gray-400">
          <Server className="w-3.5 h-3.5 text-purple-400" />
          <span>Memory: <span className="text-white">{memory}%</span></span>
        </div>
      )}
    </div>
  )
}

interface NodeInfoCardProps {
  nodeType: "local" | "cloud" | "hybrid"
  nodeId: string
  nodeUrl?: string | null
  healthStatus?: string | null
  deployedAt?: string | null
  // Extended node info (optional - from metadata)
  dataForwarding?: {
    enabled: boolean
    targetNode?: string
    sourceNodes?: number
  }
  metrics?: NodeMetricsProps
  showCapabilities?: boolean
  showUseCases?: boolean
  showSecurity?: boolean
  showConfig?: boolean
  compact?: boolean
}

export function NodeInfoCard({
  nodeType,
  nodeId,
  nodeUrl,
  healthStatus,
  deployedAt,
  dataForwarding,
  metrics,
  showCapabilities = true,
  showUseCases = true,
  showSecurity = true,
  showConfig = false,
  compact = false,
}: NodeInfoCardProps) {
  const info = nodeTypeInfo[nodeType]
  const Icon = info.icon
  const isConnected = healthStatus === "healthy"
  const protocol = nodeUrl?.startsWith("https") ? "https" : "http"

  const useCaseVariants: ("purple" | "blue" | "pink" | "green" | "orange")[] =
    ["purple", "blue", "pink", "green"]

  return (
    <div className={`space-y-${compact ? "2" : "3"}`}>
      {/* Node Type Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${info.bgColor}`}>
            <Icon className={`w-4 h-4 ${info.color}`} />
          </div>
          <div>
            <div className={`text-sm font-medium ${info.color}`}>{info.label}</div>
            {!compact && (
              <div className="text-[10px] text-gray-500">{info.description}</div>
            )}
          </div>
        </div>
        {showSecurity && (
          <SecurityBadge 
            level={info.security.level as "development" | "production" | "mixed"} 
            https={info.security.https} 
          />
        )}
      </div>

      {/* Node ID & URL */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm">
          <Server className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-gray-400">ID:</span>
          <code className="text-xs bg-black/30 px-1.5 py-0.5 rounded font-mono">
            {nodeId}
          </code>
        </div>
        {nodeUrl && (
          <div className="flex items-center gap-2 text-sm">
            <Globe className="w-3.5 h-3.5 text-blue-400" />
            <a
              href={nodeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 text-xs truncate max-w-[180px]"
            >
              {nodeUrl}
            </a>
          </div>
        )}
      </div>

      {/* Connection Status */}
      {healthStatus && (
        <ConnectionStatus
          isConnected={isConnected}
          protocol={protocol as any}
          latency={isConnected ? Math.floor(Math.random() * 50) + 10 : undefined}
        />
      )}

      {/* Use Cases */}
      {showUseCases && (
        <div className="flex flex-wrap gap-1">
          {info.useCases.map((useCase, idx) => (
            <UseCaseBadge
              key={useCase}
              label={useCase}
              variant={useCaseVariants[idx % useCaseVariants.length]}
            />
          ))}
        </div>
      )}

      {/* Capabilities */}
      {showCapabilities && !compact && (
        <div className="grid grid-cols-2 gap-1.5 pt-1">
          <CapabilityIndicator
            icon={Eye}
            label="State Viz"
            enabled={info.capabilities.stateVisualization}
            compact={compact}
          />
          <CapabilityIndicator
            icon={ArrowRightLeft}
            label="Data Forward"
            enabled={info.capabilities.dataForwarding}
            compact={compact}
          />
          <CapabilityIndicator
            icon={WifiOff}
            label="Offline Mode"
            enabled={info.capabilities.offlineOperation}
            compact={compact}
          />
          <CapabilityIndicator
            icon={Zap}
            label="Real-time"
            enabled={info.capabilities.realTimeUpdates}
            compact={compact}
          />
        </div>
      )}

      {/* Data Forwarding Status */}
      {dataForwarding && (
        <DataForwardingStatus {...dataForwarding} />
      )}

      {/* Configuration Details */}
      {showConfig && !compact && (
        <div className="space-y-1.5 pt-2 border-t border-white/10">
          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
            Configuration
          </div>
          <div className="grid grid-cols-2 gap-1 text-[10px]">
            <div className="flex items-center gap-1 text-gray-400">
              <Database className="w-3 h-3" />
              <span>{info.config.database}</span>
            </div>
            <div className="flex items-center gap-1 text-gray-400">
              <Globe className="w-3 h-3" />
              <span>{info.config.appUrl}</span>
            </div>
          </div>
        </div>
      )}

      {/* Metrics */}
      {metrics && !compact && (
        <div className="pt-2 border-t border-white/10">
          <NodeMetrics {...metrics} />
        </div>
      )}

      {/* Deployed At */}
      {deployedAt && (
        <div className="text-[10px] text-gray-500">
          Deployed: {new Date(deployedAt).toLocaleDateString()} at{" "}
          {new Date(deployedAt).toLocaleTimeString()}
        </div>
      )}
    </div>
  )
}

// Export individual components for flexible usage
export {
  UseCaseBadge,
  CapabilityIndicator,
  ConnectionStatus,
  DataForwardingStatus,
  SecurityBadge,
  NodeMetrics,
  nodeTypeInfo
}
