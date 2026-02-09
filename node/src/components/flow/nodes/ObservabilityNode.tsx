"use client"

import { Handle, Position, type NodeProps } from "reactflow"

export interface ObservabilityNodeData {
  title: string
  sublabel?: string
  status: "nominal" | "warning" | "critical" | "unknown"
  visualVariant?: "uss-k8s"
  commandTier?: number
  buildMode?: boolean
}

const statusStyles = {
  nominal: "text-emerald-300",
  warning: "text-amber-300",
  critical: "text-rose-300",
  unknown: "text-slate-400",
}

export function ObservabilityNode({ data, selected }: NodeProps<ObservabilityNodeData>) {
  const isUssK8s = data.visualVariant === "uss-k8s"

  return (
    <div
      className={`relative min-w-[170px] rounded-lg border backdrop-blur transition-all duration-200 overflow-hidden ${
        isUssK8s
          ? selected
            ? "border-violet-500/45 bg-violet-50/90 shadow-[0_0_24px_rgba(139,92,246,0.2)] dark:border-violet-300/75 dark:bg-gradient-to-br dark:from-violet-500/20 dark:via-violet-500/10 dark:to-slate-950/85 dark:shadow-[0_0_30px_rgba(139,92,246,0.28)]"
            : "border-slate-300/70 bg-white/90 hover:border-violet-500/40 hover:bg-violet-50/80 dark:border-white/18 dark:bg-slate-950/75 dark:hover:border-violet-300/40 dark:hover:bg-slate-900/80"
          : selected
            ? "border-violet-500/45 bg-violet-100/80 shadow-[0_0_20px_rgba(139,92,246,0.16)] dark:border-violet-400/50 dark:bg-gradient-to-br dark:from-violet-500/[0.12] dark:to-violet-900/[0.08] dark:shadow-[0_0_24px_rgba(139,92,246,0.2)]"
            : "border-slate-300/65 bg-white/90 hover:border-violet-500/35 hover:bg-violet-50/70 dark:border-white/8 dark:bg-white/[0.04] dark:hover:border-white/15 dark:hover:bg-white/[0.06]"
      }`}
    >
      <div className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-sm ${selected ? "bg-violet-500 dark:bg-violet-300" : "bg-violet-500/50 dark:bg-violet-400/50"}`} />

      <div className="pl-3.5 pr-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className={`truncate ${isUssK8s ? "text-[13px] font-semibold text-slate-900 dark:text-slate-50" : "text-[13px] font-semibold text-slate-900 dark:text-slate-100"}`}>
            {data.title}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            {isUssK8s && data.commandTier && (
              <span className="readout rounded border border-violet-500/35 bg-violet-500/12 px-1 py-0.5 text-violet-700 dark:border-violet-300/45 dark:text-violet-100">
                C{data.commandTier}
              </span>
            )}
            <span className={`readout ${statusStyles[data.status]}`}>{data.status}</span>
          </div>
        </div>
        {data.sublabel && (
          <p className={`mt-0.5 uppercase tracking-wider truncate ${isUssK8s ? "text-[10.5px] text-violet-700/80 dark:text-violet-100/80" : "text-[10px] text-violet-700/70 dark:text-violet-300/50"}`}>
            {data.sublabel}
          </p>
        )}
      </div>
      <Handle
        type="target"
        position={Position.Top}
        style={{ opacity: data.buildMode ? 1 : 0 }}
        className={data.buildMode ? "!h-3 !w-3 !border-2 !border-white !bg-violet-500 build-handle-pulse" : ""}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ opacity: data.buildMode ? 1 : 0 }}
        className={data.buildMode ? "!h-3 !w-3 !border-2 !border-white !bg-violet-500 build-handle-pulse" : ""}
      />
    </div>
  )
}
