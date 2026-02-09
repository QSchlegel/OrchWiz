"use client"

import { Handle, Position, type NodeProps } from "reactflow"

export interface RuntimeNodeData {
  title: string
  sublabel?: string
  status: "nominal" | "warning" | "critical" | "unknown"
  visualVariant?: "uss-k8s"
  commandTier?: number
}

const statusStyles = {
  nominal: "text-emerald-300",
  warning: "text-amber-300",
  critical: "text-rose-300",
  unknown: "text-slate-400",
}

export function RuntimeNode({ data, selected }: NodeProps<RuntimeNodeData>) {
  const isUssK8s = data.visualVariant === "uss-k8s"

  return (
    <div
      className={`relative min-w-[170px] rounded-lg border backdrop-blur transition-all duration-200 overflow-hidden ${
        isUssK8s
          ? selected
            ? "border-emerald-500/45 bg-emerald-50/90 shadow-[0_0_24px_rgba(52,211,153,0.18)] dark:border-emerald-300/75 dark:bg-gradient-to-br dark:from-emerald-500/20 dark:via-emerald-500/10 dark:to-slate-950/85 dark:shadow-[0_0_30px_rgba(52,211,153,0.24)]"
            : "border-slate-300/70 bg-white/90 hover:border-emerald-500/40 hover:bg-emerald-50/80 dark:border-white/18 dark:bg-slate-950/75 dark:hover:border-emerald-300/40 dark:hover:bg-slate-900/80"
          : selected
            ? "border-emerald-500/45 bg-emerald-100/80 shadow-[0_0_20px_rgba(52,211,153,0.16)] dark:border-emerald-400/50 dark:bg-gradient-to-br dark:from-emerald-500/[0.12] dark:to-emerald-900/[0.08] dark:shadow-[0_0_24px_rgba(52,211,153,0.2)]"
            : "border-slate-300/65 bg-white/90 hover:border-emerald-500/35 hover:bg-emerald-50/70 dark:border-white/8 dark:bg-white/[0.04] dark:hover:border-white/15 dark:hover:bg-white/[0.06]"
      }`}
    >
      <div className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-sm ${selected ? "bg-emerald-500 dark:bg-emerald-300" : "bg-emerald-500/50 dark:bg-emerald-400/50"}`} />

      <div className="pl-3.5 pr-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className={`truncate ${isUssK8s ? "text-[13px] font-semibold text-slate-900 dark:text-slate-50" : "text-[13px] font-semibold text-slate-900 dark:text-slate-100"}`}>
            {data.title}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            {isUssK8s && data.commandTier && (
              <span className="readout rounded border border-emerald-500/35 bg-emerald-500/12 px-1 py-0.5 text-emerald-700 dark:border-emerald-300/45 dark:text-emerald-100">
                C{data.commandTier}
              </span>
            )}
            <span className={`readout ${statusStyles[data.status]}`}>{data.status}</span>
          </div>
        </div>
        {data.sublabel && (
          <p className={`mt-0.5 uppercase tracking-wider truncate ${isUssK8s ? "text-[10.5px] text-emerald-700/80 dark:text-emerald-100/80" : "text-[10px] text-emerald-700/70 dark:text-emerald-300/50"}`}>
            {data.sublabel}
          </p>
        )}
      </div>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}
