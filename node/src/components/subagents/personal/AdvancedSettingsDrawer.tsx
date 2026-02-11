"use client"

import { SlideOverPanel } from "@/components/dashboard/SlideOverPanel"
import {
  ADVANCED_SECTION_ORDER,
  type AdvancedSection,
} from "@/lib/subagents/personal-view"
import type { SubagentSettings } from "./types"

interface AdvancedSettingsDrawerProps {
  open: boolean
  onClose: () => void
  activeSection: AdvancedSection
  onSectionChange: (section: AdvancedSection) => void
  settingsDraft: SubagentSettings
  readOnly: boolean
  visibleCapabilities: boolean
  dirtySections: Record<AdvancedSection, boolean>
  savingSections: Record<AdvancedSection, boolean>
  onUpdateOrchestration: (patch: Partial<SubagentSettings["orchestration"]>) => void
  onUpdateWorkspace: (patch: Partial<SubagentSettings["workspace"]>) => void
  onUpdateMemory: (patch: Partial<SubagentSettings["memory"]>) => void
  onUpdateGuidelines: (patch: Partial<SubagentSettings["guidelines"]>) => void
  onUpdateCapabilities: (patch: Partial<SubagentSettings["capabilities"]>) => void
  onSaveSection: (section: AdvancedSection) => void
  onOpenWorkspaceInspector: () => void
  publicMemoryHref: string
  privateMemoryHref: string
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function joinLines(values: string[]): string {
  return values.join("\n")
}

export function AdvancedSettingsDrawer({
  open,
  onClose,
  activeSection,
  onSectionChange,
  settingsDraft,
  readOnly,
  visibleCapabilities,
  dirtySections,
  savingSections,
  onUpdateOrchestration,
  onUpdateWorkspace,
  onUpdateMemory,
  onUpdateGuidelines,
  onUpdateCapabilities,
  onSaveSection,
  onOpenWorkspaceInspector,
  publicMemoryHref,
  privateMemoryHref,
}: AdvancedSettingsDrawerProps) {
  const visibleSections = ADVANCED_SECTION_ORDER.filter((entry) => entry.id !== "capabilities" || visibleCapabilities)

  return (
    <SlideOverPanel
      open={open}
      onClose={onClose}
      title="Advanced Settings"
      description="Tune workspace, memory, guidelines, and capabilities without cluttering primary workflow."
      maxWidthClassName="sm:max-w-3xl"
    >
      <div className="space-y-4">
        <div className="overflow-x-auto pb-1">
          <div className="flex min-w-max gap-2 md:min-w-0 md:flex-wrap">
            {visibleSections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => onSectionChange(section.id)}
                className={`shrink-0 rounded-lg border px-3 py-1.5 text-sm whitespace-nowrap ${
                  activeSection === section.id
                    ? "border-cyan-500/45 bg-cyan-500/12 text-cyan-700 dark:text-cyan-200"
                    : "border-slate-300/70 text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/[0.06]"
                }`}
              >
                {section.label}
              </button>
            ))}
          </div>
        </div>

        {activeSection === "workspace" ? (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Working directory</label>
              <input
                type="text"
                value={settingsDraft.workspace.workingDirectory}
                disabled={readOnly}
                onChange={(event) => onUpdateWorkspace({ workingDirectory: event.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/70 p-2.5 dark:border-white/10 dark:bg-white/[0.02]">
              <button
                type="button"
                onClick={onOpenWorkspaceInspector}
                disabled={readOnly}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 sm:w-auto dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/[0.08]"
              >
                Examine Working Directory
              </button>
              <p className="min-w-0 text-xs text-slate-500 dark:text-slate-400 sm:flex-1">
                Opens a read-only tree and file preview for this agent workspace.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Include paths (one per line)</label>
                <textarea
                  rows={6}
                  value={joinLines(settingsDraft.workspace.includePaths)}
                  disabled={readOnly}
                  onChange={(event) => onUpdateWorkspace({ includePaths: splitLines(event.target.value) })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Exclude paths (one per line)</label>
                <textarea
                  rows={6}
                  value={joinLines(settingsDraft.workspace.excludePaths)}
                  disabled={readOnly}
                  onChange={(event) => onUpdateWorkspace({ excludePaths: splitLines(event.target.value) })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                />
              </div>
            </div>

            {!readOnly ? (
              <button
                type="button"
                onClick={() => onSaveSection("workspace")}
                disabled={savingSections.workspace || !dirtySections.workspace}
                className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 sm:w-auto dark:bg-white dark:text-slate-900"
              >
                {savingSections.workspace ? "Saving..." : "Save Workspace"}
              </button>
            ) : null}
          </div>
        ) : null}

        {activeSection === "memory" ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Mode
                <select
                  value={settingsDraft.memory.mode}
                  disabled={readOnly}
                  onChange={(event) =>
                    onUpdateMemory({ mode: event.target.value as "session" | "rolling" | "ephemeral" })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                >
                  <option value="session">session</option>
                  <option value="rolling">rolling</option>
                  <option value="ephemeral">ephemeral</option>
                </select>
              </label>

              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Max entries
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={settingsDraft.memory.maxEntries}
                  disabled={readOnly}
                  onChange={(event) => {
                    const nextValue = Number(event.target.value)
                    onUpdateMemory({
                      maxEntries: Number.isFinite(nextValue)
                        ? Math.max(1, Math.min(1000, Math.round(nextValue)))
                        : settingsDraft.memory.maxEntries,
                    })
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                />
              </label>

              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Summary style
                <select
                  value={settingsDraft.memory.summaryStyle}
                  disabled={readOnly}
                  onChange={(event) =>
                    onUpdateMemory({ summaryStyle: event.target.value as "concise" | "detailed" })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                >
                  <option value="concise">concise</option>
                  <option value="detailed">detailed</option>
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/70 p-2.5 dark:border-white/10 dark:bg-white/[0.02]">
              <a
                href={publicMemoryHref}
                target="_blank"
                rel="noreferrer"
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 sm:w-auto dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/[0.08]"
              >
                Open Public Memory
              </a>
              <a
                href={privateMemoryHref}
                target="_blank"
                rel="noreferrer"
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 sm:w-auto dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/[0.08]"
              >
                Open Private Memory
              </a>
              <p className="min-w-0 text-xs text-slate-500 dark:text-slate-400 sm:flex-1">
                Opens the Vault explorer in a new tab for deeper memory inspection.
              </p>
            </div>

            {!readOnly ? (
              <button
                type="button"
                onClick={() => onSaveSection("memory")}
                disabled={savingSections.memory || !dirtySections.memory}
                className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 sm:w-auto dark:bg-white dark:text-slate-900"
              >
                {savingSections.memory ? "Saving..." : "Save Memory"}
              </button>
            ) : null}
          </div>
        ) : null}

        {activeSection === "guidelines" ? (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Guideline references (one per line)</label>
              <textarea
                rows={5}
                value={joinLines(settingsDraft.guidelines.references)}
                disabled={readOnly}
                onChange={(event) => onUpdateGuidelines({ references: splitLines(event.target.value) })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Guideline notes</label>
              <textarea
                rows={7}
                value={settingsDraft.guidelines.notes}
                disabled={readOnly}
                onChange={(event) => onUpdateGuidelines({ notes: event.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
              />
            </div>

            {!readOnly ? (
              <button
                type="button"
                onClick={() => onSaveSection("guidelines")}
                disabled={savingSections.guidelines || !dirtySections.guidelines}
                className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 sm:w-auto dark:bg-white dark:text-slate-900"
              >
                {savingSections.guidelines ? "Saving..." : "Save Guidelines"}
              </button>
            ) : null}
          </div>
        ) : null}

        {activeSection === "capabilities" && visibleCapabilities ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3 text-xs text-cyan-900 dark:text-cyan-100">
              Exocomp capability preset: <span className="font-semibold">{settingsDraft.capabilities.preset}</span>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={settingsDraft.capabilities.diagnostics}
                  disabled={readOnly}
                  onChange={(event) => onUpdateCapabilities({ diagnostics: event.target.checked })}
                />
                Diagnostics
              </label>

              <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={settingsDraft.capabilities.microRepairPlanning}
                  disabled={readOnly}
                  onChange={(event) => onUpdateCapabilities({ microRepairPlanning: event.target.checked })}
                />
                Micro-repair planning
              </label>

              <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={settingsDraft.capabilities.hazardChecks}
                  disabled={readOnly}
                  onChange={(event) => onUpdateCapabilities({ hazardChecks: event.target.checked })}
                />
                Hazard checks
              </label>

              <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={settingsDraft.capabilities.safeShutdownGuidance}
                  disabled={readOnly}
                  onChange={(event) => onUpdateCapabilities({ safeShutdownGuidance: event.target.checked })}
                />
                Safe shutdown guidance
              </label>

              <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 md:col-span-2">
                <input
                  type="checkbox"
                  checked={settingsDraft.capabilities.statusRelay}
                  disabled={readOnly}
                  onChange={(event) => onUpdateCapabilities({ statusRelay: event.target.checked })}
                />
                Status relay
              </label>
            </div>

            {!readOnly ? (
              <button
                type="button"
                onClick={() => onSaveSection("capabilities")}
                disabled={savingSections.capabilities || !dirtySections.capabilities}
                className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 sm:w-auto dark:bg-white dark:text-slate-900"
              >
                {savingSections.capabilities ? "Saving..." : "Save Capabilities"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </SlideOverPanel>
  )
}
