"use client"

import type { CSSProperties, PointerEvent, ReactNode } from "react"

interface DockableWindowProps {
  id: string
  subtitle: string
  title: string
  style: CSSProperties
  isActive?: boolean
  isDragging?: boolean
  collapsed?: boolean
  bodyCollapsed?: boolean
  maximized?: boolean
  bodyClassName?: string
  onDragStart: (id: string, event: PointerEvent<HTMLDivElement>) => void
  onDock: (id: string) => void
  onToggleBody: (id: string) => void
  onToggleMaximize: (id: string) => void
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
  isDragging = false,
  collapsed = false,
  bodyCollapsed = false,
  maximized = false,
  bodyClassName,
  onDragStart,
  onDock,
  onToggleBody,
  onToggleMaximize,
  onFocus,
  children,
}: DockableWindowProps) {
  return (
    <div
      className={`pointer-events-auto absolute overflow-hidden transition-[opacity,transform,box-shadow,ring-color] duration-150 ${floatingPanelClass} ${
        isActive || isDragging
          ? "ring-1 ring-cyan-500/45 shadow-[0_14px_34px_rgba(8,145,178,0.24)] dark:ring-cyan-300/35"
          : "ring-1 ring-transparent"
      } ${collapsed ? "pointer-events-none scale-[0.96] opacity-0" : "scale-100 opacity-100"}`}
      style={style}
      onPointerDown={() => onFocus(id)}
      inert={collapsed}
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
        className={`flex cursor-grab touch-none select-none items-center justify-between gap-2 border-b px-3 py-2 active:cursor-grabbing ${
          isActive
            ? "border-cyan-500/35 bg-cyan-50/70 dark:border-cyan-300/25 dark:bg-cyan-400/[0.08]"
            : "border-slate-300/65 bg-white/80 dark:border-white/10 dark:bg-white/[0.04]"
        }`}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <button
              data-window-control="true"
              type="button"
              tabIndex={collapsed ? -1 : 0}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onDock(id)}
              className="h-2.5 w-2.5 rounded-full border border-rose-500/45 bg-rose-400/85 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60"
              title={`Dock ${title}`}
              aria-label={`Dock ${title}`}
            />
            <button
              data-window-control="true"
              type="button"
              tabIndex={collapsed ? -1 : 0}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onToggleBody(id)}
              className="h-2.5 w-2.5 rounded-full border border-amber-500/45 bg-amber-300/85 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
              title={`${bodyCollapsed ? "Expand" : "Collapse"} ${title}`}
              aria-label={`${bodyCollapsed ? "Expand" : "Collapse"} ${title}`}
            />
            <button
              data-window-control="true"
              type="button"
              tabIndex={collapsed ? -1 : 0}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onToggleMaximize(id)}
              className={`h-2.5 w-2.5 rounded-full border transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 ${
                maximized
                  ? "border-emerald-500/70 bg-emerald-300"
                  : "border-emerald-500/45 bg-emerald-400/85"
              }`}
              title={`${maximized ? "Restore" : "Maximize"} ${title}`}
              aria-label={`${maximized ? "Restore" : "Maximize"} ${title}`}
            />
          </div>
          <div className="min-w-0">
            <p className="readout text-cyan-700 dark:text-cyan-300">{subtitle}</p>
            <p className="truncate text-[12px] font-medium text-slate-900 dark:text-slate-50">{title}</p>
          </div>
        </div>
      </div>

      {!bodyCollapsed && <div className={bodyClassName || "p-4"}>{children}</div>}
    </div>
  )
}
