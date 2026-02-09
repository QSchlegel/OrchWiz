"use client"

import type { ReactNode } from "react"

interface DockItem {
  id: string
  icon: React.ElementType
  label: string
}

interface FocusModeDockProps {
  items: DockItem[]
  activeId: string | null
  onSelect: (id: string) => void
}

export function FocusModeDock({ items, activeId, onSelect }: FocusModeDockProps) {
  return (
    <div className="pointer-events-auto absolute right-4 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-1.5 rounded-xl border border-slate-300/75 bg-white/90 p-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.16)] backdrop-blur-lg dark:border-white/12 dark:bg-slate-950/82">
      {items.map(({ id, icon: Icon, label }) => {
        const isActive = activeId === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            title={label}
            className={`flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:focus-visible:ring-cyan-400/60 ${
              isActive
                ? "bg-cyan-500/15 text-cyan-700 ring-1 ring-cyan-500/40 dark:bg-cyan-500/[0.16] dark:text-cyan-200 dark:ring-cyan-300/35"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.08] dark:hover:text-slate-100"
            }`}
          >
            <Icon className="h-4 w-4" />
          </button>
        )
      })}
    </div>
  )
}
