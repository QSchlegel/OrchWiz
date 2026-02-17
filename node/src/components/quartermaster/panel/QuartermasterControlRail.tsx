"use client"

import Link from "next/link"
import { ChevronDown, ChevronUp, KeyRound, Loader2, RefreshCw, Settings2, ShieldCheck, X } from "lucide-react"
import type { KeyboardEvent as ReactKeyboardEvent } from "react"

type QuartermasterExecutionLevel = "read_only" | "workspace_write" | "danger_full_access"

interface QuartermasterLoopDefaults {
  intervalSeconds: number
  maxDurationSeconds: number
  maxIterations: number
  autoStopOnHealthyActive: boolean
}

interface QuartermasterLoopRunSummary {
  taskId: string
  executionLevel: QuartermasterExecutionLevel
  loopDefaults: QuartermasterLoopDefaults
  iterationCount: number
  failureCount: number
  stopReason: string | null
  completedAt: string | null
  startedAt: string
  lastError: string | null
}

type CodexCliAccountProvider = "chatgpt" | "api_key" | "unknown" | null

interface CodexCliConnectorState {
  executable: string
  shellExecutable: string
  binaryAvailable: boolean
  version: string | null
  accountConnected: boolean
  accountProvider: CodexCliAccountProvider
  statusMessage: string | null
  setupHints: string[]
}

interface LoopPreset {
  key: "balanced" | "fast" | "conservative"
  label: string
}

interface QuartermasterControlRailProps {
  showExecutiveControls: boolean
  onToggleExecutiveControls: () => void
  isControlDraftDirty: boolean
  isConfigLoading: boolean
  executionLevelDraft: QuartermasterExecutionLevel
  onExecutionLevelDraftChange: (level: QuartermasterExecutionLevel) => void
  loopPresets: LoopPreset[]
  onApplyLoopDefaultsPreset: (key: LoopPreset["key"]) => void
  loopDefaultsDraft: QuartermasterLoopDefaults
  onUpdateLoopDefaultsDraft: (patch: Partial<QuartermasterLoopDefaults>) => void
  dangerModeConfirmed: boolean
  onDangerModeConfirmedChange: (value: boolean) => void
  persistedExecutionLevel: QuartermasterExecutionLevel
  executionLevelLabel: (level: QuartermasterExecutionLevel) => string
  onResetControlDraft: () => void
  onSaveQuartermasterConfig: () => void
  isConfigSaving: boolean

  showLoopControls: boolean
  onToggleLoopControls: () => void
  onRefreshLoopStatus: () => void
  isLoopStatusLoading: boolean
  isLoopStarting: boolean
  isLoopStopping: boolean
  loopPrompt: string
  onLoopPromptChange: (value: string) => void
  onLoopPromptKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void
  onStartLoop: () => void
  onStopLoop: () => void
  activeLoopRun: QuartermasterLoopRunSummary | null
  latestLoopRun: QuartermasterLoopRunSummary | null
  activeLoopElapsedSeconds: number
  activeLoopDurationPercent: number
  loopStopReasonLabel: (reason: string | null) => string
  formatDurationSeconds: (seconds: number) => string
  prompt: string

  showCodexConnectorSetup: boolean
  codexConnector: CodexCliConnectorState | null
  isCodexConnectorLoading: boolean
  isCodexConnectorUpdating: boolean
  codexConnectorApiKey: string
  onCodexConnectorApiKeyChange: (value: string) => void
  onConnectCodexAccountWithApiKey: () => void
  onLoadCodexConnector: () => void
  codexConnectorNotice: string | null
  codexAccountProviderLabel: (provider: CodexCliAccountProvider) => string
}

