"use client"

import type { AgentTypeFilter } from "@/lib/subagents/personal-view"
import type { Subagent } from "./types"

interface AgentCardStripProps {
  agents: Subagent[]
  filteredAgents: Subagent[]
  selectedAgentId: string | null
  onSelectAgent: (agentId: string) => void
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  typeFilter: AgentTypeFilter
  onTypeFilterChange: (next: AgentTypeFilter) => void
  statusLineForAgent: (agent: Subagent) => string
}

const FILTER_OPTIONS: Array<{ id: AgentTypeFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "general", label: "General" },
  { id: "bridge_crew", label: "Bridge Crew" },
  { id: "exocomp", label: "Exocomp" },
]

function countByType(agents: Subagent[], filter: AgentTypeFilter): number {
  if (filter === "all") {
    return agents.length
  }

  return agents.filter((agent) => agent.subagentType === filter).length
}

export function AgentCardStrip({
  agents,
  filteredAgents,
  selectedAgentId,
  onSelectAgent,
  searchQuery,
  onSearchQueryChange,
  typeFilter,
  onTypeFilterChange,
  statusLineForAgent,
}: AgentCardStripProps) {
  return (
    <div className="space-y-3">
      <div className="space-y-2 sm:space-y-0">
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="Filter agents..."
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 sm:max-w-xs dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
        />

        <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200/80 bg-white/80 p-1 dark:border-white/10 dark:bg-white/[0.03]">
            {FILTER_OPTIONS.map((option) => {
              const isActive = option.id === typeFilter
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onTypeFilterChange(option.id)}
                  className={`inline-flex min-h-[34px] items-center rounded-md px-2.5 py-1.5 text-xs font-medium ${
                    isActive
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.08]"
                  }`}
                  aria-pressed={isActive}
                >
                  <span>{option.label}</span>
                  <span className="ml-1.5 rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] dark:bg-white/15">
                    {countByType(agents, option.id)}
                  </span>
                </button>
              )
            })}
        </div>
      </div>

      <div className="space-y-2 lg:space-y-0 lg:overflow-x-auto lg:pb-1">
        <div className="space-y-2 lg:flex lg:min-w-max lg:gap-2 lg:space-y-0">
          {filteredAgents.map((agent) => {
            const isSelected = agent.id === selectedAgentId
            return (
              <button
                key={agent.id}
                type="button"
                onClick={() => onSelectAgent(agent.id)}
                className={`w-full rounded-xl border px-3 py-2.5 text-left transition lg:min-w-[230px] lg:max-w-[260px] ${
                  isSelected
                    ? "border-cyan-500/45 bg-cyan-500/10"
                    : "border-slate-300/70 bg-white/80 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
                }`}
                aria-pressed={isSelected}
              >
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{agent.name}</p>
                <p className="mt-0.5 text-[11px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                  {agent.subagentType.replace("_", " ")}
                </p>
                <p className="mt-1.5 truncate text-xs text-slate-600 dark:text-slate-400">{statusLineForAgent(agent)}</p>
              </button>
            )
          })}
          {filteredAgents.length === 0 ? (
            <div className="w-full rounded-xl border border-dashed border-slate-300 bg-white/70 px-4 py-6 text-sm text-slate-500 lg:min-w-[280px] dark:border-white/15 dark:bg-white/[0.03] dark:text-slate-400">
              No agents match this filter.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
