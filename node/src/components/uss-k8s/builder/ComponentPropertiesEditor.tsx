"use client"

import { Trash2 } from "lucide-react"
import {
  SUBSYSTEM_GROUP_CONFIG,
  GROUP_ORDER,
  type TopologyComponent,
  type SubsystemGroup,
  type ComponentType,
} from "@/lib/uss-k8s/topology"

interface ComponentPropertiesEditorProps {
  component: TopologyComponent | null
  onUpdate: (id: string, patch: Partial<TopologyComponent>) => void
  onDelete: (id: string) => void
}

const componentTypes: ComponentType[] = ["agent", "operator", "ui", "runtime", "observability", "k8s-workload"]

const selectClass =
  "w-full rounded-md border border-slate-300/70 bg-white/85 px-2.5 py-2 text-[12px] text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:border-white/12 dark:bg-slate-950/70 dark:text-slate-100 dark:focus-visible:ring-cyan-400/60"
const inputClass = selectClass
const labelClass = "flex flex-col gap-1.5 text-[11px] text-slate-700 dark:text-slate-300"

export function ComponentPropertiesEditor({
  component,
  onUpdate,
  onDelete,
}: ComponentPropertiesEditorProps) {
  if (!component) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center text-slate-500 dark:text-slate-400">
        <p className="text-[13px] font-medium">No component selected</p>
        <p className="max-w-[200px] text-[11px] leading-relaxed">
          Click a node on the canvas to edit its properties
        </p>
      </div>
    )
  }

  const cfg = SUBSYSTEM_GROUP_CONFIG[component.group]
  const isCustom = component.id.startsWith("custom-")

  return (
    <div className="space-y-3 animate-slide-in">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className={`readout ${cfg.color}`}>{cfg.label}</span>
          <p className="truncate text-[14px] font-semibold text-slate-900 dark:text-slate-50">
            {component.label}
          </p>
        </div>
        {isCustom && (
          <button
            type="button"
            onClick={() => onDelete(component.id)}
            title="Delete component"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-rose-400/40 bg-rose-500/10 text-rose-600 transition-colors hover:bg-rose-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60 dark:border-rose-400/30 dark:text-rose-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="bridge-divider" />

      <div className="grid grid-cols-1 gap-3">
        <label className={labelClass}>
          <span className="readout">Label</span>
          <input
            type="text"
            value={component.label}
            onChange={(e) => onUpdate(component.id, { label: e.target.value })}
            className={inputClass}
          />
        </label>

        <label className={labelClass}>
          <span className="readout">Sublabel</span>
          <input
            type="text"
            value={component.sublabel || ""}
            onChange={(e) => onUpdate(component.id, { sublabel: e.target.value })}
            className={inputClass}
          />
        </label>

        <label className={labelClass}>
          <span className="readout">Group</span>
          <select
            value={component.group}
            onChange={(e) => onUpdate(component.id, { group: e.target.value as SubsystemGroup })}
            className={selectClass}
          >
            {GROUP_ORDER.map((g) => (
              <option key={g} value={g}>{SUBSYSTEM_GROUP_CONFIG[g].label}</option>
            ))}
          </select>
        </label>

        <label className={labelClass}>
          <span className="readout">Component Type</span>
          <select
            value={component.componentType}
            onChange={(e) => onUpdate(component.id, { componentType: e.target.value as ComponentType })}
            className={selectClass}
          >
            {componentTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>

      <p className="readout text-slate-500 dark:text-slate-500">
        ID: {component.id}
      </p>
    </div>
  )
}
