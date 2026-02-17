"use client"

import type { HarnessRuntimeProfile, SubagentSettings } from "@/lib/subagents/settings"

interface HarnessPanelProps {
  harness: SubagentSettings["harness"]
  readOnly: boolean
  isDirty: boolean
  isSaving: boolean
  onRuntimeProfileChange: (profile: HarnessRuntimeProfile) => void
  onAutoloadChange: (key: "context" | "tools" | "skills", value: boolean) => void
  onTrustGraphEnabledChange: (value: boolean) => void
  onTrustGraphCollectionChange: (value: string) => void
  onTrustGraphFlowIdChange: (value: string) => void
  onTrustGraphMaxCharsChange: (value: number) => void
  onApplyWhenSubagentPresentChange: (value: boolean) => void
  onSave: () => void
}

export function HarnessPanel({
  harness,
  readOnly,
  isDirty,
  isSaving,
  onRuntimeProfileChange,
  onAutoloadChange,
  onTrustGraphEnabledChange,
  onTrustGraphCollectionChange,
  onTrustGraphFlowIdChange,
  onTrustGraphMaxCharsChange,
  onApplyWhenSubagentPresentChange,
  onSave,
}: HarnessPanelProps) {
  const trustgraph = harness.enhancements.trustgraph

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Harness Controls</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Runtime profile and autoload controls applied when this subagent is attached to the session.
            </p>
          </div>
          {readOnly ? (
            <span className="rounded-full border border-slate-300 px-2 py-0.5 text-xs text-slate-500 dark:border-white/15 dark:text-slate-400">
              Read-only
            </span>
          ) : null}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-xs text-slate-600 dark:text-slate-300">
            Agent runtime profile
            <select
              value={harness.runtimeProfile}
              disabled={readOnly}
              onChange={(event) => onRuntimeProfileChange(event.target.value as HarnessRuntimeProfile)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
            >
              <option value="default">default</option>
              <option value="quartermaster">quartermaster</option>
            </select>
          </label>

          <label className="inline-flex items-center justify-between rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2 text-sm text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200">
            Apply only when subagent is present
            <input
              type="checkbox"
              checked={harness.applyWhenSubagentPresent}
              disabled={readOnly}
              onChange={(event) => onApplyWhenSubagentPresentChange(event.target.checked)}
            />
          </label>
        </div>

        <div className="mt-3 rounded-lg border border-slate-200/80 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-white/[0.02]">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">Autoload</p>
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
            {([
              { key: "context", label: "Context files" },
              { key: "tools", label: "Agent-bound tools" },
              { key: "skills", label: "Assigned skills" },
            ] as const).map((item) => (
              <label
                key={item.key}
                className="inline-flex items-center justify-between rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2 text-sm text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200"
              >
                {item.label}
                <input
                  type="checkbox"
                  checked={harness.autoload[item.key]}
                  disabled={readOnly}
                  onChange={(event) => onAutoloadChange(item.key, event.target.checked)}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-slate-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">
                Enhancement Plugins
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Optional runtime context injectors that run when this subagent is attached to the session.
              </p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2">
            <label className="inline-flex items-center justify-between rounded-lg border border-slate-200/80 bg-slate-50/70 px-3 py-2 text-sm text-slate-700 dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-200">
              TrustGraph context injection (GraphRAG)
              <input
                type="checkbox"
                checked={trustgraph.enabled}
                disabled={readOnly}
                onChange={(event) => onTrustGraphEnabledChange(event.target.checked)}
              />
            </label>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Requires <span className="font-mono">ENABLE_AGENT_HARNESS_POD=true</span> and server env{" "}
              <span className="font-mono">TRUSTGRAPH_SOCKET_URL</span> (optional{" "}
              <span className="font-mono">TRUSTGRAPH_TOKEN</span>).
            </p>

            {trustgraph.enabled ? (
              <div className="mt-1 grid grid-cols-1 gap-3 md:grid-cols-3">
                <label className="text-xs text-slate-600 dark:text-slate-300">
                  Collection
                  <input
                    value={trustgraph.collection}
                    disabled={readOnly}
                    onChange={(event) => onTrustGraphCollectionChange(event.target.value)}
                    placeholder="default"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                  />
                </label>

                <label className="text-xs text-slate-600 dark:text-slate-300">
                  Flow ID
                  <input
                    value={trustgraph.flowId}
                    disabled={readOnly}
                    onChange={(event) => onTrustGraphFlowIdChange(event.target.value)}
                    placeholder="default"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                  />
                </label>

                <label className="text-xs text-slate-600 dark:text-slate-300">
                  Max injected chars
                  <input
                    type="number"
                    min={1}
                    max={20000}
                    value={trustgraph.maxChars}
                    disabled={readOnly}
                    onChange={(event) => {
                      const next = Number.parseInt(event.target.value, 10)
                      if (!Number.isFinite(next)) {
                        return
                      }
                      onTrustGraphMaxCharsChange(Math.max(1, Math.min(20000, next)))
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                  />
                </label>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-cyan-500/25 bg-cyan-500/10 p-2 text-xs text-cyan-800 dark:text-cyan-200">
          Failure mode: <span className="font-semibold">{harness.failureMode}</span> (runtime stays fail-open with warning annotations).
        </div>

        {!readOnly ? (
          <div className="mt-3">
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving || !isDirty}
              className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 sm:w-auto dark:bg-white dark:text-slate-900"
            >
              {isSaving ? "Saving..." : "Save Harness Controls"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
