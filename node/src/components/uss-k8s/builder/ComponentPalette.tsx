"use client"

import { Bot, Cpu, Eye, Monitor, Zap } from "lucide-react"
import {
  COMPONENT_TEMPLATES,
  type ComponentTemplate,
} from "@/lib/uss-k8s/builder-types"
import {
  SUBSYSTEM_GROUP_CONFIG,
  GROUP_ORDER,
  type SubsystemGroup,
} from "@/lib/uss-k8s/topology"

interface ComponentPaletteProps {
  onAddComponent: (template: ComponentTemplate) => void
}

const groupIcons: Record<SubsystemGroup, React.ElementType> = {
  users: Monitor,
  bridge: Bot,
  openclaw: Zap,
  obs: Eye,
  k8s: Cpu,
}

export function ComponentPalette({ onAddComponent }: ComponentPaletteProps) {
  const templatesByGroup = GROUP_ORDER.map((group) => ({
    group,
    config: SUBSYSTEM_GROUP_CONFIG[group],
    templates: COMPONENT_TEMPLATES.filter((t) => t.group === group),
  })).filter((g) => g.templates.length > 0)

  return (
    <div className="space-y-3">
      <p className="readout text-slate-600 dark:text-slate-400">
        Click to add a component to the canvas
      </p>

      {templatesByGroup.map(({ group, config, templates }) => {
        const Icon = groupIcons[group]
        return (
          <div key={group}>
            <div className="mb-1.5 flex items-center gap-1.5">
              <Icon className={`h-3 w-3 ${config.color}`} />
              <span className="readout text-slate-700 dark:text-slate-300">{config.label}</span>
            </div>
            <div className="space-y-1.5">
              {templates.map((template, i) => (
                <button
                  key={`${template.componentType}-${i}`}
                  type="button"
                  onClick={() => onAddComponent(template)}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      "application/uss-k8s-component",
                      JSON.stringify(template),
                    )
                    e.dataTransfer.effectAllowed = "copy"
                  }}
                  className={`group flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:focus-visible:ring-cyan-400/60 ${config.borderColor} hover:${config.bgColor} border-slate-300/60 bg-white/80 hover:border-current dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]`}
                >
                  <div className={`rounded-md p-1.5 ${config.bgColor}`}>
                    <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-slate-800 dark:text-slate-200">
                      {template.defaultLabel}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      {template.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
