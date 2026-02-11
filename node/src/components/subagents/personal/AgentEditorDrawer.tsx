"use client"

import type { FormEvent } from "react"
import { SlideOverPanel } from "@/components/dashboard/SlideOverPanel"
import type { SubagentTypeValue } from "@/lib/subagents/types"

interface SubagentFormState {
  name: string
  subagentType: SubagentTypeValue
  description: string
  content: string
  path: string
}

interface AgentEditorDrawerProps {
  open: boolean
  isEditing: boolean
  isSubmitting: boolean
  formData: SubagentFormState
  onClose: () => void
  onSubmit: (event: FormEvent) => void
  onChange: (patch: Partial<SubagentFormState>) => void
}

export function AgentEditorDrawer({
  open,
  isEditing,
  isSubmitting,
  formData,
  onClose,
  onSubmit,
  onChange,
}: AgentEditorDrawerProps) {
  return (
    <SlideOverPanel
      open={open}
      onClose={onClose}
      title={isEditing ? "Edit Personal Agent" : "Create New Personal Agent"}
      description="Define identity, scaffold content, and runtime path."
      maxWidthClassName="sm:max-w-3xl"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(event) => onChange({ name: event.target.value })}
              required
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
              placeholder="code-simplifier"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Path</label>
            <input
              type="text"
              value={formData.path}
              onChange={(event) => onChange({ path: event.target.value })}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
              placeholder=".claude/agents/code-simplifier/SOUL.md"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Type</label>
            <select
              value={formData.subagentType}
              onChange={(event) => onChange({ subagentType: event.target.value as SubagentTypeValue })}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
            >
              <option value="general">General</option>
              <option value="bridge_crew">Bridge Crew</option>
              <option value="exocomp">Exocomp</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Description</label>
          <input
            type="text"
            value={formData.description}
            onChange={(event) => onChange({ description: event.target.value })}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Legacy content scaffold</label>
          <textarea
            value={formData.content}
            onChange={(event) => onChange({ content: event.target.value })}
            required
            rows={10}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 sm:w-auto dark:bg-white dark:text-slate-900"
          >
            {isSubmitting ? (isEditing ? "Updating..." : "Creating...") : isEditing ? "Update" : "Create"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 sm:w-auto dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.08]"
          >
            Cancel
          </button>
        </div>
      </form>
    </SlideOverPanel>
  )
}
