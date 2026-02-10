"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Filter, Loader2, RefreshCw } from "lucide-react"
import { MarkerType, type Edge, type Node } from "reactflow"
import { FlowCanvas } from "@/components/flow/FlowCanvas"
import { InlineNotice, SurfaceCard } from "@/components/dashboard/PageLayout"
import type { VaultGraphNode, VaultGraphResponse, VaultId } from "@/lib/vault/types"

const VAULT_IDS: VaultId[] = ["orchwiz", "ship", "agent-public", "agent-private", "joined"]

function isVaultId(value: string): value is VaultId {
  return VAULT_IDS.includes(value as VaultId)
}

function encodeExplorerUrl(pathname: string, vaultId: VaultId, notePath: string): string {
  const params = new URLSearchParams()
  params.set("tab", "explorer")
  params.set("vault", vaultId)
  params.set("note", notePath)
  return `${pathname}?${params.toString()}`
}

export function VaultGraphView() {
  const router = useRouter()
  const pathname = usePathname()

  const [selectedVault, setSelectedVault] = useState<VaultId>("joined")
  const [focusPath, setFocusPath] = useState("")
  const [depth, setDepth] = useState(2)
  const [includeUnresolved, setIncludeUnresolved] = useState(true)
  const [includeTrash, setIncludeTrash] = useState(false)
  const [queryInput, setQueryInput] = useState("")
  const [query, setQuery] = useState("")
  const [graph, setGraph] = useState<VaultGraphResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(queryInput.trim())
    }, 250)
    return () => window.clearTimeout(timer)
  }, [queryInput])

  const loadGraph = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set("vault", selectedVault)
      params.set("depth", String(depth))
      params.set("includeUnresolved", includeUnresolved ? "true" : "false")
      params.set("includeTrash", includeTrash ? "true" : "false")
      if (focusPath.trim()) {
        params.set("focusPath", focusPath.trim())
      }
      if (query) {
        params.set("q", query)
      }

      const response = await fetch(`/api/vaults/graph?${params.toString()}`)
      const payload = await response.json()
      if (!response.ok) {
        setError(payload?.error || "Unable to load graph.")
        setGraph(null)
        return
      }

      setGraph(payload as VaultGraphResponse)
    } catch (fetchError) {
      console.error("Error loading vault graph:", fetchError)
      setError("Unable to load graph.")
      setGraph(null)
    } finally {
      setIsLoading(false)
    }
  }, [depth, focusPath, includeTrash, includeUnresolved, query, selectedVault])

  useEffect(() => {
    loadGraph()
  }, [loadGraph])

  const graphNodes = useMemo<Node[]>(() => {
    if (!graph) return []

    const noteNodes = graph.nodes.filter((node) => node.nodeType === "note")
    const ghostNodes = graph.nodes.filter((node) => node.nodeType === "ghost")

    const notesPerRow = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, noteNodes.length))))

    const mappedNotes: Node[] = noteNodes.map((node, index) => {
      const column = index % notesPerRow
      const row = Math.floor(index / notesPerRow)
      return {
        id: node.id,
        position: {
          x: column * 260,
          y: row * 140,
        },
        data: {
          label: (
            <div className="max-w-[180px]">
              <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{node.label}</p>
              <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">{node.path}</p>
            </div>
          ),
          nodeType: node.nodeType,
          path: node.path,
          originVaultId: node.originVaultId,
        },
        style: {
          border: "1px solid rgba(6, 182, 212, 0.4)",
          borderRadius: 10,
          background: "rgba(255,255,255,0.9)",
          color: "#0f172a",
          minWidth: 200,
          padding: 8,
        },
      }
    })

    const ghostColumnStart = notesPerRow * 260 + 220
    const mappedGhosts: Node[] = ghostNodes.map((node, index) => {
      const row = index
      return {
        id: node.id,
        position: {
          x: ghostColumnStart,
          y: row * 110,
        },
        data: {
          label: (
            <div className="max-w-[200px]">
              <p className="truncate text-xs font-semibold text-amber-800 dark:text-amber-200">{node.label}</p>
              <p className="truncate text-[10px] text-amber-700/80 dark:text-amber-200/80">
                {node.unresolvedTarget || node.path}
              </p>
            </div>
          ),
          nodeType: node.nodeType,
          path: node.path,
          unresolvedTarget: node.unresolvedTarget,
        },
        style: {
          border: "1px dashed rgba(245, 158, 11, 0.7)",
          borderRadius: 10,
          background: "rgba(255,251,235,0.9)",
          color: "#78350f",
          minWidth: 220,
          padding: 8,
          opacity: 0.95,
        },
      }
    })

    return [...mappedNotes, ...mappedGhosts]
  }, [graph])

  const graphEdges = useMemo<Edge[]>(() => {
    if (!graph) return []

    return graph.edges.map((edge) => {
      const isUnresolved = edge.edgeType === "unresolved"
      const color = isUnresolved ? "rgba(245, 158, 11, 0.7)" : "rgba(14, 165, 233, 0.6)"
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "smoothstep",
        animated: !isUnresolved,
        style: {
          stroke: color,
          strokeWidth: isUnresolved ? 1.8 : 2,
          strokeDasharray: isUnresolved ? "6 4" : undefined,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color,
        },
      }
    })
  }, [graph])

  const nodeById = useMemo(() => {
    const map = new Map<string, VaultGraphNode>()
    if (!graph) return map
    for (const node of graph.nodes) {
      map.set(node.id, node)
    }
    return map
  }, [graph])

  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) || null : null

  const handleNodeClick = (_event: unknown, node: Node) => {
    const graphNode = nodeById.get(node.id)
    if (!graphNode) return

    if (graphNode.nodeType === "note") {
      const nextUrl = encodeExplorerUrl(pathname, selectedVault, graphNode.path)
      router.replace(nextUrl, { scroll: false })
      return
    }

    setSelectedNodeId(graphNode.id)
  }

  return (
    <div className="space-y-4">
      {error ? <InlineNotice variant="error">{error}</InlineNotice> : null}

      <SurfaceCard>
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[170px] text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Vault</span>
            <select
              value={selectedVault}
              onChange={(event) => {
                const next = event.target.value
                if (!isVaultId(next)) return
                setSelectedVault(next)
                setSelectedNodeId(null)
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-white/[0.05]"
            >
              <option value="joined">Joined Vault</option>
              <option value="orchwiz">OrchWiz Vault</option>
              <option value="ship">Ship Vault</option>
              <option value="agent-public">Agent Vault Public</option>
              <option value="agent-private">Agent Vault Private</option>
            </select>
          </label>

          <label className="min-w-[250px] flex-1 text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Focus Note</span>
            <input
              type="text"
              value={focusPath}
              onChange={(event) => setFocusPath(event.target.value)}
              placeholder="Optional: orchwiz/01-Project-Overview/Architecture.md"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-white/[0.05]"
            />
          </label>

          <label className="w-[96px] text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Depth</span>
            <select
              value={depth}
              onChange={(event) => setDepth(Number(event.target.value) || 2)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-white/15 dark:bg-white/[0.05]"
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
            </select>
          </label>

          <label className="min-w-[220px] flex-1 text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Filter</span>
            <div className="relative">
              <Filter className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                placeholder="Filter by path/title"
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-3 text-sm dark:border-white/15 dark:bg-white/[0.05]"
              />
            </div>
          </label>

          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-white/[0.05]">
            <input
              type="checkbox"
              checked={includeUnresolved}
              onChange={(event) => setIncludeUnresolved(event.target.checked)}
            />
            Unresolved
          </label>

          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-white/[0.05]">
            <input
              type="checkbox"
              checked={includeTrash}
              onChange={(event) => setIncludeTrash(event.target.checked)}
            />
            Include Trash
          </label>

          <button
            type="button"
            onClick={loadGraph}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-black dark:bg-white dark:text-slate-900"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </SurfaceCard>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <SurfaceCard className="relative min-h-[68vh] overflow-hidden">
          {isLoading ? (
            <div className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading graph...
            </div>
          ) : null}

          {!isLoading && graph ? (
            <>
              <div className="mb-3 flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-300">
                <span className="rounded border border-slate-300 bg-white/70 px-2 py-1 dark:border-white/15 dark:bg-white/[0.03]">
                  Notes: {graph.stats.noteCount}
                </span>
                <span className="rounded border border-slate-300 bg-white/70 px-2 py-1 dark:border-white/15 dark:bg-white/[0.03]">
                  Ghosts: {graph.stats.ghostCount}
                </span>
                <span className="rounded border border-slate-300 bg-white/70 px-2 py-1 dark:border-white/15 dark:bg-white/[0.03]">
                  Edges: {graph.stats.edgeCount}
                </span>
                {graph.stats.truncated ? (
                  <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-800 dark:text-amber-200">
                    Graph truncated by safety limits
                  </span>
                ) : null}
              </div>

              <FlowCanvas
                nodes={graphNodes}
                edges={graphEdges}
                onNodeClick={handleNodeClick}
                nodesDraggable={false}
                nodesConnectable={false}
                showMiniMap
                className="h-[60vh]"
              />
            </>
          ) : null}

          {!isLoading && graph && graph.nodes.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No graph nodes available for this filter.</p>
          ) : null}
        </SurfaceCard>

        <div className="hidden lg:block">
          <SurfaceCard className="h-[68vh] overflow-auto">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Node Detail</p>
            {selectedNode ? (
              <div className="mt-3 space-y-2 text-sm">
                <p className="font-semibold text-slate-800 dark:text-slate-100">{selectedNode.label}</p>
                <p className="break-all text-slate-600 dark:text-slate-300">{selectedNode.path}</p>
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Type: {selectedNode.nodeType}
                </p>
                {selectedNode.unresolvedTarget ? (
                  <p className="text-xs text-amber-700 dark:text-amber-200">Unresolved target: {selectedNode.unresolvedTarget}</p>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Select a ghost node to inspect unresolved details.</p>
            )}
          </SurfaceCard>
        </div>
      </div>

      {selectedNode ? (
        <div className="lg:hidden">
          <SurfaceCard>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Node Detail</p>
            <div className="mt-2 space-y-1 text-sm">
              <p className="font-semibold text-slate-800 dark:text-slate-100">{selectedNode.label}</p>
              <p className="break-all text-slate-600 dark:text-slate-300">{selectedNode.path}</p>
              {selectedNode.unresolvedTarget ? (
                <p className="text-xs text-amber-700 dark:text-amber-200">Unresolved target: {selectedNode.unresolvedTarget}</p>
              ) : null}
            </div>
          </SurfaceCard>
        </div>
      ) : null}
    </div>
  )
}
