"use client"

import type { LucideIcon } from "lucide-react"
import { AlertTriangle, ArrowRightCircle, Bot, Database, Layers3 } from "lucide-react"
import { Handle, Position, type NodeProps } from "reactflow"

export type ContextNodeTone = "source" | "agent" | "layer" | "output" | "risk"

export interface ContextFlowNodeData {
  title: string
  subtitle?: string
  meta?: string
  badge?: string
  tone: ContextNodeTone
  agentId?: string
}

const toneStyles: Record<ContextNodeTone, { container: string; badge: string; icon: string }> = {
  source: {
    container: "border-cyan-400 bg-cyan-100 text-cyan-950 dark:border-cyan-400/55 dark:bg-cyan-500/18 dark:text-cyan-100",
    badge: "border-cyan-500 bg-cyan-200 text-cyan-900 dark:border-cyan-300/45 dark:bg-cyan-500/30 dark:text-cyan-50",
    icon: "text-cyan-800 dark:text-cyan-100",
  },
  agent: {
    container: "border-indigo-400 bg-indigo-100 text-indigo-950 dark:border-indigo-400/60 dark:bg-indigo-500/20 dark:text-indigo-100",
    badge: "border-indigo-500 bg-indigo-200 text-indigo-900 dark:border-indigo-300/45 dark:bg-indigo-500/32 dark:text-indigo-50",
    icon: "text-indigo-800 dark:text-indigo-100",
  },
  layer: {
    container: "border-fuchsia-400 bg-fuchsia-100 text-fuchsia-950 dark:border-fuchsia-400/55 dark:bg-fuchsia-500/20 dark:text-fuchsia-100",
    badge: "border-fuchsia-500 bg-fuchsia-200 text-fuchsia-900 dark:border-fuchsia-300/45 dark:bg-fuchsia-500/30 dark:text-fuchsia-50",
    icon: "text-fuchsia-800 dark:text-fuchsia-100",
  },
  output: {
    container: "border-emerald-400 bg-emerald-100 text-emerald-950 dark:border-emerald-400/55 dark:bg-emerald-500/20 dark:text-emerald-100",
    badge: "border-emerald-500 bg-emerald-200 text-emerald-900 dark:border-emerald-300/45 dark:bg-emerald-500/30 dark:text-emerald-50",
    icon: "text-emerald-800 dark:text-emerald-100",
  },
  risk: {
    container: "border-rose-400 bg-rose-100 text-rose-950 dark:border-rose-400/55 dark:bg-rose-500/20 dark:text-rose-100",
    badge: "border-rose-500 bg-rose-200 text-rose-900 dark:border-rose-300/45 dark:bg-rose-500/30 dark:text-rose-50",
    icon: "text-rose-800 dark:text-rose-100",
  },
}

const toneIcons: Record<ContextNodeTone, LucideIcon> = {
  source: Database,
  agent: Bot,
  layer: Layers3,
  output: ArrowRightCircle,
  risk: AlertTriangle,
}

export function ContextFlowNode({ data, selected }: NodeProps<ContextFlowNodeData>) {
  const style = toneStyles[data.tone]
  const Icon = toneIcons[data.tone]

  return (
    <div
      className={`min-w-[210px] max-w-[260px] rounded-xl border px-3 py-2.5 backdrop-blur ${
        style.container
      } ${selected ? "ring-2 ring-slate-900/15 shadow-[0_10px_24px_rgba(15,23,42,0.08),0_0_0_1px_rgba(15,23,42,0.12)] dark:ring-white/40 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.32)]" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Icon className={`h-3.5 w-3.5 shrink-0 ${style.icon}`} />
            <p className="truncate text-sm font-semibold">{data.title}</p>
          </div>
          {data.subtitle && <p className="mt-1 line-clamp-2 text-[11px] text-slate-600 dark:text-slate-300">{data.subtitle}</p>}
        </div>
        {data.badge && (
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${style.badge}`}>
            {data.badge}
          </span>
        )}
      </div>
      {data.meta && <p className="mt-2 text-[10px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{data.meta}</p>}
      <Handle id="target-left" type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle id="target-right" type="target" position={Position.Right} style={{ opacity: 0 }} />
      <Handle id="source-right" type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Handle id="source-left" type="source" position={Position.Left} style={{ opacity: 0 }} />
    </div>
  )
}
