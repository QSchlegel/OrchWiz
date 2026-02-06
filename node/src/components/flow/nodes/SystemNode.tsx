"use client"

import { Handle, Position, type NodeProps } from "reactflow"

export interface SystemNodeData {
  title: string
  status: "nominal" | "warning" | "critical"
  detail?: string
}

const statusStyles = {
  nominal: "text-emerald-200",
  warning: "text-amber-200",
  critical: "text-rose-200",
}

export function SystemNode({ data, selected }: NodeProps<SystemNodeData>) {
  return (
    <div
      className={`min-w-[160px] rounded-xl border px-3 py-2.5 backdrop-blur ${
        selected
          ? "border-slate-200/70 bg-white/10 shadow-[0_0_20px_rgba(226,232,240,0.35)]"
          : "border-white/10 bg-white/5"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-100">{data.title}</p>
        <span className={`text-[10px] uppercase ${statusStyles[data.status]}`}>{data.status}</span>
      </div>
      {data.detail && <p className="mt-2 text-[11px] text-slate-400">{data.detail}</p>}
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}
