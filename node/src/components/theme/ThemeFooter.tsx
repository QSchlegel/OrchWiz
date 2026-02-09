"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"
import type { ElementType } from "react"
import { LayoutGrid, Monitor, MoonStar, Sun } from "lucide-react"
import { type ThemeMode } from "@/components/theme/ThemeProvider"
import { useTheme } from "@/components/theme/useTheme"
import {
  dispatchDockRestore,
  readDockWindows,
  WINDOW_DOCK_UPDATED_EVENT,
  type DockScope,
  type DockWindowItem,
} from "@/lib/window-dock"

const options: { mode: ThemeMode; label: string; icon: ElementType }[] = [
  { mode: "light", label: "Light", icon: Sun },
  { mode: "dark", label: "Dark", icon: MoonStar },
  { mode: "system", label: "System", icon: Monitor },
]

export function ThemeFooter() {
  const { mode, resolvedTheme, setMode } = useTheme()
  const pathname = usePathname()
  const hiddenForPath =
    pathname === "/bridge-chat" ||
    pathname?.startsWith("/bridge-chat/") ||
    pathname === "/bridge-call" ||
    pathname?.startsWith("/bridge-call/")
  const [dockItems, setDockItems] = useState<DockWindowItem[]>([])
  const dockScope = useMemo<DockScope | null>(() => {
    return pathname?.startsWith("/uss-k8s") ? "uss-k8s" : null
  }, [pathname])

  useEffect(() => {
    if (!dockScope) {
      setDockItems([])
      return
    }

    const syncDockItems = () => {
      setDockItems(readDockWindows(dockScope))
    }

    syncDockItems()
    window.addEventListener(WINDOW_DOCK_UPDATED_EVENT, syncDockItems as EventListener)
    return () => {
      window.removeEventListener(WINDOW_DOCK_UPDATED_EVENT, syncDockItems as EventListener)
    }
  }, [dockScope])

  if (hiddenForPath) {
    return null
  }

  return (
    <footer className="theme-footer fixed inset-x-0 bottom-0 z-[60] border-t border-slate-300/70 bg-white/92 backdrop-blur dark:border-white/12 dark:bg-slate-950/86">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-2 sm:px-6 lg:px-8">
        <div className="hidden text-xs font-medium uppercase tracking-[0.16em] text-slate-600 dark:text-slate-300 sm:block">
          Appearance
        </div>

        {dockScope && dockItems.length > 0 && (
          <div className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-300/70 bg-white/70 px-2 py-1 sm:flex-1 dark:border-white/15 dark:bg-white/[0.05]">
            <span className="hidden items-center gap-1 readout text-slate-600 md:inline-flex dark:text-slate-300">
              <LayoutGrid className="h-3 w-3" />
              Collapsed
            </span>

            <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
              {dockItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => dispatchDockRestore({ scope: dockScope, id: item.id })}
                  className="inline-flex min-h-7 shrink-0 items-center rounded-md border border-cyan-500/40 bg-cyan-500/12 px-2.5 py-1 text-[11px] font-medium text-cyan-700 transition-colors hover:bg-cyan-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:border-cyan-300/40 dark:text-cyan-100 dark:focus-visible:ring-cyan-400/60"
                  title={`Restore ${item.label}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div
          role="group"
          aria-label="Theme mode"
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-300/70 bg-white/70 p-1 dark:border-white/15 dark:bg-white/[0.05]"
        >
          {options.map((option) => {
            const Icon = option.icon
            const active = mode === option.mode
            return (
              <button
                key={option.mode}
                type="button"
                onClick={() => setMode(option.mode)}
                aria-pressed={active}
                className={`inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 ${
                  active
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                    : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.1]"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {option.label}
              </button>
            )
          })}
        </div>

        <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">
          Resolved {resolvedTheme}
        </div>
      </div>
    </footer>
  )
}
