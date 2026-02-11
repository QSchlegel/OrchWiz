"use client"

import type { Subagent } from "./types"

interface SelectedAgentHeaderProps {
  subagent: Subagent
  summary: string
  isMutable: boolean
  contextWords: number
  contextTokens: number
  policyCoverageLabel: string
  pendingHighRiskCount: number
  onEditBasics: () => void
  onDelete: () => void
}

export function SelectedAgentHeader({
  subagent,
  summary,
  isMutable,
  contextWords,
  contextTokens,
  policyCoverageLabel,
  pendingHighRiskCount,
  onEditBasics,
  onDelete,
}: SelectedAgentHeaderProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-xl font-semibold text-slate-900 dark:text-slate-100">{subagent.name}</h2>
          <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            {subagent.subagentType.replace("_", " ")}
          </p>
          <p className="mt-1 break-words text-sm text-slate-600 dark:text-slate-400">{summary}</p>
          <p className="mt-1 break-all text-xs text-slate-500 dark:text-slate-400">{subagent.path || "No path configured"}</p>
        </div>

        {isMutable ? (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
            <button
              type="button"
              onClick={onEditBasics}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 sm:w-auto dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.08]"
            >
              Edit basics
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="w-full rounded-lg border border-rose-500/35 px-3 py-2 text-sm text-rose-700 hover:bg-rose-500/10 sm:w-auto dark:text-rose-300"
            >
              Delete
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="rounded-full border border-slate-300/80 bg-white/70 px-3 py-1 text-xs text-slate-700 dark:border-white/15 dark:bg-white/[0.03] dark:text-slate-300">
          Context: {contextWords} words (~{contextTokens} tokens)
        </div>
        <div className="rounded-full border border-slate-300/80 bg-white/70 px-3 py-1 text-xs text-slate-700 dark:border-white/15 dark:bg-white/[0.03] dark:text-slate-300">
          Policies: {policyCoverageLabel}
        </div>
        <div className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-800 dark:text-cyan-200">
          Pending high-risk: {pendingHighRiskCount}
        </div>
      </div>
    </div>
  )
}
