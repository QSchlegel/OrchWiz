"use client"

import { BookOpen, FilePlus2, Loader2, RefreshCw, Save, Search, Trash2 } from "lucide-react"

type KnowledgeScope = "ship" | "fleet" | "all"
type KnowledgeMode = "hybrid" | "lexical"
type KnowledgeBackend = "auto" | "vault-local" | "data-core-merged"

interface KnowledgeCitation {
  id: string
  path: string
  excerpt: string
  scopeType: "ship" | "fleet" | "global"
  score: number
}

interface KnowledgeTreeNode {
  id: string
  name: string
  path: string
  nodeType: "folder" | "file"
  children?: KnowledgeTreeNode[]
}

interface QuartermasterKnowledgePaneProps {
  compact: boolean
  shipDeploymentId: string
  knowledgeScope: KnowledgeScope
  knowledgeMode: KnowledgeMode
  knowledgeBackend: KnowledgeBackend
  knowledgeQuery: string
  onKnowledgeScopeChange: (value: KnowledgeScope) => void
  onKnowledgeModeChange: (value: KnowledgeMode) => void
  onKnowledgeBackendChange: (value: KnowledgeBackend) => void
  onKnowledgeQueryChange: (value: string) => void
  onKnowledgeSearch: () => void
  isSearchingKnowledge: boolean
  onKnowledgeResync: (scope: KnowledgeScope) => void
  isResyncingKnowledge: boolean
  syncSummaryText: string
  knowledgeResults: KnowledgeCitation[]
  knowledgeTree: KnowledgeTreeNode[]
  isLoadingKnowledgeTree: boolean
  onReloadKnowledgeTree: () => void
  selectedKnowledgePath: string | null
  onSelectKnowledgePath: (path: string) => void
  onCreateKnowledgePath: (scope: "ship" | "fleet") => void
  knowledgePathInput: string
  onKnowledgePathInputChange: (value: string) => void
  onKnowledgeSave: () => void
  isSavingKnowledge: boolean
  onKnowledgeDelete: () => void
  isDeletingKnowledge: boolean
  isLoadingKnowledgeNote: boolean
  knowledgeDraft: string
  onKnowledgeDraftChange: (value: string) => void
}

function scopeBadge(scopeType: KnowledgeCitation["scopeType"]): string {
  if (scopeType === "ship") return "Ship"
  if (scopeType === "fleet") return "Fleet"
  return "Global"
}

