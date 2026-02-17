"use client"

import { memo } from "react"
import type { CommandHierarchyTier } from "@/lib/uss-k8s/topology"

const COMMAND_TIER_CLASSES: Record<number, string> = {
  1: "border-amber-500/45 bg-amber-500/12 text-amber-700 dark:border-amber-300/45 dark:text-amber-100",
  2: "border-cyan-500/45 bg-cyan-500/12 text-cyan-700 dark:border-cyan-300/45 dark:text-cyan-100",
  3: "border-sky-500/45 bg-sky-500/12 text-sky-700 dark:border-sky-300/45 dark:text-sky-100",
  4: "border-emerald-500/45 bg-emerald-500/12 text-emerald-700 dark:border-emerald-300/45 dark:text-emerald-100",
  5: "border-rose-500/45 bg-rose-500/12 text-rose-700 dark:border-rose-300/45 dark:text-rose-100",
  6: "border-violet-500/45 bg-violet-500/12 text-violet-700 dark:border-violet-300/45 dark:text-violet-100",
}

interface HierarchyPanelProps {
  commandHierarchy: CommandHierarchyTier[]
  activeHierarchyTier: number | null
  onSelectNode: (id: string) => void
}

export const HierarchyPanel = memo(function HierarchyPanel({
  commandHierarchy,
  activeHierarchyTier,
  onSelectNode,
}: HierarchyPanelProps) {
  return (
    <div className="rounded-lg border border-slate-300/75 bg-white/72 px-3 py-3 dark:border-white/12 dark:bg-white/[0.03]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="readout text-slate-700 dark:text-slate-300">Command Hierarchy</span>
        <span className="readout text-slate-600 dark:text-slate-400">
          {activeHierarchyTier ? `Focused C${activeHierarchyTier}` : "Select a tier"}
        </span>
      </div>
      <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1.5 sm:flex-wrap sm:overflow-visible sm:pb-0">
        {commandHierarchy.map((tier) => {
          const isActive = activeHierarchyTier === tier.tier
          const anchorNodeId = tier.nodeIds[0]
          const tierClass =
            COMMAND_TIER_CLASSES[tier.tier] ||
            "border-slate-500/45 bg-slate-500/12 text-slate-700 dark:border-slate-300/45 dark:text-slate-100"

          return (
            <button
              key={tier.tier}
              type="button"
              onClick={() => onSelectNode(anchorNodeId)}
              className={`flex min-h-[34px] shrink-0 items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:focus-visible:ring-cyan-400/60 ${
                isActive
                  ? tierClass
                  : "border-slate-300/75 bg-white/70 text-slate-700 hover:border-slate-400 hover:bg-white dark:border-white/12 dark:bg-transparent dark:text-slate-300 dark:hover:border-white/25 dark:hover:bg-white/[0.06]"
              }`}
              title={tier.description}
            >
              <span className={`readout rounded border px-1 py-0.5 ${tierClass}`}>
                C{tier.tier}
              </span>
              <span className="text-[12px] font-medium">{tier.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
})
