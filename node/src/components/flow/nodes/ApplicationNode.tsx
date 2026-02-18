"use client"

import { Handle, Position, type NodeProps } from "reactflow"

export interface ApplicationNodeData {
  title: string
  status: string
  appType?: string
  shipName?: string
  nodeType?: string
  deploymentProfile?: string
  provisioningMode?: string
  infrastructureKind?: string
  healthStatus?: string
  version?: string
  port?: number
  deployedAt?: string
}

const appTypeAccent: Record<string, string> = {
  docker: "bg-blue-500",
  nodejs: "bg-emerald-500",
  python: "bg-amber-500",
  static: "bg-violet-500",
  n8n: "bg-cyan-500",
  custom: "bg-slate-500",
}

const healthDot: Record<string, string> = {
  healthy: "bg-emerald-400 shadow-emerald-400/50",
  degraded: "bg-amber-400 shadow-amber-400/50 animate-pulse",
  unhealthy: "bg-rose-400 shadow-rose-400/50",
}

const statusColor = (status: string) => {
  switch (status) {
    case "active":
      return "text-emerald-200 bg-emerald-500/10 border-emerald-500/30"
    case "deploying":
    case "updating":
      return "text-cyan-200 bg-cyan-500/10 border-cyan-500/30"
    case "failed":
      return "text-rose-200 bg-rose-500/10 border-rose-500/30"
    case "inactive":
      return "text-slate-300 bg-slate-500/10 border-slate-500/30"
    default:
      return "text-amber-200 bg-amber-500/10 border-amber-500/30"
  }
}

const isPulsingStatus = (status: string) => status === "deploying" || status === "updating"

export function ApplicationNode({ data, selected }: NodeProps<ApplicationNodeData>) {
  const accent = appTypeAccent[data.appType || ""] || "bg-slate-500"
  const health = data.healthStatus ? healthDot[data.healthStatus] : undefined

  return (
    <div
      className={`relative min-w-[185px] overflow-hidden rounded-xl border backdrop-blur transition-all duration-200 ${
        selected
          ? "border-cyan-400/70 bg-cyan-500/10 shadow-[0_0_20px_rgba(34,211,238,0.35)]"
          : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/[0.07]"
      }`}
    >
      {/* App-type accent bar */}
      <div className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-sm ${accent} ${selected ? "opacity-100" : "opacity-60"}`} />

      <div className="pl-4 pr-3 py-2.5">
        {/* Header row: title + status */}
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-semibold text-slate-100">{data.title}</p>
          <div className="flex items-center gap-1.5">
            {health && (
              <span className={`h-2 w-2 shrink-0 rounded-full shadow-[0_0_6px] ${health}`} />
            )}
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase ${statusColor(data.status)} ${isPulsingStatus(data.status) ? "animate-pulse" : ""}`}
            >
              {data.status}
            </span>
          </div>
        </div>

        {/* Info row: app type + node type */}
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-400">
          {data.appType && <span className="capitalize">{data.appType}</span>}
          {data.nodeType && (
            <>
              <span className="text-slate-600">|</span>
              <span>{data.nodeType}</span>
            </>
          )}
        </div>

        {/* Badges row: version + port */}
        {(data.version || data.port) && (
          <div className="mt-1.5 flex items-center gap-2">
            {data.version && (
              <span className="readout rounded border border-slate-500/30 bg-slate-500/10 px-1.5 py-0.5 text-slate-300">
                v{data.version}
              </span>
            )}
            {data.port && (
              <span className="font-mono text-[10px] text-slate-500">:{data.port}</span>
            )}
          </div>
        )}

        {/* Ship name */}
        {data.shipName && (
          <div className="mt-1 text-[10px] text-cyan-300/80">
            {data.shipName}
          </div>
        )}
      </div>

      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}
