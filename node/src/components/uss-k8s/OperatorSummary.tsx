"use client"

import { memo } from "react"
import type { SubsystemGroup } from "@/lib/uss-k8s/topology"

interface SubsystemCount {
  groupKey: SubsystemGroup
  count: number
}

interface OperatorSummaryProps {
  operatorLabel: string
  stardate: string
  subsystemCounts: SubsystemCount[]
  subsystemGroupConfig: Record<SubsystemGroup, { label: string; color: string }>
  groupIcons: Record<SubsystemGroup, React.ElementType>
}

export const OperatorSummary = memo(function OperatorSummary({
  operatorLabel,
  stardate,
  subsystemCounts,
  subsystemGroupConfig,
  groupIcons,
}: OperatorSummaryProps) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="readout text-cyan-700 dark:text-cyan-300">Bridge Operator</span>
        <span className="readout text-slate-700 dark:text-slate-300">SD {stardate}</span>
      </div>
      <p className="mt-1.5 truncate text-[14px] font-medium text-slate-900 dark:text-slate-100">{operatorLabel}</p>

      <div className="bridge-divider my-3" />

      <div className="space-y-2">
        {subsystemCounts.map(({ groupKey, count }) => {
          const config = subsystemGroupConfig[groupKey]
          const Icon = groupIcons[groupKey]

          return (
            <div
              key={groupKey}
              className="flex items-center gap-2.5 rounded-md border border-slate-300/70 bg-white/72 px-2.5 py-2 dark:border-white/12 dark:bg-white/[0.04]"
            >
              <Icon className={`h-3.5 w-3.5 ${config.color}`} />
              <span className="truncate text-[12px] text-slate-800 dark:text-slate-200">{config.label}</span>
              <span className="readout ml-auto rounded bg-slate-200/80 px-1.5 py-0.5 text-slate-700 dark:bg-white/[0.1] dark:text-slate-200">
                {count}
              </span>
            </div>
          )
        })}
      </div>
    </>
  )
})
