"use client"

import { Handle, Position, type NodeProps } from "reactflow"

export interface StationNodeData {
  title: string
  role: string
  status: "online" | "busy" | "offline"
  load?: number
  meta?: string
  visualVariant?: "uss-k8s"
  commandTier?: number
}

const statusColors = {
  online: "bg-emerald-400",
  busy: "bg-amber-400",
  offline: "bg-rose-400",
}

const statusGlow = {
  online: "shadow-[0_0_6px_rgba(34,197,94,0.5)]",
  busy: "shadow-[0_0_6px_rgba(251,191,36,0.5)]",
  offline: "",
}

export function StationNode({ data, selected }: NodeProps<StationNodeData>) {
  const isUssK8s = data.visualVariant === "uss-k8s"

  return (
    <div
      className={`relative min-w-[190px] rounded-lg border backdrop-blur transition-all duration-200 overflow-hidden ${
        isUssK8s
          ? selected
            ? "border-cyan-500/45 bg-cyan-50/90 shadow-[0_0_28px_rgba(6,182,212,0.2)] dark:border-cyan-300/75 dark:bg-gradient-to-br dark:from-cyan-500/20 dark:via-cyan-500/10 dark:to-slate-950/85 dark:shadow-[0_0_30px_rgba(34,211,238,0.28)]"
            : "border-slate-300/70 bg-white/90 hover:border-cyan-500/40 hover:bg-cyan-50/80 dark:border-white/18 dark:bg-slate-950/75 dark:hover:border-cyan-300/40 dark:hover:bg-slate-900/80"
          : selected
            ? "border-cyan-500/45 bg-cyan-100/80 shadow-[0_0_22px_rgba(6,182,212,0.18)] dark:border-cyan-400/50 dark:bg-gradient-to-br dark:from-cyan-500/[0.12] dark:to-cyan-900/[0.08] dark:shadow-[0_0_24px_rgba(34,211,238,0.2)]"
            : "border-slate-300/65 bg-white/90 hover:border-cyan-500/35 hover:bg-cyan-50/70 dark:border-white/8 dark:bg-white/[0.04] dark:hover:border-white/15 dark:hover:bg-white/[0.06]"
      }`}
    >
      {/* LCARS accent bar */}
      <div className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-sm ${selected ? "bg-cyan-500 dark:bg-cyan-300" : "bg-cyan-500/50 dark:bg-cyan-400/50"}`} />

      <div className="pl-3.5 pr-3 py-2.5">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className={`truncate font-[family-name:var(--font-mono)] ${isUssK8s ? "text-[13px] font-semibold text-slate-900 dark:text-slate-50" : "text-[13px] font-semibold text-slate-900 dark:text-slate-100"}`}>
              {data.title}
            </p>
            <p className={`mt-0.5 uppercase tracking-wider ${isUssK8s ? "text-[10.5px] text-cyan-700/80 dark:text-cyan-100/80" : "text-[10px] text-cyan-700/70 dark:text-cyan-300/60"}`}>
              {data.role}
            </p>
          </div>
          <div className="ml-2 flex shrink-0 items-center gap-1.5">
            {isUssK8s && data.commandTier && (
              <span className="readout rounded border border-cyan-500/35 bg-cyan-500/12 px-1 py-0.5 text-cyan-700 dark:border-cyan-300/45 dark:text-cyan-100">
                C{data.commandTier}
              </span>
            )}
            <span className={`h-2 w-2 rounded-full ${statusColors[data.status]} ${statusGlow[data.status]}`} />
          </div>
        </div>
        {data.load !== undefined && (
          <div className="mt-2.5">
            <div className={`flex items-center justify-between text-[9px] font-[family-name:var(--font-mono)] uppercase tracking-wider ${isUssK8s ? "text-slate-600/80 dark:text-slate-300/75" : "text-slate-500 dark:text-slate-500"}`}>
              <span>Load</span>
              <span className={isUssK8s ? "text-slate-900 dark:text-slate-100" : "text-slate-700 dark:text-slate-300"}>{data.load}%</span>
            </div>
            <div className={`mt-1 h-[3px] w-full rounded-full ${isUssK8s ? "bg-slate-300/70 dark:bg-white/15" : "bg-slate-300/70 dark:bg-white/8"}`}>
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400/80 to-cyan-300/60 transition-all duration-500"
                style={{ width: `${data.load}%` }}
              />
            </div>
          </div>
        )}
      </div>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  )
}
