"use client"

import { GripHorizontal, Minus } from "lucide-react"
import type { CSSProperties, PointerEvent, ReactNode } from "react"

interface DockableWindowProps {
  id: string
  subtitle: string
  title: string
  style: CSSProperties
  isActive?: boolean
  collapsed?: boolean
  bodyClassName?: string
  onDragStart: (id: string, event: PointerEvent<HTMLDivElement>) => void
  onCollapse: (id: string) => void
  onFocus: (id: string) => void
  children: ReactNode
}

const floatingPanelClass =
  "rounded-xl border border-slate-300/75 bg-white/88 shadow-[0_10px_28px_rgba(15,23,42,0.18)] backdrop-blur-lg dark:border-white/12 dark:bg-slate-950/78"

export function DockableWindow({
  id,
  subtitle,
  title,
  style,
  isActive = false,
  collapsed = false,
  bodyClassName,
  onDragStart,
  onCollapse,
  onFocus,
  children,
}: DockableWindowProps) {
  return (
    <div
      className={`pointer-events-auto absolute overflow-hidden transition-all duration-200 ${floatingPanelClass} ${
        isActive
          ? "ring-1 ring-cyan-500/45 shadow-[0_14px_34px_rgba(8,145,178,0.24)] dark:ring-cyan-300/35"
          : "ring-1 ring-transparent"
      } ${collapsed ? "pointer-events-none scale-[0.96] opacity-0" : "scale-100 opacity-100"}`}
      style={style}
      onPointerDown={() => onFocus(id)}
      aria-hidden={collapsed}
    >
      <div
        role="button"
        tabIndex={collapsed ? -1 : 0}
        onPointerDown={(event) => onDragStart(id, event)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            onFocus(id)
          }
        }}
        className={`flex cursor-grab items-center justify-between gap-2 border-b px-3 py-2 active:cursor-grabbing ${
          isActive
            ? "border-cyan-500/35 bg-cyan-50/70 dark:border-cyan-300/25 dark:bg-cyan-400/[0.08]"
            : "border-slate-300/65 bg-white/80 dark:border-white/10 dark:bg-white/[0.04]"
        }`}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex items-center gap-1.5" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full border border-rose-500/45 bg-rose-400/85" />
            <span className="h-2.5 w-2.5 rounded-full border border-amber-500/45 bg-amber-300/85" />
            <span className="h-2.5 w-2.5 rounded-full border border-emerald-500/45 bg-emerald-400/85" />
          </div>
          <div className="min-w-0">
            <p className="readout text-cyan-700 dark:text-cyan-300">{subtitle}</p>
            <p className="truncate text-[12px] font-medium text-slate-900 dark:text-slate-50">{title}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <GripHorizontal className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
          <button
            data-window-control="true"
            type="button"
            tabIndex={collapsed ? -1 : 0}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onCollapse(id)}
            className="flex h-6 w-6 items-center justify-center rounded border border-slate-300/70 bg-white/80 text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.09] dark:focus-visible:ring-cyan-400/60"
            title={`Collapse ${title}`}
            aria-label={`Collapse ${title}`}
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className={bodyClassName || "p-4"}>{children}</div>
    </div>
  )
}
