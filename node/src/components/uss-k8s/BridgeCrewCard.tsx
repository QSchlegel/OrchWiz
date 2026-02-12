"use client"

import { useState } from "react"
import { ChevronRight, ChevronDown, Plug } from "lucide-react"
import type { TopologyComponent } from "@/lib/uss-k8s/topology"

interface BridgeCrewCardProps {
  agent: TopologyComponent
  icon: React.ElementType
  isSelected: boolean
  connectionCount: number
  onSelect: (id: string) => void
}

const roleBadges: Record<string, { label: string; accent: string; badge: string }> = {
  xo: { label: "XO", accent: "bg-cyan-400", badge: "bg-cyan-500/15 text-cyan-300 border-cyan-500/25" },
  ops: { label: "OPS", accent: "bg-amber-400", badge: "bg-amber-500/15 text-amber-300 border-amber-500/25" },
  eng: { label: "ENG", accent: "bg-rose-400", badge: "bg-rose-500/15 text-rose-300 border-rose-500/25" },
  sec: { label: "SEC", accent: "bg-violet-400", badge: "bg-violet-500/15 text-violet-300 border-violet-500/25" },
  med: { label: "MED", accent: "bg-emerald-400", badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25" },
  cou: { label: "COM", accent: "bg-sky-400", badge: "bg-sky-500/15 text-sky-300 border-sky-500/25" },
}

export function BridgeCrewCard({
  agent,
  icon: Icon,
  isSelected,
  connectionCount,
  onSelect,
}: BridgeCrewCardProps) {
  const [expanded, setExpanded] = useState(false)
  const badge = roleBadges[agent.id]

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      onClick={() => onSelect(agent.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onSelect(agent.id)
        }
      }}
      className={`group relative w-full cursor-pointer text-left rounded-lg border overflow-hidden transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:focus-visible:ring-cyan-400/60 ${
        isSelected
          ? "border-cyan-500/45 bg-gradient-to-r from-cyan-500/12 to-transparent surface-glow-cyan dark:border-cyan-300/55 dark:from-cyan-500/[0.16]"
          : "border-slate-300/70 bg-white/80 hover:border-cyan-500/35 hover:bg-cyan-50/60 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-cyan-300/35 dark:hover:bg-white/[0.06]"
      }`}
    >
      {/* Left accent bar — uses agent's role color */}
      <div className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-sm transition-opacity duration-200 ${
        badge?.accent || "bg-cyan-400"
      } ${isSelected ? "opacity-100" : "opacity-40 group-hover:opacity-60"}`} />

      <div className="pl-4 pr-3 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`rounded-md p-1.5 transition-colors duration-200 ${
              isSelected ? "bg-cyan-500/15 dark:bg-cyan-500/[0.16]" : "bg-slate-200/70 group-hover:bg-cyan-100 dark:bg-white/[0.06] dark:group-hover:bg-cyan-500/10"
            }`}>
              <Icon className={`h-3.5 w-3.5 ${isSelected ? "text-cyan-700 dark:text-cyan-100" : "text-slate-600 group-hover:text-cyan-600 dark:text-slate-300 dark:group-hover:text-cyan-200"}`} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate font-[family-name:var(--font-mono)] text-[13.5px] font-semibold text-slate-900 dark:text-slate-50">{agent.label}</p>
                {badge && (
                  <span className={`shrink-0 rounded border px-1.5 py-px text-[8px] font-bold uppercase tracking-[0.1em] ${badge.badge}`}>
                    {badge.label}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[10.5px] uppercase tracking-wider text-slate-600 dark:text-slate-300">{agent.sublabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            {connectionCount > 0 && (
              <span className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-mono font-medium transition-colors duration-200 ${
                isSelected
                  ? "bg-cyan-500/20 text-cyan-700 dark:text-cyan-100 connection-pulse"
                  : "bg-slate-200/80 text-slate-700 dark:bg-white/[0.08] dark:text-slate-200"
              }`}>
                <Plug className="h-2.5 w-2.5" />
                {connectionCount}
              </span>
            )}
            <span className={`h-2 w-2 rounded-full transition-shadow duration-300 ${
              isSelected ? "bg-emerald-400 shadow-[0_0_6px_rgba(34,197,94,0.5)]" : "bg-emerald-400/70"
            }`} />
            {agent.subagentDescription ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setExpanded(!expanded)
                }}
                className="rounded p-0.5 text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-slate-100 dark:focus-visible:ring-cyan-400/60"
              >
                {expanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </button>
            ) : (
              <ChevronRight className="h-3 w-3 text-slate-500 dark:text-slate-500" />
            )}
          </div>
        </div>

        {expanded && agent.subagentDescription && (
          <div className="mt-2.5 rounded-md border border-slate-300/70 bg-slate-100/90 px-3 py-2.5 animate-slide-in dark:border-white/12 dark:bg-white/[0.04]">
            <p className="text-[10.5px] leading-relaxed text-slate-700 font-[family-name:var(--font-mono)] dark:text-slate-200">
              {agent.subagentDescription}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
