"use client"

import { memo } from "react"
import { AlertTriangle, Eye } from "lucide-react"
import type { TopologyComponent } from "@/lib/uss-k8s/topology"

interface ObservabilityListProps {
  observabilityComponents: TopologyComponent[]
  selectedId: string | null
  connectionCounts: Record<string, number>
  componentIcons: Record<string, React.ElementType>
  onSelect: (id: string) => void
}

export const ObservabilityList = memo(function ObservabilityList({
  observabilityComponents,
  selectedId,
  connectionCounts,
  componentIcons,
  onSelect,
}: ObservabilityListProps) {
  return (
    <div className="space-y-2.5">
      {observabilityComponents.map((component) => {
        const isSelected = component.id === selectedId
        const Icon = componentIcons[component.id] || Eye

        return (
          <button
            key={component.id}
            type="button"
            onClick={() => onSelect(component.id)}
            className={`group relative w-full overflow-hidden rounded-lg border text-left transition-all duration-200 ${
              isSelected
                ? "border-violet-500/45 bg-gradient-to-r from-violet-500/12 to-transparent surface-glow-violet dark:border-violet-300/55 dark:from-violet-500/[0.16]"
                : "border-slate-300/75 bg-white/75 hover:border-violet-500/35 hover:bg-violet-50/70 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-violet-300/35 dark:hover:bg-white/[0.06]"
            }`}
          >
            <div
              className={`absolute bottom-1.5 left-0 top-1.5 w-[3px] rounded-r-sm bg-violet-400 transition-opacity duration-200 ${
                isSelected ? "opacity-100" : "opacity-35 group-hover:opacity-55"
              }`}
            />

            <div className="pl-4 pr-3 py-2.5">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex items-center gap-2.5">
                  <div
                    className={`rounded-md p-1.5 transition-colors duration-200 ${
                      isSelected
                        ? "bg-violet-500/15 dark:bg-violet-500/[0.16]"
                        : "bg-slate-200/70 group-hover:bg-violet-100 dark:bg-white/[0.06] dark:group-hover:bg-violet-500/10"
                    }`}
                  >
                    <Icon
                      className={`h-3.5 w-3.5 ${
                        isSelected
                          ? "text-violet-700 dark:text-violet-100"
                          : "text-slate-600 group-hover:text-violet-600 dark:text-slate-300 dark:group-hover:text-violet-200"
                      }`}
                    />
                  </div>

                  <div className="min-w-0">
                    <p className="truncate font-[family-name:var(--font-mono)] text-[13px] font-semibold text-slate-900 dark:text-slate-50">
                      {component.label}
                    </p>
                    <p className="mt-0.5 truncate text-[10.5px] uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      {component.sublabel}
                    </p>
                  </div>
                </div>

                <div className="ml-2 flex shrink-0 items-center gap-2">
                  {(connectionCounts[component.id] || 0) > 0 && (
                    <span
                      className={`readout rounded-md px-1.5 py-0.5 ${
                        isSelected
                          ? "bg-violet-500/20 text-violet-700 dark:text-violet-100"
                          : "bg-slate-200/80 text-slate-700 dark:bg-white/[0.08] dark:text-slate-200"
                      }`}
                    >
                      {connectionCounts[component.id]}
                    </span>
                  )}
                  <span
                    className={`h-2 w-2 rounded-full transition-shadow duration-300 ${
                      isSelected ? "bg-emerald-400 shadow-[0_0_6px_rgba(34,197,94,0.5)]" : "bg-emerald-400/70"
                    }`}
                  />
                </div>
              </div>
            </div>
          </button>
        )
      })}

      <div className="relative overflow-hidden rounded-lg border border-rose-400/35 bg-rose-500/[0.08] p-3.5">
        <div className="absolute bottom-1.5 left-0 top-1.5 w-[3px] rounded-r-sm bg-rose-400/70" />
        <div className="pl-2">
          <div className="readout mb-2 flex items-center gap-2 text-rose-700 dark:text-rose-200">
            <AlertTriangle className="h-3 w-3" />
            Alert Feedback Loop
          </div>
          <p className="font-[family-name:var(--font-mono)] text-[11px] leading-relaxed text-slate-800 dark:text-slate-200">
            Grafana → ENG-GEO → incident notes + action requests → XO-CB01
          </p>
        </div>
      </div>
    </div>
  )
})
