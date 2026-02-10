"use client"

import { useEffect, useState } from "react"
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen, Pencil, Plus, Trash2 } from "lucide-react"
import type { VaultTreeNode } from "@/lib/vault/types"

interface VaultTreeProps {
  nodes: VaultTreeNode[]
  selectedPath: string | null
  onSelectFile: (path: string) => void
  onRequestRenameFile?: (path: string) => void
  onRequestDeleteFile?: (path: string) => void
  onRequestNewNoteInFolder?: (folderPath: string) => void
}

export function VaultTree({
  nodes,
  selectedPath,
  onSelectFile,
  onRequestRenameFile,
  onRequestDeleteFile,
  onRequestNewNoteInFolder,
}: VaultTreeProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())

  useEffect(() => {
    const nextExpanded = new Set<string>()
    for (const node of nodes) {
      if (node.nodeType === "folder") {
        nextExpanded.add(node.path)
      }
    }
    setExpandedPaths(nextExpanded)
  }, [nodes])

  const toggleFolder = (path: string) => {
    setExpandedPaths((previous) => {
      const next = new Set(previous)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const renderNode = (node: VaultTreeNode, depth: number): React.ReactNode => {
    const isFolder = node.nodeType === "folder"
    const isExpanded = isFolder && expandedPaths.has(node.path)
    const isSelected = !isFolder && selectedPath === node.path

    const indentation = {
      paddingLeft: `${depth * 12 + 8}px`,
    }

    if (isFolder) {
      return (
        <div key={node.id} className="group">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => toggleFolder(node.path)}
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/[0.08]"
              style={indentation}
            >
              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              {isExpanded ? <FolderOpen className="h-3.5 w-3.5 text-amber-500" /> : <Folder className="h-3.5 w-3.5 text-amber-500" />}
              <span className="truncate">{node.name}</span>
            </button>
            {onRequestNewNoteInFolder ? (
              <button
                type="button"
                onClick={() => onRequestNewNoteInFolder(node.path)}
                className="mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-white/[0.08] dark:hover:text-slate-200"
                aria-label={`Create note in ${node.path}`}
                title="New note in folder"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          {isExpanded ? node.children?.map((childNode) => renderNode(childNode, depth + 1)) : null}
        </div>
      )
    }

    return (
      <div key={node.id} className="group">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onSelectFile(node.path)}
            className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
              isSelected
                ? "bg-cyan-500/15 text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-100"
                : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.08]"
            }`}
            style={indentation}
          >
            <FileText className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
            <span className="truncate">{node.name}</span>
          </button>
          {(onRequestRenameFile || onRequestDeleteFile) ? (
            <div className="mr-1 flex items-center gap-0.5">
              {onRequestRenameFile ? (
                <button
                  type="button"
                  onClick={() => onRequestRenameFile(node.path)}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-white/[0.08] dark:hover:text-slate-200"
                  aria-label={`Rename ${node.path}`}
                  title="Rename / Move"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              ) : null}
              {onRequestDeleteFile ? (
                <button
                  type="button"
                  onClick={() => onRequestDeleteFile(node.path)}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-rose-500 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-300 dark:hover:bg-rose-500/15"
                  aria-label={`Delete ${node.path}`}
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      {nodes.length === 0 ? (
        <p className="px-2 py-2 text-sm text-slate-500 dark:text-slate-400">No markdown notes found.</p>
      ) : (
        nodes.map((node) => renderNode(node, 0))
      )}
    </div>
  )
}