function KnowledgeTreeList(props: {
  nodes: KnowledgeTreeNode[]
  selectedPath: string | null
  onSelectPath: (path: string) => void
}) {
  const { nodes, selectedPath, onSelectPath } = props

  const renderNodes = (items: KnowledgeTreeNode[], depth: number) =>
    items.map((node) => {
      if (node.nodeType === "folder") {
        return (
          <div key={node.id}>
            <p className="truncate px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400" style={{ paddingLeft: `${depth * 12 + 8}px` }}>
              {node.name}
            </p>
            {node.children?.length ? renderNodes(node.children, depth + 1) : null}
          </div>
        )
      }

      const selected = selectedPath === node.path
      return (
        <button
          key={node.id}
          type="button"
          onClick={() => onSelectPath(node.path)}
          className={`block w-full truncate rounded-md px-2 py-1.5 text-left text-xs ${
            selected
              ? "bg-cyan-500/15 text-cyan-800 dark:text-cyan-100"
              : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/[0.08]"
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {node.name}
        </button>
      )
    })

  return <div className="space-y-0.5">{renderNodes(nodes, 0)}</div>
}

export function QuartermasterKnowledgePane(props: QuartermasterKnowledgePaneProps) {
  const {
    compact,
    shipDeploymentId,
    knowledgeScope,
    knowledgeMode,
    knowledgeBackend,
    knowledgeQuery,
    onKnowledgeScopeChange,
    onKnowledgeModeChange,
    onKnowledgeBackendChange,
    onKnowledgeQueryChange,
    onKnowledgeSearch,
    isSearchingKnowledge,
    onKnowledgeResync,
    isResyncingKnowledge,
    syncSummaryText,
    knowledgeResults,
    knowledgeTree,
    isLoadingKnowledgeTree,
    onReloadKnowledgeTree,
    selectedKnowledgePath,
    onSelectKnowledgePath,
    onCreateKnowledgePath,
    knowledgePathInput,
    onKnowledgePathInputChange,
    onKnowledgeSave,
    isSavingKnowledge,
    onKnowledgeDelete,
    isDeletingKnowledge,
    isLoadingKnowledgeNote,
    knowledgeDraft,
    onKnowledgeDraftChange,
  } = props

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-300/70 bg-white/80 p-3 dark:border-white/12 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={knowledgeScope}
            onChange={(event) => onKnowledgeScopeChange(event.target.value as KnowledgeScope)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-100"
          >
            <option value="ship">Ship</option>
            <option value="fleet">Fleet</option>
            <option value="all">All</option>
          </select>
          <select
            value={knowledgeMode}
            onChange={(event) => onKnowledgeModeChange(event.target.value as KnowledgeMode)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-100"
          >
            <option value="hybrid">Hybrid</option>
            <option value="lexical">Lexical</option>
          </select>
          <select
            value={knowledgeBackend}
            onChange={(event) => {
              const next = event.target.value
              if (next === "vault-local" || next === "data-core-merged") {
                onKnowledgeBackendChange(next)
                return
              }
              onKnowledgeBackendChange("auto")
            }}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-100"
          >
            <option value="auto">Backend: Auto</option>
            <option value="vault-local">Backend: Vault Local</option>
            <option value="data-core-merged">Backend: Data Core Merged</option>
          </select>
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={knowledgeQuery}
              onChange={(event) => onKnowledgeQueryChange(event.target.value)}
              placeholder="Search ship/fleet knowledge..."
              className="w-full rounded-md border border-slate-300 bg-white py-1 pl-7 pr-2 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-100"
            />
          </div>
          <button
            type="button"
            onClick={onKnowledgeSearch}
            disabled={isSearchingKnowledge || !knowledgeQuery.trim()}
            className="inline-flex items-center gap-1 rounded-md border border-cyan-500/45 bg-cyan-500/12 px-2 py-1 text-xs font-medium text-cyan-700 disabled:opacity-50 dark:border-cyan-300/45 dark:text-cyan-200"
          >
            {isSearchingKnowledge && <Loader2 className="h-3 w-3 animate-spin" />}
            Search
          </button>
          <button
            type="button"
            onClick={() => onKnowledgeResync(knowledgeScope)}
            disabled={isResyncingKnowledge}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 disabled:opacity-50 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200"
          >
            {isResyncingKnowledge ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Resync
          </button>
        </div>
        <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">{syncSummaryText}</p>
      </div>

      {compact ? (
        <div className="space-y-2 rounded-lg border border-slate-300/70 bg-white/80 p-3 dark:border-white/12 dark:bg-white/[0.03]">
          {knowledgeResults.length === 0 ? (
            <p className="text-xs text-slate-600 dark:text-slate-300">No knowledge results yet.</p>
          ) : (
            knowledgeResults.map((result) => (
              <button
                key={`${result.id}:${result.path}`}
                type="button"
                onClick={() => onSelectKnowledgePath(result.path)}
                className="w-full rounded-md border border-slate-200/80 bg-white/80 px-2 py-1.5 text-left text-xs dark:border-white/10 dark:bg-white/[0.03]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-slate-800 dark:text-slate-100">{result.path}</span>
                  <span className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] text-slate-500 dark:border-white/15 dark:text-slate-400">
                    {scopeBadge(result.scopeType)}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] text-slate-600 dark:text-slate-300">{result.excerpt}</p>
              </button>
            ))
          )}
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-300/70 bg-white/80 p-2.5 dark:border-white/12 dark:bg-white/[0.03]">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Knowledge Tree</p>
                <button
                  type="button"
                  onClick={onReloadKnowledgeTree}
                  disabled={isLoadingKnowledgeTree}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-600 dark:border-white/15 dark:text-slate-300"
                >
                  {isLoadingKnowledgeTree ? <Loader2 className="h-3 w-3 animate-spin" /> : <BookOpen className="h-3 w-3" />}
                  Reload
                </button>
              </div>

              <div className="max-h-48 overflow-auto">
                {knowledgeTree.length === 0 ? (
                  <p className="px-1 py-2 text-xs text-slate-500 dark:text-slate-400">No ship/fleet KB notes yet.</p>
                ) : (
                  <KnowledgeTreeList
                    nodes={knowledgeTree}
                    selectedPath={selectedKnowledgePath}
                    onSelectPath={onSelectKnowledgePath}
                  />
                )}
              </div>

              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onCreateKnowledgePath("ship")}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-[11px] text-slate-700 dark:border-white/15 dark:text-slate-300"
                >
                  <FilePlus2 className="h-3 w-3" />
                  Ship Note
                </button>
                <button
                  type="button"
                  onClick={() => onCreateKnowledgePath("fleet")}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-[11px] text-slate-700 dark:border-white/15 dark:text-slate-300"
                >
                  <FilePlus2 className="h-3 w-3" />
                  Fleet Note
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-slate-300/70 bg-white/80 p-2.5 dark:border-white/12 dark:bg-white/[0.03]">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Query Results ({knowledgeResults.length})
              </p>
              <div className="mt-2 max-h-52 space-y-1.5 overflow-auto">
                {knowledgeResults.length === 0 ? (
                  <p className="px-1 py-2 text-xs text-slate-500 dark:text-slate-400">No results.</p>
                ) : (
                  knowledgeResults.map((result) => (
                    <button
                      key={`${result.id}:${result.path}`}
                      type="button"
                      onClick={() => onSelectKnowledgePath(result.path)}
                      className="w-full rounded-md border border-slate-200/80 bg-white/80 px-2 py-1.5 text-left text-xs hover:border-cyan-500/40 dark:border-white/10 dark:bg-white/[0.03]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium text-slate-800 dark:text-slate-100">{result.path}</span>
                        <span className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] text-slate-500 dark:border-white/15 dark:text-slate-400">
                          {scopeBadge(result.scopeType)} · {result.score.toFixed(2)}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] text-slate-600 dark:text-slate-300">{result.excerpt}</p>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-300/70 bg-white/80 p-3 dark:border-white/12 dark:bg-white/[0.03]">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={knowledgePathInput}
                onChange={(event) => onKnowledgePathInputChange(event.target.value)}
                placeholder={`kb/ships/${shipDeploymentId}/topic.md`}
                className="min-w-[220px] flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-100"
              />
              <button
                type="button"
                onClick={onKnowledgeSave}
                disabled={isSavingKnowledge || !knowledgePathInput.trim()}
                className="inline-flex items-center gap-1 rounded-md border border-cyan-500/45 bg-cyan-500/12 px-2 py-1 text-xs font-medium text-cyan-700 disabled:opacity-50 dark:border-cyan-300/45 dark:text-cyan-200"
              >
                {isSavingKnowledge ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Save
              </button>
              <button
                type="button"
                onClick={onKnowledgeDelete}
                disabled={isDeletingKnowledge || !knowledgePathInput.trim()}
                className="inline-flex items-center gap-1 rounded-md border border-rose-500/45 bg-rose-500/10 px-2 py-1 text-xs text-rose-700 disabled:opacity-50 dark:text-rose-200"
              >
                {isDeletingKnowledge ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                Delete
              </button>
            </div>

            <div className="mt-2 min-h-[280px]">
              {isLoadingKnowledgeNote ? (
                <div className="inline-flex items-center gap-2 text-xs text-slate-500 dark:text-slate-300">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading note...
                </div>
              ) : (
                <textarea
                  value={knowledgeDraft}
                  onChange={(event) => onKnowledgeDraftChange(event.target.value)}
                  placeholder="Ship/Fleet knowledge markdown..."
                  className="h-[360px] w-full rounded-md border border-slate-300 bg-white p-2 font-mono text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-100"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
