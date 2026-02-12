"use client"

import type {
  SubagentToolBindingView,
  ToolCatalogEntryView,
  ToolImportRunView,
} from "./types"

interface PersonalToolsPanelProps {
  readOnly: boolean
  selectedAgentName: string
  toolCatalog: ToolCatalogEntryView[]
  toolImportRuns: ToolImportRunView[]
  isCatalogLoading: boolean
  isRefreshingCatalog: boolean
  importingCuratedSlug: string | null
  isImportingGithubUrl: boolean
  githubUrlDraft: string
  bindings: SubagentToolBindingView[]
  bindingsDraft: Record<string, boolean>
  isBindingsLoading: boolean
  isBindingsSaving: boolean
  bindingsDirty: boolean
  shipDeploymentIdDraft: string
  actingBridgeCrewIdDraft: string
  grantRationaleDraft: string
  revokeReasonDraft: string
  onRefreshCatalog: () => void
  onImportCurated: (slug: string) => void
  onGithubUrlDraftChange: (value: string) => void
  onImportGithubUrl: () => void
  onShipDeploymentIdDraftChange: (value: string) => void
  onActingBridgeCrewIdDraftChange: (value: string) => void
  onGrantRationaleDraftChange: (value: string) => void
  onRevokeReasonDraftChange: (value: string) => void
  onToggleBinding: (toolCatalogEntryId: string, enabled: boolean) => void
  onSaveBindings: () => void
}

function asBooleanMetadata(value: Record<string, unknown> | null, key: string, fallback: boolean): boolean {
  if (!value) {
    return fallback
  }

  const raw = value[key]
  return typeof raw === "boolean" ? raw : fallback
}

