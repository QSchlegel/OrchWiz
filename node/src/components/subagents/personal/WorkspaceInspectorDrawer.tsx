"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronDown, ChevronRight, FileText, Folder, RefreshCw } from "lucide-react"
import { SlideOverPanel } from "@/components/dashboard/SlideOverPanel"
import type {
  WorkspaceInspectorEntry,
  WorkspaceInspectorFileResponse,
  WorkspaceInspectorTreeResponse,
} from "./types"

interface WorkspaceNode extends WorkspaceInspectorEntry {
  expanded: boolean
  loaded: boolean
  loading: boolean
  children: WorkspaceNode[]
}

interface WorkspaceInspectorDrawerProps {
  open: boolean
  subagentId: string | null
  onClose: () => void
}

function toNode(entry: WorkspaceInspectorEntry): WorkspaceNode {
  return {
    ...entry,
    expanded: false,
    loaded: false,
    loading: false,
    children: [],
  }
}

function updateNodeByPath(
  nodes: WorkspaceNode[],
  nodePath: string,
  updater: (node: WorkspaceNode) => WorkspaceNode,
): WorkspaceNode[] {
  return nodes.map((node) => {
    if (node.path === nodePath) {
      return updater(node)
    }
    if (node.children.length === 0) {
      return node
    }
    return {
      ...node,
      children: updateNodeByPath(node.children, nodePath, updater),
    }
  })
}

function findNodeByPath(nodes: WorkspaceNode[], nodePath: string): WorkspaceNode | null {
  for (const node of nodes) {
    if (node.path === nodePath) {
      return node
    }
    if (node.children.length > 0) {
      const nested = findNodeByPath(node.children, nodePath)
      if (nested) {
        return nested
      }
    }
  }
  return null
}

function parentPath(path: string): string {
  const normalized = path.trim()
  if (!normalized) {
    return ""
  }

  const slashIndex = normalized.lastIndexOf("/")
  if (slashIndex === -1) {
    return ""
  }

  return normalized.slice(0, slashIndex)
}

