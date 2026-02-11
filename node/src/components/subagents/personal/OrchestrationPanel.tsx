"use client"

import { ContextOrchestrationBoard } from "@/components/subagents/ContextOrchestrationBoard"
import type { Subagent } from "./types"

interface OrchestrationPanelProps {
  subagents: Subagent[]
  selectedAgentId: string
  onSelectedAgentIdChange: (nextId: string | null) => void
}

export function OrchestrationPanel({
  subagents,
  selectedAgentId,
  onSelectedAgentIdChange,
}: OrchestrationPanelProps) {
  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Orchestration Graph</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">Explore context flow and dependencies for the selected agent.</p>
      </div>
      <ContextOrchestrationBoard
        subagents={subagents}
        selectedAgentId={selectedAgentId}
        onSelectedAgentIdChange={onSelectedAgentIdChange}
        hideAgentSelector
      />
    </div>
  )
}
