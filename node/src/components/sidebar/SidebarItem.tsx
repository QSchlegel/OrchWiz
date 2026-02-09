"use client"

import Link from "next/link"
import type { NavItem } from "./sidebarNav"
import { useSidebar } from "./useSidebar"

interface SidebarItemProps {
  item: NavItem
  active: boolean
}

export function SidebarItem({ item, active }: SidebarItemProps) {
  const { displayCollapsed, setMobileOpen } = useSidebar()
  const Icon = item.icon

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={() => setMobileOpen(false)}
      className={`group/item relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
        active
          ? "bg-violet-500/10 text-violet-600 dark:text-violet-400"
          : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/[0.06]"
      } ${displayCollapsed ? "justify-center" : ""}`}
    >
      <Icon
        className={`h-4 w-4 shrink-0 ${
          active
            ? "text-violet-500 dark:text-violet-400"
            : "text-slate-500 dark:text-slate-500"
        }`}
      />

      {!displayCollapsed && <span className="truncate">{item.label}</span>}

      {displayCollapsed && (
        <span className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/item:opacity-100 dark:bg-slate-700">
          {item.label}
        </span>
      )}
    </Link>
  )
}
