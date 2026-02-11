"use client"

import type { CoreDetailView } from "@/lib/subagents/personal-view"

interface CoreDetailTabItem {
  id: CoreDetailView
  label: string
  badgeLabel: string | null
}

interface CoreDetailTabsProps {
  tabs: CoreDetailTabItem[]
  activeTab: CoreDetailView
  onTabChange: (tab: CoreDetailView) => void
  showAdvancedButton: boolean
  advancedBadgeLabel: string | null
  onOpenAdvanced: () => void
}

export function CoreDetailTabs({
  tabs,
  activeTab,
  onTabChange,
  showAdvancedButton,
  advancedBadgeLabel,
  onOpenAdvanced,
}: CoreDetailTabsProps) {
  return (
    <div className="space-y-2">
      <div className="lg:hidden">
        <label className="sr-only" htmlFor="core-detail-tab-select">Detail section</label>
        <select
          id="core-detail-tab-select"
          value={activeTab}
          onChange={(event) => onTabChange(event.target.value as CoreDetailView)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
        >
          {tabs.map((tab) => {
            const label = tab.badgeLabel ? `${tab.label} (${tab.badgeLabel})` : tab.label
            return (
              <option key={tab.id} value={tab.id}>
                {label}
              </option>
            )
          })}
        </select>
      </div>

      {showAdvancedButton ? (
        <button
          type="button"
          onClick={onOpenAdvanced}
          className="inline-flex min-h-[38px] w-full items-center justify-center rounded-lg border border-slate-300/80 px-3 py-1.5 text-sm text-slate-700 whitespace-nowrap hover:bg-slate-100 lg:hidden dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.08]"
        >
          <span>Advanced Settings</span>
          {advancedBadgeLabel ? (
            <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
              {advancedBadgeLabel}
            </span>
          ) : null}
        </button>
      ) : null}

      <div className="hidden overflow-x-auto pb-1 lg:block">
        <div className="flex min-w-max gap-2 lg:min-w-0 lg:flex-wrap">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`inline-flex min-h-[34px] shrink-0 items-center rounded-lg border px-3 py-1.5 text-sm whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-cyan-500/45 bg-cyan-500/12 text-cyan-700 dark:text-cyan-200"
                  : "border-slate-300/70 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/[0.06]"
              }`}
              aria-pressed={activeTab === tab.id}
            >
              <span>{tab.label}</span>
              {tab.badgeLabel ? (
                <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                  {tab.badgeLabel}
                </span>
              ) : null}
            </button>
          ))}

          {showAdvancedButton ? (
            <button
              type="button"
              onClick={onOpenAdvanced}
              className="inline-flex min-h-[34px] shrink-0 items-center rounded-lg border border-slate-300/80 px-3 py-1.5 text-sm text-slate-700 whitespace-nowrap hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.08]"
            >
              <span>Advanced Settings</span>
              {advancedBadgeLabel ? (
                <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                  {advancedBadgeLabel}
                </span>
              ) : null}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
