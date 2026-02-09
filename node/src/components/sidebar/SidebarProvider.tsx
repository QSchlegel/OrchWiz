"use client"

import { createContext, useCallback, useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"
import { sidebarNav, matchesPath } from "./sidebarNav"

const STORAGE_KEY = "orchwiz:sidebar-collapsed"

export interface SidebarContextValue {
  collapsed: boolean
  toggleCollapsed: () => void
  mobileOpen: boolean
  setMobileOpen: (v: boolean) => void
  expandedGroups: Set<string>
  toggleGroup: (key: string) => void
}

export const SidebarContext = createContext<SidebarContextValue | null>(null)

function findActiveGroupKey(pathname: string | null): string | undefined {
  return sidebarNav.find((g) =>
    g.items.some((item) => matchesPath(pathname, item.href))
  )?.key
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const activeKey = findActiveGroupKey(pathname)
    return new Set(activeKey ? [activeKey] : [sidebarNav[0].key])
  })

  // Read collapsed state from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === "true") setCollapsed(true)
  }, [])

  // Persist collapsed state and sync data attribute for ThemeFooter
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(collapsed))
    document.documentElement.dataset.sidebar = collapsed ? "collapsed" : "expanded"
    return () => {
      delete document.documentElement.dataset.sidebar
    }
  }, [collapsed])

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // Auto-expand group when navigating to a new route
  useEffect(() => {
    const activeKey = findActiveGroupKey(pathname)
    if (activeKey) {
      setExpandedGroups((prev) => {
        if (prev.has(activeKey)) return prev
        return new Set(prev).add(activeKey)
      })
    }
  }, [pathname])

  const toggleCollapsed = useCallback(() => setCollapsed((c) => !c), [])

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const value = useMemo<SidebarContextValue>(
    () => ({
      collapsed,
      toggleCollapsed,
      mobileOpen,
      setMobileOpen,
      expandedGroups,
      toggleGroup,
    }),
    [collapsed, toggleCollapsed, mobileOpen, expandedGroups, toggleGroup]
  )

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  )
}
