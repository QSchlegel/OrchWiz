"use client"

export type DockScope = "uss-k8s"

export interface DockWindowItem {
  scope: DockScope
  id: string
  label: string
}

export interface DockRestoreEventDetail {
  scope: DockScope
  id: string
}

const WINDOW_DOCK_STORAGE_KEY = "orchwiz:window-dock"
export const WINDOW_DOCK_UPDATED_EVENT = "orchwiz:window-dock-updated"
export const WINDOW_DOCK_RESTORE_EVENT = "orchwiz:window-dock-restore"

function readAllDockItems(): DockWindowItem[] {
  if (typeof window === "undefined") return []

  try {
    const raw = window.localStorage.getItem(WINDOW_DOCK_STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed.filter(
      (item): item is DockWindowItem =>
        Boolean(item) &&
        typeof item === "object" &&
        (item.scope === "uss-k8s") &&
        typeof item.id === "string" &&
        typeof item.label === "string",
    )
  } catch {
    return []
  }
}

function writeAllDockItems(items: DockWindowItem[]) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(WINDOW_DOCK_STORAGE_KEY, JSON.stringify(items))
  window.dispatchEvent(new CustomEvent(WINDOW_DOCK_UPDATED_EVENT))
}

export function readDockWindows(scope: DockScope): DockWindowItem[] {
  return readAllDockItems().filter((item) => item.scope === scope)
}

export function addDockWindow(item: DockWindowItem) {
  const current = readAllDockItems()
  const deduped = current.filter((entry) => !(entry.scope === item.scope && entry.id === item.id))
  writeAllDockItems([...deduped, item])
}

export function removeDockWindow(scope: DockScope, id: string) {
  const current = readAllDockItems()
  const next = current.filter((item) => !(item.scope === scope && item.id === id))
  writeAllDockItems(next)
}

export function dispatchDockRestore(detail: DockRestoreEventDetail) {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent<DockRestoreEventDetail>(WINDOW_DOCK_RESTORE_EVENT, { detail }))
}

