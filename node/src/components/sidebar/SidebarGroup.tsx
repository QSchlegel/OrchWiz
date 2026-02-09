"use client"

import { usePathname } from "next/navigation"
import { ChevronRight } from "lucide-react"
import type { NavGroup } from "./sidebarNav"
import { matchesPath } from "./sidebarNav"
import { useSidebar } from "./useSidebar"
import { SidebarItem } from "./SidebarItem"

interface SidebarGroupProps {
  group: NavGroup
}

export function SidebarGroup({ group }: SidebarGroupProps) {
  const pathname = usePathname()
  const { displayCollapsed, expandedGroups, toggleGroup } = useSidebar()
  const expanded = expandedGroups.has(group.key)
  const GroupIcon = group.icon

  const hasActiveItem = group.items.some((item) =>
    matchesPath(pathname, item.href)
  )

  // In collapsed mode, show all items as icons (no group toggle)
  if (displayCollapsed) {
    return (
      <div className="space-y-0.5 px-2">
        <div className="flex justify-center py-2">
          <GroupIcon
            className={`h-4 w-4 ${
              hasActiveItem
                ? "text-violet-500 dark:text-violet-400"
                : "text-slate-400 dark:text-slate-600"
            }`}
          />
        </div>
        {group.items.map((item) => (
          <SidebarItem
            key={item.href}
            item={item}
            active={matchesPath(pathname, item.href)}
          />
        ))}
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => toggleGroup(group.key)}
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
          hasActiveItem
            ? "text-violet-600 dark:text-violet-400"
            : "text-slate-500 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300"
        }`}
      >
        <GroupIcon className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
            expanded ? "rotate-90" : ""
          }`}
        />
      </button>

      {/* Animated expand/collapse using CSS grid trick */}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-in-out"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="space-y-0.5 px-2 pb-1">
            {group.items.map((item) => (
              <SidebarItem
                key={item.href}
                item={item}
                active={matchesPath(pathname, item.href)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
