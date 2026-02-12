"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"
import type { ElementType } from "react"
import { Bot, LayoutGrid, Monitor, MoonStar, Ship, Sun } from "lucide-react"
import { type ThemeMode } from "@/components/theme/ThemeProvider"
import { NodeRuntimeIndicator } from "@/components/theme/NodeRuntimeIndicator"
import { ShipQuartermasterPanel } from "@/components/quartermaster/ShipQuartermasterPanel"
import { useTheme } from "@/components/theme/useTheme"
import { useEventStream } from "@/lib/realtime/useEventStream"
import { useShipSelection } from "@/lib/shipyard/useShipSelection"
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

const SHIP_SELECTOR_PATH_PREFIXES = [
  "/ship-yard",
  "/ships",
  "/applications",
  "/bridge",
  "/bridge-call",
  "/bridge-connections",
  "/uss-k8s",
]

interface ShipFooterItem {
  id: string
  name: string
  status: "pending" | "deploying" | "active" | "inactive" | "failed" | "updating"
}

function routeMatchesPrefix(pathname: string | null, prefix: string): boolean {
  if (!pathname) return false
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export function ThemeFooter() {
  const { mode, resolvedTheme, setMode } = useTheme()
  const pathname = usePathname()
  const { selectedShipDeploymentId, setSelectedShipDeploymentId } = useShipSelection()

  const hiddenForPath = pathname === "/bridge-chat" || pathname?.startsWith("/bridge-chat/")
  const quartermasterAvailable =
    pathname?.startsWith("/ship-yard") ||
    pathname?.startsWith("/ships") ||
    pathname?.startsWith("/uss-k8s")

  const shipSelectorAvailable = useMemo(
    () => SHIP_SELECTOR_PATH_PREFIXES.some((prefix) => routeMatchesPrefix(pathname, prefix)),
    [pathname],
  )

  const [dockItems, setDockItems] = useState<DockWindowItem[]>([])
  const [quartermasterOpen, setQuartermasterOpen] = useState(false)
  const [ships, setShips] = useState<ShipFooterItem[]>([])
  const [isLoadingShips, setIsLoadingShips] = useState(false)

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

  useEffect(() => {
    if (!quartermasterAvailable) {
      setQuartermasterOpen(false)
    }
  }, [quartermasterAvailable])

  const loadShips = useCallback(async () => {
    if (!shipSelectorAvailable) {
      setShips([])
      return
    }

    setIsLoadingShips(true)

    try {
      const response = await fetch("/api/ships")
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const payload = (await response.json()) as unknown
      const nextShips = Array.isArray(payload)
        ? (payload as ShipFooterItem[])
        : []

      setShips(nextShips)

      if (nextShips.length === 0) {
        if (selectedShipDeploymentId) {
          setSelectedShipDeploymentId(null)
        }
        return
      }

      if (!selectedShipDeploymentId || !nextShips.some((ship) => ship.id === selectedShipDeploymentId)) {
        setSelectedShipDeploymentId(nextShips[0].id)
      }
    } catch (error) {
      console.error("Failed to load footer ship selector options:", error)
      setShips([])
    } finally {
      setIsLoadingShips(false)
    }
  }, [selectedShipDeploymentId, setSelectedShipDeploymentId, shipSelectorAvailable])

  useEffect(() => {
    void loadShips()
  }, [loadShips])

  useEventStream({
    enabled: shipSelectorAvailable,
    types: ["ship.updated", "deployment.updated"],
    onEvent: () => {
      void loadShips()
    },
  })

  const handleShipNotFound = useCallback(async () => {
    await loadShips()
  }, [loadShips])

  if (hiddenForPath) {
    return null
  }

  return (
    <>
      {quartermasterAvailable && quartermasterOpen && (
        <div className="theme-footer pointer-events-none fixed inset-x-0 bottom-[calc(var(--theme-footer-height)+env(safe-area-inset-bottom)+0.65rem)] z-[65]">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="pointer-events-auto ml-auto w-full max-w-[min(92vw,78rem)]">
              <ShipQuartermasterPanel
                shipDeploymentId={selectedShipDeploymentId}
                className="shadow-[0_16px_44px_rgba(15,23,42,0.3)]"
                compact
                onShipNotFound={handleShipNotFound}
              />
            </div>
          </div>
        </div>
      )}

      <footer className="fixed inset-x-0 bottom-0 z-[60] border-t border-slate-300/70 bg-white/92 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-white/12 dark:bg-slate-950/86">
        <div className="flex w-full min-w-0 items-center gap-2 overflow-x-hidden overflow-y-visible py-2 pr-2 pl-0 sm:gap-3 sm:pr-4 lg:pr-6">
          <NodeRuntimeIndicator />

          {shipSelectorAvailable && (
            <label className="inline-flex min-w-[220px] max-w-[320px] flex-1 items-center gap-2 rounded-lg border border-slate-300/70 bg-white/75 px-2.5 py-1.5 dark:border-white/15 dark:bg-white/[0.05] sm:flex-none">
              <Ship className="h-3.5 w-3.5 text-cyan-700 dark:text-cyan-300" />
              <span className="readout text-slate-600 dark:text-slate-300">Ship</span>
              <select
                value={selectedShipDeploymentId || ""}
                onChange={(event) => setSelectedShipDeploymentId(event.target.value || null)}
                disabled={isLoadingShips || ships.length === 0}
                className="min-w-0 flex-1 bg-transparent text-xs font-medium text-slate-800 outline-none disabled:opacity-60 dark:text-slate-100"
              >
                {isLoadingShips ? (
                  <option value="">Loading ships...</option>
                ) : ships.length === 0 ? (
                  <option value="">No ships</option>
                ) : (
                  ships.map((ship) => (
                    <option key={ship.id} value={ship.id}>
                      {ship.name} ({ship.status})
                    </option>
                  ))
                )}
              </select>
            </label>
          )}

          <div className="hidden text-xs font-medium uppercase tracking-[0.16em] text-slate-600 dark:text-slate-300 sm:block">
            Appearance
          </div>

          {quartermasterAvailable && (
            <button
              type="button"
              onClick={() => setQuartermasterOpen((open) => !open)}
              aria-expanded={quartermasterOpen}
              className={`inline-flex min-h-8 items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 ${
                quartermasterOpen
                  ? "border-cyan-500/45 bg-cyan-500/12 text-cyan-700 dark:border-cyan-300/45 dark:text-cyan-100"
                  : "border-slate-300/70 bg-white/75 text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-300 dark:hover:bg-white/[0.12]"
              }`}
            >
              <Bot className="h-3.5 w-3.5" />
              Quartermaster
              {!selectedShipDeploymentId && (
                <span className="readout rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-white/[0.1] dark:text-slate-300">
                  No Ship
                </span>
              )}
            </button>
          )}

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
    </>
  )
}