export function QuartermasterControlRail(props: QuartermasterControlRailProps) {
  const {
    showExecutiveControls,
    onToggleExecutiveControls,
    isControlDraftDirty,
    isConfigLoading,
    executionLevelDraft,
    onExecutionLevelDraftChange,
    loopPresets,
    onApplyLoopDefaultsPreset,
    loopDefaultsDraft,
    onUpdateLoopDefaultsDraft,
    dangerModeConfirmed,
    onDangerModeConfirmedChange,
    persistedExecutionLevel,
    executionLevelLabel,
    onResetControlDraft,
    onSaveQuartermasterConfig,
    isConfigSaving,

    showLoopControls,
    onToggleLoopControls,
    onRefreshLoopStatus,
    isLoopStatusLoading,
    isLoopStarting,
    isLoopStopping,
    loopPrompt,
    onLoopPromptChange,
    onLoopPromptKeyDown,
    onStartLoop,
    onStopLoop,
    activeLoopRun,
    latestLoopRun,
    activeLoopElapsedSeconds,
    activeLoopDurationPercent,
    loopStopReasonLabel,
    formatDurationSeconds,
    prompt,

    showCodexConnectorSetup,
    codexConnector,
    isCodexConnectorLoading,
    isCodexConnectorUpdating,
    codexConnectorApiKey,
    onCodexConnectorApiKeyChange,
    onConnectCodexAccountWithApiKey,
    onLoadCodexConnector,
    codexConnectorNotice,
    codexAccountProviderLabel,
  } = props

  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-slate-300/70 bg-white/80 dark:border-white/12 dark:bg-white/[0.03]">
        <button
          type="button"
          onClick={onToggleExecutiveControls}
          className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
        >
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Executive Control Plane
            </p>
            <span className={`rounded-md border px-1.5 py-0.5 text-[10px] ${isControlDraftDirty ? "border-amber-400/45 bg-amber-500/10 text-amber-700 dark:text-amber-200" : "border-emerald-400/45 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"}`}>
              {isControlDraftDirty ? "Unsaved" : "Saved"}
            </span>
            {isConfigLoading && (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading
              </span>
            )}
          </div>
          <div className="inline-flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
            <span className="rounded-md border border-slate-300/70 px-2 py-1 dark:border-white/12">
              {executionLevelLabel(executionLevelDraft)}
            </span>
            {showExecutiveControls ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </div>
        </button>

        {showExecutiveControls && (
          <div className="border-t border-slate-300/70 px-3 pb-3 pt-2 dark:border-white/12">
            <div className="space-y-2">
              <label className="space-y-1">
                <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Execution Level</span>
                <select
                  value={executionLevelDraft}
                  onChange={(event) => onExecutionLevelDraftChange(event.target.value as QuartermasterExecutionLevel)}
                  disabled={isConfigLoading || isConfigSaving}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 disabled:opacity-60 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-100"
                >
                  <option value="read_only">Read Only</option>
                  <option value="workspace_write">Workspace Write</option>
                  <option value="danger_full_access">Danger Full Access</option>
                </select>
              </label>
              <div className="space-y-1">
                <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Loop Presets</span>
                <div className="flex flex-wrap gap-1.5">
                  {loopPresets.map((preset) => (
                    <button
                      key={preset.key}
                      type="button"
                      onClick={() => onApplyLoopDefaultsPreset(preset.key)}
                      disabled={isConfigLoading || isConfigSaving}
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08]"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="space-y-1">
                <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Loop Interval (seconds)</span>
                <input
                  type="number"
                  min={10}
                  max={3600}
                  value={loopDefaultsDraft.intervalSeconds}
                  disabled={isConfigLoading || isConfigSaving}
                  onChange={(event) => {
                    const value = Number.parseInt(event.target.value, 10)
                    if (Number.isFinite(value)) {
                      onUpdateLoopDefaultsDraft({ intervalSeconds: value })
                    }
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 disabled:opacity-60 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-100"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Loop Duration Cap (seconds)</span>
                <input
                  type="number"
                  min={60}
                  max={86400}
                  value={loopDefaultsDraft.maxDurationSeconds}
                  disabled={isConfigLoading || isConfigSaving}
                  onChange={(event) => {
                    const value = Number.parseInt(event.target.value, 10)
                    if (Number.isFinite(value)) {
                      onUpdateLoopDefaultsDraft({ maxDurationSeconds: value })
                    }
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 disabled:opacity-60 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-100"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Iteration Cap</span>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={loopDefaultsDraft.maxIterations}
                  disabled={isConfigLoading || isConfigSaving}
                  onChange={(event) => {
                    const value = Number.parseInt(event.target.value, 10)
                    if (Number.isFinite(value)) {
                      onUpdateLoopDefaultsDraft({ maxIterations: value })
                    }
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 disabled:opacity-60 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-100"
                />
              </label>
            </div>

            <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={loopDefaultsDraft.autoStopOnHealthyActive}
                disabled={isConfigLoading || isConfigSaving}
                onChange={(event) => onUpdateLoopDefaultsDraft({ autoStopOnHealthyActive: event.target.checked })}
                className="rounded border-slate-300"
              />
              Auto-stop when ship becomes healthy and active
            </label>

            {executionLevelDraft === "danger_full_access" && (
              <div className="mt-2 rounded-md border border-amber-400/45 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                <p>Danger mode can run destructive commands across the local environment.</p>
                <label className="mt-1 inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={dangerModeConfirmed}
                    onChange={(event) => onDangerModeConfirmedChange(event.target.checked)}
                    className="rounded border-amber-500/60"
                  />
                  Confirm dangerous execution for Quartermaster.
                </label>
              </div>
            )}

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Saved: {executionLevelLabel(persistedExecutionLevel)} · Draft: {executionLevelLabel(executionLevelDraft)}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onResetControlDraft}
                  disabled={!isControlDraftDirty || isConfigSaving || isConfigLoading}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 disabled:opacity-50 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200"
                >
                  Reset Draft
                </button>
                <button
                  type="button"
                  onClick={onSaveQuartermasterConfig}
                  disabled={isConfigSaving || isConfigLoading || !isControlDraftDirty || (executionLevelDraft === "danger_full_access" && !dangerModeConfirmed)}
                  className="inline-flex items-center gap-1 rounded-md border border-cyan-500/45 bg-cyan-500/12 px-2 py-1 text-xs font-medium text-cyan-700 disabled:opacity-50 dark:border-cyan-300/45 dark:text-cyan-200"
                >
                  {isConfigSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                  Apply Controls
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-300/70 bg-white/80 dark:border-white/12 dark:bg-white/[0.03]">
        <button
          type="button"
          onClick={onToggleLoopControls}
          className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
        >
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Continuous Self-Prompt Loop
            </p>
            <span className={`rounded-md border px-1.5 py-0.5 text-[10px] ${activeLoopRun ? "border-emerald-400/45 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200" : "border-slate-300/70 text-slate-600 dark:border-white/15 dark:text-slate-300"}`}>
              {activeLoopRun ? "Running" : "Idle"}
            </span>
          </div>
          <div className="inline-flex items-center gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onRefreshLoopStatus()
              }}
              disabled={isLoopStatusLoading || isLoopStarting || isLoopStopping}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-[11px] text-slate-700 disabled:opacity-50 dark:border-white/15 dark:text-slate-300"
            >
              {isLoopStatusLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Refresh
            </button>
            {showLoopControls ? <ChevronUp className="h-3.5 w-3.5 text-slate-500" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-500" />}
          </div>
        </button>

        {showLoopControls && (
          <div className="border-t border-slate-300/70 px-3 pb-3 pt-2 dark:border-white/12">
            <textarea
              value={loopPrompt}
              onChange={(event) => onLoopPromptChange(event.target.value)}
              onKeyDown={onLoopPromptKeyDown}
              rows={3}
              placeholder="Goal for autonomous loop (e.g. diagnose and recover unhealthy ship state)."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
            />
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Press Cmd/Ctrl + Enter to start. Runs with current control-plane level: {executionLevelLabel(executionLevelDraft)}.
            </p>
            {!loopPrompt.trim() && prompt.trim() && (
              <p className="mt-1 text-[11px] text-cyan-700 dark:text-cyan-200">
                No loop goal entered. Start will use the current chat prompt text.
              </p>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onStartLoop}
                disabled={isLoopStarting || isLoopStopping || (!loopPrompt.trim() && !prompt.trim())}
                className="inline-flex items-center gap-1 rounded-md border border-cyan-500/45 bg-cyan-500/12 px-2 py-1 text-xs font-medium text-cyan-700 disabled:opacity-50 dark:border-cyan-300/45 dark:text-cyan-200"
              >
                {isLoopStarting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                {activeLoopRun ? "Replace Active Loop" : "Start Loop"}
              </button>
              <button
                type="button"
                onClick={onStopLoop}
                disabled={isLoopStopping || !activeLoopRun}
                className="inline-flex items-center gap-1 rounded-md border border-rose-500/45 bg-rose-500/10 px-2 py-1 text-xs font-medium text-rose-700 disabled:opacity-50 dark:text-rose-200"
              >
                {isLoopStopping ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                Stop Loop
              </button>
            </div>

            {activeLoopRun ? (
              <div className="mt-2 rounded-md border border-slate-300/70 bg-white/70 px-3 py-2 text-xs text-slate-700 dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-200">
                <p>
                  Iteration {activeLoopRun.iterationCount}/{activeLoopRun.loopDefaults.maxIterations} · Elapsed {formatDurationSeconds(activeLoopElapsedSeconds)} / {formatDurationSeconds(activeLoopRun.loopDefaults.maxDurationSeconds)}
                </p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10">
                  <div
                    className="h-full rounded-full bg-cyan-500/80 transition-all"
                    style={{ width: `${activeLoopDurationPercent}%` }}
                  />
                </div>
                <p className="mt-1">
                  Level {executionLevelLabel(activeLoopRun.executionLevel)} · Failures {activeLoopRun.failureCount}
                </p>
                {activeLoopRun.lastError && (
                  <p className="mt-1 text-rose-700 dark:text-rose-200">Last error: {activeLoopRun.lastError}</p>
                )}
              </div>
            ) : latestLoopRun ? (
              <div className="mt-2 rounded-md border border-slate-300/70 bg-white/70 px-3 py-2 text-xs text-slate-700 dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-200">
                <p>
                  Last run ended {latestLoopRun.completedAt ? new Date(latestLoopRun.completedAt).toLocaleString() : "recently"}.
                </p>
                <p className="mt-1">
                  Stop reason: {loopStopReasonLabel(latestLoopRun.stopReason)} · Iterations {latestLoopRun.iterationCount}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                No loop runs recorded yet.
              </p>
            )}
          </div>
        )}
      </section>

      {showCodexConnectorSetup && (
        <section className="rounded-lg border border-slate-300/70 bg-white/80 p-3 dark:border-white/12 dark:bg-white/[0.03]">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Codex CLI Connector</p>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Quick setup for the local Codex CLI account used by Quartermaster runtime.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/settings"
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.08]"
              >
                <Settings2 className="h-3 w-3" />
                Open Settings
              </Link>
              <button
                type="button"
                onClick={onLoadCodexConnector}
                disabled={isCodexConnectorLoading || isCodexConnectorUpdating}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-[11px] text-slate-700 disabled:opacity-50 dark:border-white/15 dark:text-slate-300"
              >
                {isCodexConnectorLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Refresh
              </button>
            </div>
          </div>

          {isCodexConnectorLoading ? (
            <div className="mt-2 inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Inspecting Codex CLI connector...
            </div>
          ) : codexConnector ? (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                <span className={`rounded-md border px-2 py-1 ${codexConnector.binaryAvailable ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200" : "border-rose-400/40 bg-rose-500/10 text-rose-700 dark:text-rose-200"}`}>
                  {codexConnector.binaryAvailable ? "CLI Ready" : "CLI Missing"}
                </span>
                <span className="rounded-md border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-200">
                  Account: {codexAccountProviderLabel(codexConnector.accountProvider)}
                </span>
                {codexConnector.version && (
                  <span className="rounded-md border border-slate-300/70 px-2 py-1 dark:border-white/15">
                    {codexConnector.version}
                  </span>
                )}
              </div>

              <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                Binary: <code>{codexConnector.executable}</code>
              </p>
              {codexConnector.statusMessage && (
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{codexConnector.statusMessage}</p>
              )}
              {codexConnector.setupHints.length > 0 && (
                <div className="mt-2 space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                  {codexConnector.setupHints.map((hint, index) => (
                    <p key={`${hint}:${index}`}>{index + 1}. {hint}</p>
                  ))}
                </div>
              )}

              {codexConnector.binaryAvailable && (
                <div className="mt-3 rounded-md border border-cyan-400/30 bg-cyan-500/10 p-2.5">
                  <label className="text-[11px] uppercase tracking-wide text-cyan-700 dark:text-cyan-200">
                    API Key Setup
                  </label>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <input
                      type="password"
                      value={codexConnectorApiKey}
                      onChange={(event) => onCodexConnectorApiKeyChange(event.target.value)}
                      placeholder="sk-..."
                      className="min-w-[220px] flex-1 rounded-md border border-cyan-500/35 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-cyan-300/35 dark:bg-white/[0.06] dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={onConnectCodexAccountWithApiKey}
                      disabled={isCodexConnectorUpdating || !codexConnectorApiKey.trim()}
                      className="inline-flex items-center gap-1 rounded-md border border-cyan-500/45 bg-cyan-500/12 px-2 py-1 text-xs font-medium text-cyan-700 disabled:opacity-50 dark:border-cyan-300/45 dark:text-cyan-200"
                    >
                      {isCodexConnectorUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
                      Connect
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-cyan-700/80 dark:text-cyan-200/80">
                    Uses <code>codex login --with-api-key</code> on this machine. The key is not stored by this panel.
                  </p>
                </div>
              )}
            </>
          ) : (
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
              Connector status unavailable.
            </p>
          )}

          {codexConnectorNotice && (
            <div className="mt-2 rounded-md border border-slate-300/70 bg-white/70 px-2 py-1.5 text-[11px] text-slate-700 dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-200">
              {codexConnectorNotice}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
