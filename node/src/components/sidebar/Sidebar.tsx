"use client"

import Link from "next/link"
import { PanelLeftClose, PanelLeftOpen, WandSparkles } from "lucide-react"
import { sidebarNav } from "./sidebarNav"
import { useSidebar } from "./useSidebar"
import { SidebarGroup } from "./SidebarGroup"

export function Sidebar() {
  const { collapsed, toggleCollapsed, mobileOpen, setMobileOpen } = useSidebar()

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200/70 px-4 dark:border-white/10">
        <Link
          href="/sessions"
          className={`inline-flex items-center gap-2 rounded-lg px-1 py-1 text-sm font-semibold text-slate-900 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/[0.06] ${
            collapsed ? "justify-center w-full" : ""
          }`}
        >
          <WandSparkles className="h-4 w-4 shrink-0 text-violet-500 dark:text-violet-300" />
          {!collapsed && <span>OrchWiz</span>}
        </Link>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 space-y-2 overflow-y-auto px-2 py-3">
        {sidebarNav.map((group) => (
          <SidebarGroup key={group.key} group={group} />
        ))}
      </nav>

      {/* Collapse toggle (desktop only) */}
      <div className="hidden shrink-0 border-t border-slate-200/70 p-3 md:block dark:border-white/10">
        <button
          type="button"
          onClick={toggleCollapsed}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-white/[0.06] dark:hover:text-slate-300 ${
            collapsed ? "justify-center" : ""
          }`}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-slate-200/80 bg-white/90 backdrop-blur-sm transition-[width] duration-300 ease-in-out md:flex dark:border-white/10 dark:bg-slate-900/90 ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[44] bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-[45] flex w-72 flex-col border-r border-slate-200/80 bg-white backdrop-blur-sm transition-transform duration-300 ease-out md:hidden dark:border-white/10 dark:bg-slate-900 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Mobile uses expanded view always */}
        {/* Logo */}
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200/70 px-4 dark:border-white/10">
          <Link
            href="/sessions"
            className="inline-flex items-center gap-2 rounded-lg px-1 py-1 text-sm font-semibold text-slate-900 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/[0.06]"
          >
            <WandSparkles className="h-4 w-4 shrink-0 text-violet-500 dark:text-violet-300" />
            <span>OrchWiz</span>
          </Link>
        </div>

        {/* Nav groups (always expanded on mobile) */}
        <nav className="flex-1 space-y-2 overflow-y-auto px-2 py-3">
          {sidebarNav.map((group) => (
            <SidebarGroup key={group.key} group={group} />
          ))}
        </nav>
      </aside>
    </>
  )
}
