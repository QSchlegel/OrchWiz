"use client"

import { memo } from "react"
import type { SubsystemGroup } from "@/lib/uss-k8s/topology"

interface GroupLegendProps {
  groupOrder: SubsystemGroup[]
  subsystemGroupConfig: Record<SubsystemGroup, { label: string; bgColor: string; borderColor: string; color: string }>
  activeGroupFilter: SubsystemGroup | null
  onToggleGroupFilter: (group: SubsystemGroup | null) => void
}

export const GroupLegend = memo(function GroupLegend({
  groupOrder,
  subsystemGroupConfig,
  activeGroupFilter,
  onToggleGroupFilter,
}: GroupLegendProps) {
  return (
    <div className="flex items-center gap-3 overflow-x-auto pb-1.5 sm:flex-wrap sm:overflow-visible sm:pb-0">
      {groupOrder.map((groupKey) => {
        const config = subsystemGroupConfig[groupKey]
        const isActive = activeGroupFilter === groupKey

        return (
          <button
            key={groupKey}
            type="button"
            onClick={() => onToggleGroupFilter(isActive ? null : groupKey)}
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:focus-visible:ring-cyan-400/60 ${
              isActive
                ? `border ${config.borderColor} ${config.bgColor}`
                : "border border-transparent hover:border-slate-300/50 hover:bg-white/50 dark:hover:border-white/10 dark:hover:bg-white/[0.04]"
            }`}
          >
            <span className={`h-2 w-2 rounded-sm border ${config.bgColor} ${config.borderColor}`} />
            <span className="readout text-slate-700 dark:text-slate-300">{config.label}</span>
          </button>
        )
      })}
    </div>
  )
})
