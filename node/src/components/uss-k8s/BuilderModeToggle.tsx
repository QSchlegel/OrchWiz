"use client"

import { Eye, Hammer } from "lucide-react"
import type { BuilderMode } from "@/lib/uss-k8s/builder-types"

interface BuilderModeToggleProps {
  mode: BuilderMode
  onToggle: () => void
  isDirty: boolean
}

export function BuilderModeToggle({ mode, onToggle, isDirty }: BuilderModeToggleProps) {
  const isBuilding = mode === "build"

  return (
    <button
      type="button"
      onClick={onToggle}
      title={isBuilding ? "Exit build mode" : "Enter build mode"}
      className={`relative flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:focus-visible:ring-cyan-400/60 ${
        isBuilding
          ? "border-amber-500/45 bg-amber-500/12 text-amber-700 dark:border-amber-300/40 dark:text-amber-200"
          : "border-slate-300/70 bg-white/70 text-slate-600 hover:border-slate-400 hover:text-slate-800 dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-400 dark:hover:border-white/25 dark:hover:text-slate-200"
      }`}
    >
      {isBuilding ? <Hammer className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
      {isBuilding ? "Building" : "Build"}
      {isDirty && isBuilding && (
        <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-amber-500 shadow-[0_0_4px_rgba(245,158,11,0.5)]" />
      )}
    </button>
  )
}
