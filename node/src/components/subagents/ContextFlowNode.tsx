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
    container: "border-cyan-500/35 bg-cyan-500/10 text-cyan-200",
    badge: "border-cyan-400/40 bg-cyan-500/20 text-cyan-100",
    icon: "text-cyan-300",
  },
  agent: {
    container: "border-indigo-500/40 bg-indigo-500/12 text-indigo-100",
    badge: "border-indigo-400/40 bg-indigo-500/20 text-indigo-50",
    icon: "text-indigo-200",
  },
  layer: {
    container: "border-fuchsia-500/35 bg-fuchsia-500/10 text-fuchsia-100",
    badge: "border-fuchsia-400/40 bg-fuchsia-500/20 text-fuchsia-100",
    icon: "text-fuchsia-200",
  },
  output: {
    container: "border-emerald-500/35 bg-emerald-500/12 text-emerald-100",
    badge: "border-emerald-400/40 bg-emerald-500/20 text-emerald-100",
    icon: "text-emerald-200",
  },
  risk: {
    container: "border-rose-500/40 bg-rose-500/12 text-rose-100",
    badge: "border-rose-400/40 bg-rose-500/20 text-rose-100",
    icon: "text-rose-200",
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
      } ${selected ? "ring-2 ring-white/40 shadow-[0_0_0_1px_rgba(255,255,255,0.32)]" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Icon className={`h-3.5 w-3.5 shrink-0 ${style.icon}`} />
            <p className="truncate text-sm font-semibold">{data.title}</p>
          </div>
          {data.subtitle && <p className="mt-1 line-clamp-2 text-[11px] text-slate-300">{data.subtitle}</p>}
        </div>
        {data.badge && (
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${style.badge}`}>
            {data.badge}
          </span>
        )}
      </div>
      {data.meta && <p className="mt-2 text-[10px] uppercase tracking-[0.12em] text-slate-400">{data.meta}</p>}
      <Handle id="target-left" type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle id="target-right" type="target" position={Position.Right} style={{ opacity: 0 }} />
      <Handle id="source-right" type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Handle id="source-left" type="source" position={Position.Left} style={{ opacity: 0 }} />
    </div>
  )
}
