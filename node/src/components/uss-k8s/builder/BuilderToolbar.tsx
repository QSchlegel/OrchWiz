"use client"

import { MousePointer2, Link2, Trash2, Save, Plus } from "lucide-react"
import type { BuilderTool } from "@/lib/uss-k8s/builder-types"

interface BuilderToolbarProps {
  activeTool: BuilderTool
  onToolChange: (tool: BuilderTool) => void
  onSave: () => void
  onAddComponent: () => void
  isDirty: boolean
  isSaving: boolean
}

const tools: { id: BuilderTool; icon: React.ElementType; label: string; shortcut: string }[] = [
  { id: "select", icon: MousePointer2, label: "Select", shortcut: "V" },
  { id: "connect", icon: Link2, label: "Connect", shortcut: "C" },
  { id: "delete", icon: Trash2, label: "Delete", shortcut: "X" },
]

export function BuilderToolbar({
  activeTool,
  onToolChange,
  onSave,
  onAddComponent,
  isDirty,
  isSaving,
}: BuilderToolbarProps) {
  return (
    <div className="pointer-events-auto inline-flex items-center gap-1 rounded-xl border border-slate-300/75 bg-white/92 p-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.15)] backdrop-blur-lg dark:border-white/12 dark:bg-slate-950/85">
      {tools.map((tool) => {
        const Icon = tool.icon
        const isActive = activeTool === tool.id
        return (
          <button
            key={tool.id}
            type="button"
            onClick={() => onToolChange(tool.id)}
            title={`${tool.label} (${tool.shortcut})`}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:focus-visible:ring-cyan-400/60 ${
              isActive
                ? tool.id === "delete"
                  ? "bg-rose-500/15 text-rose-600 shadow-sm dark:bg-rose-500/20 dark:text-rose-300"
                  : "bg-cyan-500/15 text-cyan-700 shadow-sm dark:bg-cyan-500/20 dark:text-cyan-200"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-white/[0.08] dark:hover:text-slate-200"
            }`}
          >
            <Icon className="h-4 w-4" />
          </button>
        )
      })}

      <div className="mx-0.5 h-5 w-px bg-slate-300/60 dark:bg-white/10" />

      <button
        type="button"
        onClick={onAddComponent}
        title="Add component"
        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-all duration-150 hover:bg-emerald-100 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:text-slate-400 dark:hover:bg-emerald-500/15 dark:hover:text-emerald-300 dark:focus-visible:ring-cyan-400/60"
      >
        <Plus className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={onSave}
        disabled={!isDirty || isSaving}
        title="Save topology"
        className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:focus-visible:ring-cyan-400/60 ${
          isDirty
            ? "text-amber-600 hover:bg-amber-100 hover:text-amber-700 dark:text-amber-400 dark:hover:bg-amber-500/15 dark:hover:text-amber-300"
            : "text-slate-300 dark:text-slate-600"
        }`}
      >
        <Save className={`h-4 w-4 ${isSaving ? "animate-pulse" : ""}`} />
      </button>
    </div>
  )
}
