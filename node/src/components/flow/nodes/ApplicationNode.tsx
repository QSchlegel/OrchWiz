"use client"

import { Handle, Position, type NodeProps } from "reactflow"

export interface ApplicationNodeData {
  title: string
  status: string
  appType?: string
  nodeType?: string
  deploymentProfile?: string
  provisioningMode?: string
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

export function ApplicationNode({ data, selected }: NodeProps<ApplicationNodeData>) {
  return (
    <div
      className={`min-w-[185px] rounded-xl border px-3 py-2.5 backdrop-blur ${
        selected
          ? "border-fuchsia-400/70 bg-fuchsia-500/10 shadow-[0_0_20px_rgba(217,70,239,0.35)]"
          : "border-white/10 bg-white/5"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-100 line-clamp-2">{data.title}</p>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${statusColor(data.status)}`}>
          {data.status}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
        {data.appType && <span>{data.appType}</span>}
        {data.nodeType && <span>{data.nodeType}</span>}
      </div>
      {(data.deploymentProfile || data.provisioningMode) && (
        <div className="mt-1 text-[10px] text-slate-500">
          {data.deploymentProfile && <span>{data.deploymentProfile}</span>}
          {data.provisioningMode && <span className="ml-2">{data.provisioningMode}</span>}
        </div>
      )}
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  )
}
