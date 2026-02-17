"use client"

import { createContext, useCallback, useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"
import { sidebarNav, matchesPath } from "./sidebarNav"

const STORAGE_KEY = "orchwiz:sidebar-collapsed"

export interface SidebarContextValue {
  collapsed: boolean
  displayCollapsed: boolean
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
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === "undefined") return true
    return window.matchMedia("(min-width: 768px)").matches
  })
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

  // Track desktop breakpoint so "icons-only" mode stays desktop-only.
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)")
    const onChange = () => setIsDesktop(mql.matches)
    onChange()
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    }
    // Safari < 14
    mql.addListener(onChange)
    return () => mql.removeListener(onChange)
  }, [])

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

  const displayCollapsed = collapsed && isDesktop

  const value = useMemo<SidebarContextValue>(
    () => ({
      collapsed,
      displayCollapsed,
      toggleCollapsed,
      mobileOpen,
      setMobileOpen,
      expandedGroups,
      toggleGroup,
    }),
    [collapsed, displayCollapsed, toggleCollapsed, mobileOpen, expandedGroups, toggleGroup]
  )

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  )
}
