"use client"

import { EmptyState, SurfaceCard } from "@/components/dashboard/PageLayout"
import type { ContextFileView, ContextSize } from "./types"

interface ContextPanelProps {
  contextSource: "filesystem" | "content-fallback"
  contextRootPath: string | null
  contextTotals: ContextSize
  contextFiles: ContextFileView[]
  isContextLoading: boolean
  isContextSaving: boolean
  isContextDirty: boolean
  readOnly: boolean
  onReload: () => void
  onSave: () => void
  onUpdateFile: (fileName: string, nextContent: string) => void
}

export function ContextPanel({
  contextSource,
  contextRootPath,
  contextTotals,
  contextFiles,
  isContextLoading,
  isContextSaving,
  isContextDirty,
  readOnly,
  onReload,
  onSave,
  onUpdateFile,
}: ContextPanelProps) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200/80 bg-slate-50/70 p-3 text-xs text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 break-words">
            Source: <span className="font-semibold">{contextSource === "filesystem" ? "Filesystem" : "Content fallback"}</span>
          </span>
          <span className="min-w-0 break-words">
            Total: <span className="font-semibold">{contextTotals.wordCount} words</span> · <span className="font-semibold">~{contextTotals.estimatedTokens} tokens</span>
          </span>
        </div>
        {contextRootPath ? <p className="mt-1 break-all">Root: {contextRootPath}</p> : null}
      </div>

      {isContextLoading ? (
        <SurfaceCard>Loading context files...</SurfaceCard>
      ) : contextFiles.length === 0 ? (
        <EmptyState title="No context files found" description="Add context files to compose this agent runtime prompt." />
      ) : (
        <div className="space-y-3">
          {contextFiles.map((file) => (
            <div
              key={file.fileName}
              className="rounded-lg border border-slate-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.03]"
            >
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="break-all font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">{file.fileName}</p>
                  <p className="break-all text-xs text-slate-500 dark:text-slate-400">{file.relativePath}</p>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 sm:shrink-0">
                  {file.size.wordCount} words · ~{file.size.estimatedTokens} tokens
                </p>
              </div>
              <textarea
                value={file.content}
                onChange={(event) => onUpdateFile(file.fileName, event.target.value)}
                rows={6}
                disabled={readOnly}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 disabled:opacity-60 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onReload}
          disabled={isContextLoading}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50 sm:w-auto dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.08]"
        >
          Reload
        </button>
        {!readOnly ? (
          <button
            type="button"
            onClick={onSave}
            disabled={isContextSaving || !isContextDirty}
            className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 sm:w-auto dark:bg-white dark:text-slate-900"
          >
            {isContextSaving ? "Saving..." : "Save Context"}
          </button>
        ) : null}
      </div>
    </div>
  )
}