function asStringMetadata(value: Record<string, unknown> | null, key: string): string | null {
  if (!value) {
    return null
  }

  const raw = value[key]
  if (typeof raw !== "string") {
    return null
  }

  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function PersonalToolsPanel({
  readOnly,
  selectedAgentName,
  toolCatalog,
  toolImportRuns,
  isCatalogLoading,
  isRefreshingCatalog,
  importingCuratedSlug,
  isImportingGithubUrl,
  githubUrlDraft,
  bindings,
  bindingsDraft,
  isBindingsLoading,
  isBindingsSaving,
  bindingsDirty,
  shipDeploymentIdDraft,
  actingBridgeCrewIdDraft,
  grantRationaleDraft,
  revokeReasonDraft,
  onRefreshCatalog,
  onImportCurated,
  onGithubUrlDraftChange,
  onImportGithubUrl,
  onShipDeploymentIdDraftChange,
  onActingBridgeCrewIdDraftChange,
  onGrantRationaleDraftChange,
  onRevokeReasonDraftChange,
  onToggleBinding,
  onSaveBindings,
}: PersonalToolsPanelProps) {
  const curatedEntries = toolCatalog
    .filter((entry) => entry.source === "curated")
    .sort((left, right) => left.slug.localeCompare(right.slug))

  const installedEntries = toolCatalog
    .filter((entry) => entry.isInstalled && !entry.isSystem)
    .sort((left, right) => left.slug.localeCompare(right.slug))

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div className="rounded-lg border border-slate-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Global Tool Catalog</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Import curated tools and custom GitHub tools, then bind them per agent.
            </p>
          </div>
          <button
            type="button"
            onClick={onRefreshCatalog}
            disabled={isRefreshingCatalog}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.08]"
          >
            {isRefreshingCatalog ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="mt-3 space-y-2">
          {isCatalogLoading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading catalog...</p>
          ) : curatedEntries.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No curated tools available.</p>
          ) : (
            curatedEntries.map((entry) => {
              const available = asBooleanMetadata(entry.metadata, "available", true)
              const unavailableReason = asStringMetadata(entry.metadata, "unavailableReason")
              const importDisabled =
                !available
                || entry.isInstalled
                || entry.activationStatus !== "approved"
                || importingCuratedSlug === entry.slug

              return (
                <div
                  key={entry.id}
                  className="rounded-lg border border-slate-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.03]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{entry.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{entry.slug}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onImportCurated(entry.slug)}
                      disabled={importDisabled}
                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-slate-900"
                    >
                      {entry.isInstalled ? "Installed" : importingCuratedSlug === entry.slug ? "Importing..." : "Import"}
                    </button>
                  </div>
                  {entry.description ? (
                    <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{entry.description}</p>
                  ) : null}
                  {!available && unavailableReason ? (
                    <p className="mt-2 rounded-md border border-amber-500/35 bg-amber-500/10 px-2 py-1 text-xs text-amber-800 dark:text-amber-200">
                      {unavailableReason}
                    </p>
                  ) : null}
                  {entry.activationStatus !== "approved" ? (
                    <p className="mt-2 rounded-md border border-rose-500/35 bg-rose-500/10 px-2 py-1 text-xs text-rose-800 dark:text-rose-200">
                      Activation status: {entry.activationStatus}
                    </p>
                  ) : null}
                </div>
              )
            })
          )}
        </div>

        <div className="mt-4 rounded-lg border border-slate-200/80 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-white/[0.02]">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">
            Import from GitHub URL
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={githubUrlDraft}
              onChange={(event) => onGithubUrlDraftChange(event.target.value)}
              placeholder="https://github.com/org/repo/tree/main/tool-path"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
            />
            <button
              type="button"
              onClick={onImportGithubUrl}
              disabled={isImportingGithubUrl || !githubUrlDraft.trim()}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.08]"
            >
              {isImportingGithubUrl ? "Importing..." : "Import URL"}
            </button>
          </div>
        </div>

        {toolImportRuns.length > 0 ? (
          <div className="mt-4 rounded-lg border border-slate-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.03]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">Recent imports</p>
            <div className="mt-2 space-y-1">
              {toolImportRuns.slice(0, 6).map((run) => (
                <div key={run.id} className="flex items-start justify-between gap-2 text-xs">
                  <span
                    title={run.toolSlug || run.sourceUrl || "Unknown tool"}
                    className="min-w-0 flex-1 break-all text-slate-700 dark:text-slate-200"
                  >
                    {run.toolSlug || run.sourceUrl || "Unknown tool"}
                  </span>
                  <span className={`shrink-0 rounded px-2 py-0.5 ${
                    run.status === "succeeded"
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : run.status === "failed"
                        ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                        : "bg-slate-500/15 text-slate-700 dark:text-slate-300"
                  }`}
                  >
                    {run.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-slate-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Agent Tool Bindings</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Bind imported tools to <span className="font-semibold">{selectedAgentName}</span>.
            </p>
          </div>
          {readOnly ? (
            <span className="rounded-full border border-slate-300 px-2 py-0.5 text-xs text-slate-500 dark:border-white/15 dark:text-slate-400">
              Read-only
            </span>
          ) : null}
        </div>

        <div className="mt-3 space-y-2">
          {isBindingsLoading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading bindings...</p>
          ) : installedEntries.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Import tools first to bind them to this agent.
            </p>
          ) : (
            installedEntries.map((entry) => {
              const enabled = bindingsDraft[entry.id] === true
              const storedBinding = bindings.find((binding) => binding.toolCatalogEntryId === entry.id)
              const activationBlocked = entry.activationStatus !== "approved"

              return (
                <label
                  key={entry.id}
                  className="inline-flex w-full items-start justify-between gap-3 rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2 text-sm text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200"
                >
                  <div className="min-w-0">
                    <p className="break-words font-medium">{entry.name}</p>
                    <p className="break-all text-xs text-slate-500 dark:text-slate-400">
                      {entry.slug} · {entry.source}
                      {storedBinding ? ` · saved=${storedBinding.enabled ? "enabled" : "disabled"}` : ""}
                      {` · activation=${entry.activationStatus}`}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={enabled}
                    disabled={readOnly || activationBlocked}
                    className="mt-0.5 shrink-0"
                    onChange={(event) => onToggleBinding(entry.id, event.target.checked)}
                  />
                </label>
              )
            })
          )}
        </div>

        {!readOnly ? (
          <div className="mt-3">
            <div className="mb-3 grid gap-2 sm:grid-cols-2">
              <input
                type="text"
                value={shipDeploymentIdDraft}
                onChange={(event) => onShipDeploymentIdDraftChange(event.target.value)}
                placeholder="Ship deployment ID (optional)"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
              />
              <input
                type="text"
                value={actingBridgeCrewIdDraft}
                onChange={(event) => onActingBridgeCrewIdDraftChange(event.target.value)}
                placeholder="Acting bridge crew ID (optional)"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
              />
              <input
                type="text"
                value={grantRationaleDraft}
                onChange={(event) => onGrantRationaleDraftChange(event.target.value)}
                placeholder="Grant rationale (required for new grants)"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
              />
              <input
                type="text"
                value={revokeReasonDraft}
                onChange={(event) => onRevokeReasonDraftChange(event.target.value)}
                placeholder="Revoke reason (optional)"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
              />
            </div>
            <button
              type="button"
              onClick={onSaveBindings}
              disabled={isBindingsSaving || !bindingsDirty}
              className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 sm:w-auto dark:bg-white dark:text-slate-900"
            >
              {isBindingsSaving ? "Saving..." : "Save Agent Bindings"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
