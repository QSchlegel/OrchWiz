"use client"

import { Handle, Position, type NodeProps } from "reactflow"

export interface StationNodeData {
  title: string
  role: string
  status: "online" | "busy" | "offline"
  load?: number
  meta?: string
}

const statusColors = {
  online: "bg-emerald-400",
  busy: "bg-amber-400",
  offline: "bg-rose-400",
}

export function StationNode({ data, selected }: NodeProps<StationNodeData>) {
  return (
    <div
      className={`min-w-[190px] rounded-xl border px-3 py-2.5 backdrop-blur ${
        selected
          ? "border-cyan-400/70 bg-cyan-500/10 shadow-[0_0_20px_rgba(34,211,238,0.35)]"
          : "border-white/10 bg-white/5"
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-100">{data.title}</p>
          <p className="text-[11px] text-slate-400">{data.role}</p>
        </div>
        <span className={`h-2.5 w-2.5 rounded-full ${statusColors[data.status]}`} />
      </div>
      {data.meta && <p className="mt-2 text-xs text-slate-300">{data.meta}</p>}
      {data.load !== undefined && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>Load</span>
            <span>{data.load}%</span>
          </div>
          <div className="mt-1 h-1.5 w-full rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-cyan-400/70"
              style={{ width: `${data.load}%` }}
            />
          </div>
        </div>
      )}
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  )
}
