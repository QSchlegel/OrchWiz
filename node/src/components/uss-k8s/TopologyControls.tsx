"use client"

import { Layout, RotateCcw, Search, X } from "lucide-react"
import type { EdgeType } from "@/lib/uss-k8s/topology"

interface TopologyControlsProps {
  visibleEdgeTypes: Set<EdgeType>
  onEdgeTypeToggle: (type: EdgeType) => void
  searchTerm: string
  onSearchChange: (term: string) => void
  highlightNodeId: string | null
  highlightLabel?: string | null
  onClearHighlight: () => void
  onResetAll?: () => void
  hasActiveFilters?: boolean
  hasCustomLayout?: boolean
  onResetLayout?: () => void
}

const edgeTypeConfig: { type: EdgeType; label: string; dotColor: string; activeClasses: string }[] = [
  { type: "control", label: "CTL", dotColor: "bg-cyan-500 dark:bg-cyan-400", activeClasses: "border-cyan-500/45 text-cyan-700 bg-cyan-500/12 dark:border-cyan-300/45 dark:text-cyan-100 dark:bg-cyan-500/[0.14]" },
  { type: "data", label: "DAT", dotColor: "bg-slate-500 dark:bg-slate-300", activeClasses: "border-slate-500/45 text-slate-700 bg-slate-500/12 dark:border-slate-300/45 dark:text-slate-100 dark:bg-slate-400/[0.14]" },
  { type: "telemetry", label: "TEL", dotColor: "bg-violet-500 dark:bg-violet-400", activeClasses: "border-violet-500/45 text-violet-700 bg-violet-500/12 dark:border-violet-300/45 dark:text-violet-100 dark:bg-violet-500/[0.14]" },
  { type: "alert", label: "ALR", dotColor: "bg-rose-500 dark:bg-rose-400", activeClasses: "border-rose-500/45 text-rose-700 bg-rose-500/12 dark:border-rose-300/45 dark:text-rose-100 dark:bg-rose-500/[0.14]" },
]

export function TopologyControls({
  visibleEdgeTypes,
  onEdgeTypeToggle,
  searchTerm,
  onSearchChange,
  highlightNodeId,
  highlightLabel,
  onClearHighlight,
  onResetAll,
  hasActiveFilters,
  hasCustomLayout,
  onResetLayout,
}: TopologyControlsProps) {
  return (
    <div className="flex w-full flex-col gap-3.5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {/* Search */}
        <div className="relative w-full md:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
          <input
            data-search-input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search components..."
            className="w-full rounded-md border border-slate-300/70 bg-white/80 py-2 pl-9 pr-9 font-[family-name:var(--font-mono)] text-[12px] text-slate-800 placeholder-slate-500 outline-none transition-all duration-200 focus:border-cyan-500/45 focus:bg-white focus:shadow-[0_0_18px_rgba(6,182,212,0.2)] focus-visible:ring-2 focus-visible:ring-cyan-500/60 focus-visible:ring-offset-0 dark:border-white/12 dark:bg-white/[0.03] dark:text-slate-100 dark:placeholder-slate-400 dark:focus:border-cyan-300/50 dark:focus:bg-white/[0.05] dark:focus:shadow-[0_0_18px_rgba(34,211,238,0.12)] dark:focus-visible:ring-cyan-400/60"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-600 hover:bg-slate-200 hover:text-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:text-slate-300 dark:hover:bg-white/[0.09] dark:hover:text-slate-100 dark:focus-visible:ring-cyan-400/60"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Edge type filters */}
        <div className="min-w-0 md:flex-1">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="readout text-slate-700 dark:text-slate-300">Edge filters</span>
            <span className="readout text-slate-500 dark:text-slate-400">
              {visibleEdgeTypes.size} / {edgeTypeConfig.length}
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1.5 md:overflow-visible md:pb-0">
            {edgeTypeConfig.map(({ type, label, dotColor, activeClasses }) => {
              const active = visibleEdgeTypes.has(type)
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => onEdgeTypeToggle(type)}
                  className={`group flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 readout transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:focus-visible:ring-cyan-400/60 ${
                    active
                      ? activeClasses
                      : "border-slate-300/70 bg-white/70 text-slate-700 hover:border-slate-400 hover:text-slate-900 dark:border-white/12 dark:bg-transparent dark:text-slate-300 dark:hover:border-white/30 dark:hover:text-slate-100"
                  }`}
                >
                  <span className={`h-1.5 w-3 rounded-sm transition-all duration-200 ${
                    active ? dotColor : "bg-slate-400/45 group-hover:bg-slate-500/60 dark:bg-white/[0.2] dark:group-hover:bg-white/[0.28]"
                  }`} />
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {(highlightNodeId || (hasActiveFilters && onResetAll)) && (
        <div className="flex flex-wrap items-center gap-2">
          {/* Highlight indicator */}
          {highlightNodeId && (
            <button
              type="button"
              onClick={onClearHighlight}
              className="flex min-h-[34px] items-center gap-2 rounded-md border border-cyan-500/40 bg-cyan-500/12 px-3 py-1.5 readout text-cyan-700 hover:bg-cyan-500/18 transition-all duration-200 surface-glow-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:border-cyan-300/40 dark:text-cyan-100 dark:focus-visible:ring-cyan-400/60"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 status-ring" />
              {highlightLabel || highlightNodeId}
              <X className="h-2.5 w-2.5 opacity-60" />
            </button>
          )}

          {/* Reset all filters */}
          {hasActiveFilters && onResetAll && (
            <button
              type="button"
              onClick={onResetAll}
              className="flex min-h-[34px] items-center gap-1.5 rounded-md border border-slate-400/45 bg-white/70 px-3 py-1.5 readout text-slate-700 transition-all duration-200 hover:border-slate-500/50 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:border-white/20 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:border-white/30 dark:focus-visible:ring-cyan-400/60"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          )}

          {/* Reset node layout */}
          {hasCustomLayout && onResetLayout && (
            <button
              type="button"
              onClick={onResetLayout}
              className="flex min-h-[34px] items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 readout text-amber-700 transition-all duration-200 hover:bg-amber-500/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 dark:border-amber-300/35 dark:text-amber-200 dark:focus-visible:ring-amber-400/60"
            >
              <Layout className="h-3 w-3" />
              Reset Layout
            </button>
          )}
        </div>
      )}
    </div>
  )
}