function formatBytes(value: number | null): string {
  if (!Number.isFinite(value || 0) || value === null) {
    return "-"
  }

  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function formatMtime(value: string | null): string {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString()
}

export function WorkspaceInspectorDrawer({
  open,
  subagentId,
  onClose,
}: WorkspaceInspectorDrawerProps) {
  const [rootPath, setRootPath] = useState<string>("")
  const [rootExists, setRootExists] = useState<boolean>(true)
  const [rootTruncated, setRootTruncated] = useState<boolean>(false)
  const [treeNodes, setTreeNodes] = useState<WorkspaceNode[]>([])
  const [loadingRoot, setLoadingRoot] = useState<boolean>(false)
  const [focusedFolderPath, setFocusedFolderPath] = useState<string>("")
  const [truncatedFolders, setTruncatedFolders] = useState<Set<string>>(new Set())
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)
  const [filePreview, setFilePreview] = useState<WorkspaceInspectorFileResponse | null>(null)
  const [loadingFile, setLoadingFile] = useState<boolean>(false)
  const [message, setMessage] = useState<string | null>(null)

  const truncatedFocusedFolder = useMemo(
    () => truncatedFolders.has(focusedFolderPath),
    [focusedFolderPath, truncatedFolders],
  )

  const fetchTree = useCallback(async (path: string): Promise<WorkspaceInspectorTreeResponse> => {
    if (!subagentId) {
      throw new Error("No subagent selected.")
    }

    const params = new URLSearchParams()
    if (path) {
      params.set("path", path)
    }
    const query = params.toString()
    const response = await fetch(`/api/subagents/${subagentId}/workspace-tree${query ? `?${query}` : ""}`)
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(typeof payload?.error === "string" ? payload.error : "Unable to load workspace tree.")
    }

    return payload as WorkspaceInspectorTreeResponse
  }, [subagentId])

  const fetchFile = useCallback(async (path: string): Promise<WorkspaceInspectorFileResponse> => {
    if (!subagentId) {
      throw new Error("No subagent selected.")
    }

    const params = new URLSearchParams({ path })
    const response = await fetch(`/api/subagents/${subagentId}/workspace-file?${params.toString()}`)
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(typeof payload?.error === "string" ? payload.error : "Unable to load workspace file.")
    }

    return payload as WorkspaceInspectorFileResponse
  }, [subagentId])

  const loadRoot = useCallback(async () => {
    if (!subagentId) return

    setLoadingRoot(true)
    try {
      const payload = await fetchTree("")
      setRootPath(payload.rootPath || "")
      setRootExists(Boolean(payload.exists))
      setRootTruncated(Boolean(payload.truncated))
      setTreeNodes(Array.isArray(payload.entries) ? payload.entries.map(toNode) : [])
      setFocusedFolderPath("")
      setTruncatedFolders((current) => {
        const next = new Set(current)
        if (payload.truncated) {
          next.add("")
        } else {
          next.delete("")
        }
        return next
      })
    } catch (error) {
      console.error("Failed to load workspace root tree:", error)
      setMessage((error as Error).message || "Unable to load workspace.")
    } finally {
      setLoadingRoot(false)
    }
  }, [fetchTree, subagentId])

  const loadFolderChildren = useCallback(async (folderPath: string) => {
    if (!subagentId) return

    setTreeNodes((current) =>
      updateNodeByPath(current, folderPath, (node) => ({
        ...node,
        loading: true,
      })),
    )

    try {
      const payload = await fetchTree(folderPath)
      setRootPath(payload.rootPath || "")
      setTreeNodes((current) =>
        updateNodeByPath(current, folderPath, (node) => ({
          ...node,
          expanded: true,
          loaded: true,
          loading: false,
          children: Array.isArray(payload.entries) ? payload.entries.map(toNode) : [],
        })),
      )
      setTruncatedFolders((current) => {
        const next = new Set(current)
        if (payload.truncated) {
          next.add(folderPath)
        } else {
          next.delete(folderPath)
        }
        return next
      })
    } catch (error) {
      console.error("Failed to load workspace folder:", error)
      setTreeNodes((current) =>
        updateNodeByPath(current, folderPath, (node) => ({
          ...node,
          loading: false,
        })),
      )
      setMessage((error as Error).message || "Unable to load folder.")
    }
  }, [fetchTree, subagentId])

  const refreshFocusedFolder = useCallback(async () => {
    if (!subagentId) return

    if (!focusedFolderPath) {
      await loadRoot()
      return
    }

    await loadFolderChildren(focusedFolderPath)
  }, [focusedFolderPath, loadFolderChildren, loadRoot, subagentId])

  const handleToggleFolder = useCallback((folderPath: string) => {
    setFocusedFolderPath(folderPath)
    const target = findNodeByPath(treeNodes, folderPath)
    if (!target) return

    if (target.expanded) {
      setTreeNodes((current) =>
        updateNodeByPath(current, folderPath, (node) => ({
          ...node,
          expanded: false,
        })),
      )
      return
    }

    if (target.loaded) {
      setTreeNodes((current) =>
        updateNodeByPath(current, folderPath, (node) => ({
          ...node,
          expanded: true,
        })),
      )
      return
    }

    void loadFolderChildren(folderPath)
  }, [loadFolderChildren, treeNodes])

  const handleSelectFile = useCallback(async (path: string) => {
    setSelectedFilePath(path)
    setLoadingFile(true)
    setFilePreview(null)
    setMessage(null)

    try {
      const payload = await fetchFile(path)
      setRootPath(payload.rootPath || "")
      setFilePreview(payload)
    } catch (error) {
      console.error("Failed to load workspace file preview:", error)
      setMessage((error as Error).message || "Unable to load file preview.")
    } finally {
      setLoadingFile(false)
    }
  }, [fetchFile])

  useEffect(() => {
    if (!open || !subagentId) {
      return
    }

    setMessage(null)
    setRootPath("")
    setRootExists(true)
    setRootTruncated(false)
    setTreeNodes([])
    setFocusedFolderPath("")
    setTruncatedFolders(new Set())
    setSelectedFilePath(null)
    setFilePreview(null)
    void loadRoot()
  }, [loadRoot, open, subagentId])

  const renderTreeNodes = (nodes: WorkspaceNode[], depth = 0): React.ReactNode =>
    nodes.map((node) => {
      const leftPadding = `${depth * 14 + 8}px`
      if (node.nodeType === "folder") {
        const isFocused = focusedFolderPath === node.path
        return (
          <div key={node.path} className="space-y-0.5">
            <button
              type="button"
              onClick={() => handleToggleFolder(node.path)}
              className={`flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-xs ${
                isFocused
                  ? "bg-cyan-500/15 text-cyan-800 dark:text-cyan-100"
                  : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/[0.08]"
              }`}
              style={{ paddingLeft: leftPadding }}
            >
              {node.expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <Folder className="h-3.5 w-3.5 text-amber-500" />
              <span className="truncate">{node.name}</span>
            </button>
            {node.loading ? (
              <p className="px-2 py-1 text-[11px] text-slate-500 dark:text-slate-400" style={{ paddingLeft: `${depth * 14 + 28}px` }}>
                Loading...
              </p>
            ) : null}
            {node.expanded && node.children.length > 0 ? renderTreeNodes(node.children, depth + 1) : null}
            {node.expanded && node.loaded && node.children.length === 0 ? (
              <p className="px-2 py-1 text-[11px] text-slate-500 dark:text-slate-400" style={{ paddingLeft: `${depth * 14 + 28}px` }}>
                Empty
              </p>
            ) : null}
          </div>
        )
      }

      const isSelected = selectedFilePath === node.path
      return (
        <button
          key={node.path}
          type="button"
          onClick={() => void handleSelectFile(node.path)}
          className={`flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-xs ${
            isSelected
              ? "bg-cyan-500/15 text-cyan-800 dark:text-cyan-100"
              : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/[0.08]"
          }`}
          style={{ paddingLeft: leftPadding }}
        >
          <FileText className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
          <span className="truncate">{node.name}</span>
        </button>
      )
    })

  return (
    <SlideOverPanel
      open={open}
      onClose={onClose}
      title="Working Directory Inspector"
      description="Read-only tree and file preview for this agent working directory."
      maxWidthClassName="sm:max-w-6xl"
    >
      <div className="space-y-3">
        <div className="rounded-lg border border-slate-200/80 bg-slate-50/70 p-3 text-xs text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">
          <p>
            Root: <span className="break-all font-mono text-[11px]">{rootPath || "(loading...)"}</span>
          </p>
          {!rootExists ? (
            <p className="mt-1 text-amber-700 dark:text-amber-300">
              Working directory is unavailable on disk.
            </p>
          ) : null}
          {rootTruncated || truncatedFocusedFolder ? (
            <p className="mt-1 text-amber-700 dark:text-amber-300">
              Directory listing truncated. Narrow the folder scope for full visibility.
            </p>
          ) : null}
        </div>

        {message ? (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-800 dark:text-rose-200">
            {message}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(280px,0.95fr)_minmax(0,1.3fr)]">
          <div className="space-y-2 rounded-lg border border-slate-200/80 bg-white/80 p-2.5 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tree</p>
              <div className="flex w-full items-center gap-1 sm:w-auto">
                <button
                  type="button"
                  onClick={() => setFocusedFolderPath(parentPath(focusedFolderPath))}
                  disabled={!focusedFolderPath}
                  className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100 disabled:opacity-50 sm:flex-none dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/[0.08]"
                >
                  Up
                </button>
                <button
                  type="button"
                  onClick={() => void refreshFocusedFolder()}
                  disabled={loadingRoot || !subagentId}
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100 disabled:opacity-50 sm:flex-none dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/[0.08]"
                >
                  <RefreshCw className="h-3 w-3" />
                  Reload
                </button>
              </div>
            </div>

            <p className="break-all rounded-md border border-slate-200/80 bg-slate-50/80 px-2 py-1 font-mono text-[11px] text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
              {focusedFolderPath || "."}
            </p>

            <div className="max-h-[42vh] overflow-auto rounded-md border border-slate-200/80 bg-white/70 p-1.5 sm:max-h-[58vh] dark:border-white/10 dark:bg-white/[0.02]">
              {loadingRoot ? (
                <p className="px-2 py-2 text-xs text-slate-500 dark:text-slate-400">Loading...</p>
              ) : !rootExists ? (
                <p className="px-2 py-2 text-xs text-slate-500 dark:text-slate-400">Directory does not exist.</p>
              ) : treeNodes.length === 0 ? (
                <p className="px-2 py-2 text-xs text-slate-500 dark:text-slate-400">No files found.</p>
              ) : (
                renderTreeNodes(treeNodes)
              )}
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-slate-200/80 bg-white/80 p-2.5 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Preview</p>
              {filePreview?.exists ? (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {formatBytes(filePreview.size)} · {formatMtime(filePreview.mtime)}
                </p>
              ) : null}
            </div>

            <p className="break-all rounded-md border border-slate-200/80 bg-slate-50/80 px-2 py-1 font-mono text-[11px] text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
              {selectedFilePath || "Select a file"}
            </p>

            <div className="max-h-[42vh] overflow-auto rounded-md border border-slate-200/80 bg-white/70 p-2 sm:max-h-[58vh] dark:border-white/10 dark:bg-white/[0.02]">
              {loadingFile ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">Loading file preview...</p>
              ) : !selectedFilePath ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">Choose a file from the tree to preview.</p>
              ) : filePreview && !filePreview.exists ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">File no longer exists.</p>
              ) : filePreview?.isBinary ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">Binary file detected. Text preview is unavailable.</p>
              ) : filePreview ? (
                <div className="space-y-2">
                  {filePreview.truncated ? (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Preview truncated due to size limit.
                    </p>
                  ) : null}
                  <pre className="whitespace-pre-wrap break-words font-mono text-xs text-slate-800 dark:text-slate-200">
                    {filePreview.content}
                  </pre>
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">No preview available.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </SlideOverPanel>
  )
}
