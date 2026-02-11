"use client"

import { EmptyState, SurfaceCard } from "@/components/dashboard/PageLayout"
import type { AgentSyncPreference, AgentSyncRun } from "./types"

interface AgentSyncPanelProps {
  canRunSelectedAgentSync: boolean
  isAgentSyncRunningSelected: boolean
  isAgentSyncRunningCrew: boolean
  proposedHighRiskSuggestionCount: number
  agentSyncPreference: AgentSyncPreference
  isAgentSyncPreferenceLoading: boolean
  isAgentSyncPreferenceSaving: boolean
  onPreferenceChange: (patch: Partial<AgentSyncPreference>) => void
  onSavePreference: () => void
  onRunAgentSync: (scope: "selected_agent" | "bridge_crew") => void
  agentSyncRuns: AgentSyncRun[]
  isAgentSyncRunsLoading: boolean
  actingSuggestionId: string | null
  onApplySuggestion: (suggestionId: string) => void
  onRejectSuggestion: (suggestionId: string) => void
}

export function AgentSyncPanel({
  canRunSelectedAgentSync,
  isAgentSyncRunningSelected,
  isAgentSyncRunningCrew,
  proposedHighRiskSuggestionCount,
  agentSyncPreference,
  isAgentSyncPreferenceLoading,
  isAgentSyncPreferenceSaving,
  onPreferenceChange,
  onSavePreference,
  onRunAgentSync,
  agentSyncRuns,
  isAgentSyncRunsLoading,
  actingSuggestionId,
  onApplySuggestion,
  onRejectSuggestion,
}: AgentSyncPanelProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Run AgentSync</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Heuristic reinforcement updates are auto-applied to low-risk files and proposed for high-risk files.
            </p>
          </div>
          <span className="rounded-full border border-cyan-500/35 bg-cyan-500/10 px-2 py-0.5 text-xs text-cyan-700 dark:text-cyan-200">
            {proposedHighRiskSuggestionCount} pending high-risk
          </span>
        </div>

        {!canRunSelectedAgentSync ? (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
            Select a personal agent to run selected-agent AgentSync.
          </p>
        ) : null}

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            type="button"
            onClick={() => onRunAgentSync("selected_agent")}
            disabled={!canRunSelectedAgentSync || isAgentSyncRunningSelected || isAgentSyncRunningCrew}
            className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 sm:w-auto dark:bg-white dark:text-slate-900"
          >
            {isAgentSyncRunningSelected ? "Running Selected..." : "Run AgentSync (Selected Agent)"}
          </button>
          <button
            type="button"
            onClick={() => onRunAgentSync("bridge_crew")}
            disabled={isAgentSyncRunningCrew || isAgentSyncRunningSelected}
            className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50 sm:w-auto dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.08]"
          >
            {isAgentSyncRunningCrew ? "Running Bridge Crew..." : "Run Full Bridge Crew"}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.03]">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Nightly Preferences</h4>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Hourly cron should call `/api/agentsync/nightly`; due users run at local {agentSyncPreference.nightlyHour
            .toString()
            .padStart(2, "0")}
          :00.
        </p>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Timezone
            <input
              type="text"
              value={agentSyncPreference.timezone}
              onChange={(event) => onPreferenceChange({ timezone: event.target.value })}
              disabled={isAgentSyncPreferenceLoading || isAgentSyncPreferenceSaving}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
              placeholder="America/New_York"
            />
          </label>
          <label className="inline-flex items-center justify-between rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2 text-sm text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200">
            Nightly enabled
            <input
              type="checkbox"
              checked={agentSyncPreference.nightlyEnabled}
              onChange={(event) => onPreferenceChange({ nightlyEnabled: event.target.checked })}
              disabled={isAgentSyncPreferenceLoading || isAgentSyncPreferenceSaving}
            />
          </label>
        </div>

        <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Last nightly run: {agentSyncPreference.lastNightlyRunAt
              ? new Date(agentSyncPreference.lastNightlyRunAt).toLocaleString()
              : "never"}
          </p>
          <button
            type="button"
            onClick={onSavePreference}
            disabled={isAgentSyncPreferenceLoading || isAgentSyncPreferenceSaving}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50 sm:w-auto dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.08]"
          >
            {isAgentSyncPreferenceSaving ? "Saving..." : "Save Preferences"}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.03]">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Run History</h4>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Recent selected-agent or bridge-crew runs with high-risk approval actions.
        </p>

        {isAgentSyncRunsLoading ? (
          <SurfaceCard className="mt-3">Loading AgentSync runs...</SurfaceCard>
        ) : agentSyncRuns.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No AgentSync runs yet" description="Trigger a run to generate reinforcement updates." />
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {agentSyncRuns.map((run) => {
              const highRiskSuggestions = run.suggestions.filter((suggestion) => suggestion.risk === "high")

              return (
                <div
                  key={run.id}
                  className="rounded-lg border border-slate-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.03]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {run.scope === "selected_agent" ? "Selected Agent Run" : "Bridge Crew Run"} · {run.status}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {run.trigger} · {new Date(run.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <span className="rounded-full border border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 dark:border-white/15 dark:text-slate-300">
                      {run.fileSyncStatus === "filesystem_sync_failed" ? "filesystem sync warning" : run.fileSyncStatus}
                    </span>
                  </div>

                  {run.summary ? <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{run.summary}</p> : null}

                  {highRiskSuggestions.length > 0 ? (
                    <div className="mt-3 space-y-2 border-t border-slate-200/80 pt-2 dark:border-white/10">
                      {highRiskSuggestions.map((suggestion) => (
                        <div
                          key={suggestion.id}
                          className="rounded-lg border border-slate-200/80 bg-slate-50/70 p-2 dark:border-white/10 dark:bg-white/[0.02]"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="font-mono text-xs font-medium text-slate-900 dark:text-slate-100">
                                {suggestion.fileName}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {suggestion.status}
                                {suggestion.reason ? ` · ${suggestion.reason}` : ""}
                              </p>
                            </div>
                            {suggestion.status === "proposed" ? (
                              <div className="flex w-full gap-2 sm:w-auto">
                                <button
                                  type="button"
                                  onClick={() => onApplySuggestion(suggestion.id)}
                                  disabled={actingSuggestionId === suggestion.id}
                                  className="flex-1 rounded-lg border border-emerald-500/35 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-500/10 disabled:opacity-50 sm:flex-none dark:text-emerald-300"
                                >
                                  {actingSuggestionId === suggestion.id ? "Applying..." : "Apply"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onRejectSuggestion(suggestion.id)}
                                  disabled={actingSuggestionId === suggestion.id}
                                  className="flex-1 rounded-lg border border-rose-500/35 px-2 py-1 text-xs text-rose-700 hover:bg-rose-500/10 disabled:opacity-50 sm:flex-none dark:text-rose-300"
                                >
                                  {actingSuggestionId === suggestion.id ? "Saving..." : "Reject"}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
