"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { BookOpen, FilePlus2, Loader2, PackagePlus, RefreshCw, Save, Search, ShieldCheck, Trash2, Wrench, X } from "lucide-react"
import { useNotifications } from "@/components/notifications"
import { QUARTERMASTER_TAB_NOTIFICATION_CHANNEL } from "@/lib/notifications/channels"
import { formatUnreadBadgeCount } from "@/lib/notifications/store"
import { useEventStream } from "@/lib/realtime/useEventStream"
import type { ShipToolsStateDto } from "@/lib/tools/types"

interface QuartermasterInteraction {
  id: string
  type: "user_input" | "ai_response" | "tool_use" | "error"
  content: string
  timestamp: string
  metadata?: Record<string, unknown>
}

interface QuartermasterStatePayload {
  ship: {
    id: string
    name: string
    status: string
    nodeId: string
    nodeType: string
    deploymentProfile: string
    healthStatus: string | null
    lastHealthCheck: string | null
    updatedAt: string
  }
  quartermaster: {
    enabled: boolean
    roleKey: string
    callsign: string
    authority: string
    runtimeProfile: string
    diagnosticsScope: string
    channel: string
    policySlug: string
    subagentId: string | null
    sessionId: string | null
    provisionedAt: string | null
  }
  subagent: {
    id: string
    name: string
    description: string | null
  } | null
  session: {
    id: string
    title: string | null
    status: string
    updatedAt: string
    createdAt: string
  } | null
  interactions: QuartermasterInteraction[]
}

interface ShipQuartermasterPanelProps {
  shipDeploymentId: string | null
  shipName?: string
  className?: string
  compact?: boolean
}

interface KnowledgeCitation {
  id: string
  path: string
  title: string
  excerpt: string
  scopeType: "ship" | "fleet" | "global"
  shipDeploymentId: string | null
  score: number
  lexicalScore: number
  semanticScore: number
}

interface KnowledgeTreeNode {
  id: string
  name: string
  path: string
  nodeType: "folder" | "file"
  children?: KnowledgeTreeNode[]
}

interface KnowledgeSyncSummary {
  runId: string
  status: "running" | "completed" | "failed"
  trigger: "auto" | "manual"
  scope: "ship" | "fleet" | "all"
  shipDeploymentId: string | null
  documentsScanned: number
  documentsUpserted: number
  documentsRemoved: number
  chunksUpserted: number
  error: string | null
}

type QuartermasterTab = "chat" | "knowledge"
type KnowledgeScope = "ship" | "fleet" | "all"
type KnowledgeMode = "hybrid" | "lexical"
type KnowledgeBackend = "auto" | "vault-local" | "data-core-merged"

function providerFromInteraction(interaction: QuartermasterInteraction | null): {
  provider: string | null
  fallbackUsed: boolean | null
} {
  if (!interaction?.metadata || typeof interaction.metadata !== "object") {
    return { provider: null, fallbackUsed: null }
  }

  const metadata = interaction.metadata as Record<string, unknown>
  const provider = typeof metadata.provider === "string" ? metadata.provider : null
  const fallbackUsed = typeof metadata.fallbackUsed === "boolean" ? metadata.fallbackUsed : null

  return { provider, fallbackUsed }
}

function interactionLabel(type: QuartermasterInteraction["type"]): string {
  if (type === "user_input") return "Operator"
  if (type === "ai_response") return "Quartermaster"
  if (type === "tool_use") return "Tool"
  return "Error"
}

function flattenKnowledgeFilePaths(nodes: KnowledgeTreeNode[]): string[] {
  const paths: string[] = []

  const walk = (items: KnowledgeTreeNode[]) => {
    for (const item of items) {
      if (item.nodeType === "file") {
        paths.push(item.path)
      } else if (item.children?.length) {
        walk(item.children)
      }
    }
  }

  walk(nodes)
  return paths
}

function formatSyncSummary(summary: KnowledgeSyncSummary | null): string {
  if (!summary) {
    return "No sync runs yet"
  }

  const status = summary.status.toUpperCase()
  return `${status} · ${summary.documentsUpserted} upserted · ${summary.documentsRemoved} removed`
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

export function ShipQuartermasterPanel({
  shipDeploymentId,
  shipName,
  className,
  compact = false,
}: ShipQuartermasterPanelProps) {
  const { getUnread, registerActiveChannels } = useNotifications()
  const [tab, setTab] = useState<QuartermasterTab>("chat")
  const [state, setState] = useState<QuartermasterStatePayload | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isProvisioning, setIsProvisioning] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [prompt, setPrompt] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const [isToolRequestModalOpen, setIsToolRequestModalOpen] = useState(false)
  const [isToolRequestOptionsLoading, setIsToolRequestOptionsLoading] = useState(false)
  const [isToolRequestSubmitting, setIsToolRequestSubmitting] = useState(false)
  const [toolRequestState, setToolRequestState] = useState<ShipToolsStateDto | null>(null)
  const [toolRequestCatalogEntryId, setToolRequestCatalogEntryId] = useState("")
  const [toolRequestBridgeCrewId, setToolRequestBridgeCrewId] = useState("")
  const [toolRequestScopePreference, setToolRequestScopePreference] = useState<"requester_only" | "ship">("requester_only")
  const [toolRequestRationale, setToolRequestRationale] = useState("")

  const [knowledgeScope, setKnowledgeScope] = useState<KnowledgeScope>("all")
  const [knowledgeMode, setKnowledgeMode] = useState<KnowledgeMode>("hybrid")
  const [knowledgeBackend, setKnowledgeBackend] = useState<KnowledgeBackend>("auto")
  const [knowledgeQuery, setKnowledgeQuery] = useState("")
  const [knowledgeResults, setKnowledgeResults] = useState<KnowledgeCitation[]>([])
  const [knowledgeTree, setKnowledgeTree] = useState<KnowledgeTreeNode[]>([])
  const [knowledgeLatestSync, setKnowledgeLatestSync] = useState<KnowledgeSyncSummary | null>(null)
  const [selectedKnowledgePath, setSelectedKnowledgePath] = useState<string | null>(null)
  const [knowledgePathInput, setKnowledgePathInput] = useState("")
  const [knowledgeDraft, setKnowledgeDraft] = useState("")

  const [isLoadingKnowledgeTree, setIsLoadingKnowledgeTree] = useState(false)
  const [isLoadingKnowledgeNote, setIsLoadingKnowledgeNote] = useState(false)
  const [isSearchingKnowledge, setIsSearchingKnowledge] = useState(false)
  const [isSavingKnowledge, setIsSavingKnowledge] = useState(false)
  const [isDeletingKnowledge, setIsDeletingKnowledge] = useState(false)
  const [isResyncingKnowledge, setIsResyncingKnowledge] = useState(false)

  const fetchState = useCallback(async () => {
    if (!shipDeploymentId) {
      setState(null)
      setError(null)
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch(`/api/ships/${shipDeploymentId}/quartermaster`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`)
      }

      setState(payload as QuartermasterStatePayload)
      setError(null)
    } catch (loadError) {
      console.error("Failed to load quartermaster state:", loadError)
      setState(null)
      setError(loadError instanceof Error ? loadError.message : "Failed to load quartermaster state")
    } finally {
      setIsLoading(false)
    }
  }, [shipDeploymentId])

  const loadKnowledgeTree = useCallback(async (scope: KnowledgeScope = "all") => {
    if (!shipDeploymentId) {
      setKnowledgeTree([])
      setKnowledgeLatestSync(null)
      return
    }

    setIsLoadingKnowledgeTree(true)
    try {
      const response = await fetch(`/api/ships/${shipDeploymentId}/knowledge/tree?scope=${encodeURIComponent(scope)}`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`)
      }

      const tree = Array.isArray(payload?.tree) ? (payload.tree as KnowledgeTreeNode[]) : []
      setKnowledgeTree(tree)
      setKnowledgeLatestSync(payload?.latestSync ? (payload.latestSync as KnowledgeSyncSummary) : null)

      const filePaths = flattenKnowledgeFilePaths(tree)
      setSelectedKnowledgePath((current) => {
        if (current && filePaths.includes(current)) {
          return current
        }
        return filePaths[0] || null
      })
    } catch (treeError) {
      console.error("Failed to load ship knowledge tree:", treeError)
      setKnowledgeTree([])
      setKnowledgeLatestSync(null)
      setSelectedKnowledgePath(null)
      setError(treeError instanceof Error ? treeError.message : "Failed to load ship knowledge tree")
    } finally {
      setIsLoadingKnowledgeTree(false)
    }
  }, [shipDeploymentId])

  const loadKnowledgeNote = useCallback(async (path: string) => {
    if (!path) {
      setKnowledgeDraft("")
      return
    }

    setIsLoadingKnowledgeNote(true)
    try {
      const params = new URLSearchParams({
        vault: "ship",
        path,
        mode: "full",
      })
      const response = await fetch(`/api/vaults/file?${params.toString()}`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`)
      }

      setKnowledgePathInput(path)
      setKnowledgeDraft(typeof payload?.content === "string" ? payload.content : "")
    } catch (noteError) {
      console.error("Failed to load ship knowledge note:", noteError)
      setKnowledgeDraft("")
      setError(noteError instanceof Error ? noteError.message : "Failed to load ship knowledge note")
    } finally {
      setIsLoadingKnowledgeNote(false)
    }
  }, [])

  const loadToolRequestOptions = useCallback(async () => {
    if (!shipDeploymentId) {
      setToolRequestState(null)
      return
    }

    setIsToolRequestOptionsLoading(true)
    try {
      const response = await fetch(`/api/ships/${shipDeploymentId}/tools`, {
        cache: "no-store",
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`)
      }

      const parsed = payload as ShipToolsStateDto
      setToolRequestState(parsed)
      setError(null)
    } catch (toolsError) {
      console.error("Failed to load ship tool options:", toolsError)
      setToolRequestState(null)
      setError(toolsError instanceof Error ? toolsError.message : "Failed to load ship tool options")
    } finally {
      setIsToolRequestOptionsLoading(false)
    }
  }, [shipDeploymentId])

  useEffect(() => {
    void fetchState()
  }, [fetchState])

  useEffect(() => {
    if (!shipDeploymentId) {
      setKnowledgeTree([])
      setKnowledgeResults([])
      setKnowledgeLatestSync(null)
      setSelectedKnowledgePath(null)
      setKnowledgePathInput("")
      setKnowledgeDraft("")
      setToolRequestState(null)
      setToolRequestCatalogEntryId("")
      setToolRequestBridgeCrewId("")
      setToolRequestRationale("")
      setToolRequestScopePreference("requester_only")
      setIsToolRequestModalOpen(false)
      return
    }

    void loadKnowledgeTree("all")
  }, [loadKnowledgeTree, shipDeploymentId])

  useEffect(() => {
    if (!selectedKnowledgePath) {
      return
    }
    void loadKnowledgeNote(selectedKnowledgePath)
  }, [loadKnowledgeNote, selectedKnowledgePath])

  useEventStream({
    enabled: Boolean(state?.session?.id),
    types: ["session.prompted"],
    onEvent: (event) => {
      const payload = event.payload as { sessionId?: string }
      if (payload?.sessionId && payload.sessionId === state?.session?.id) {
        void fetchState()
      }
    },
  })

  useEffect(() => {
    return registerActiveChannels([QUARTERMASTER_TAB_NOTIFICATION_CHANNEL[tab]])
  }, [registerActiveChannels, tab])

  const latestAiInteraction = useMemo(() => {
    if (!state) {
      return null
    }

    for (let i = state.interactions.length - 1; i >= 0; i -= 1) {
      if (state.interactions[i].type === "ai_response") {
        return state.interactions[i]
      }
    }

    return null
  }, [state])

  const providerState = providerFromInteraction(latestAiInteraction)

  const toolRequestableEntries = useMemo(() => {
    if (!toolRequestState) {
      return []
    }

    const grantedEntryIds = new Set(toolRequestState.grants.map((grant) => grant.catalogEntryId))
    return toolRequestState.catalog
      .filter((entry) => entry.isInstalled && !grantedEntryIds.has(entry.id))
      .sort((left, right) => left.slug.localeCompare(right.slug))
  }, [toolRequestState])

  useEffect(() => {
    if (!isToolRequestModalOpen) {
      return
    }

    if (toolRequestCatalogEntryId || toolRequestableEntries.length === 0) {
      return
    }

    setToolRequestCatalogEntryId(toolRequestableEntries[0].id)
  }, [isToolRequestModalOpen, toolRequestCatalogEntryId, toolRequestableEntries])

  const openToolRequestModal = async () => {
    if (!shipDeploymentId) {
      return
    }

    setSuccessMessage(null)
    setIsToolRequestModalOpen(true)
    await loadToolRequestOptions()
  }

  const closeToolRequestModal = () => {
    setIsToolRequestModalOpen(false)
  }

  const submitToolRequest = async () => {
    if (!shipDeploymentId || !toolRequestCatalogEntryId || isToolRequestSubmitting) {
      return
    }

    setIsToolRequestSubmitting(true)
    try {
      const response = await fetch(`/api/ships/${shipDeploymentId}/tools/requests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          catalogEntryId: toolRequestCatalogEntryId,
          requesterBridgeCrewId: toolRequestBridgeCrewId || null,
          scopePreference: toolRequestScopePreference,
          rationale: toolRequestRationale.trim() || null,
          metadata: {
            source: "ship_quartermaster_panel",
          },
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`)
      }

      setToolRequestRationale("")
      setToolRequestBridgeCrewId("")
      setToolRequestScopePreference("requester_only")
      setSuccessMessage("Tool request filed and queued for owner review.")
      setError(null)
      closeToolRequestModal()
    } catch (requestError) {
      console.error("Failed to submit tool access request:", requestError)
      setError(requestError instanceof Error ? requestError.message : "Failed to submit tool request")
    } finally {
      setIsToolRequestSubmitting(false)
    }
  }

  const handleProvision = async () => {
    if (!shipDeploymentId || isProvisioning) {
      return
    }

    setIsProvisioning(true)
    try {
      const response = await fetch(`/api/ships/${shipDeploymentId}/quartermaster/provision`, {
        method: "POST",
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`)
      }

      await fetchState()
      setError(null)
    } catch (provisionError) {
      console.error("Quartermaster provisioning failed:", provisionError)
      setError(provisionError instanceof Error ? provisionError.message : "Failed to enable Quartermaster")
    } finally {
      setIsProvisioning(false)
    }
  }

  const handleSend = async () => {
    if (!shipDeploymentId || !prompt.trim() || isSending) {
      return
    }

    setIsSending(true)
    try {
      const response = await fetch(`/api/ships/${shipDeploymentId}/quartermaster`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          backend: knowledgeBackend,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`)
      }

      setPrompt("")
      if (Array.isArray(payload?.interactions)) {
        setState((current) => {
          if (!current) return current
          return {
            ...current,
            interactions: payload.interactions as QuartermasterInteraction[],
          }
        })
      } else {
        await fetchState()
      }
      setError(null)
    } catch (sendError) {
      console.error("Quartermaster prompt failed:", sendError)
      setError(sendError instanceof Error ? sendError.message : "Failed to submit prompt")
    } finally {
      setIsSending(false)
    }
  }

  const handleKnowledgeSearch = async () => {
    if (!shipDeploymentId || !knowledgeQuery.trim() || isSearchingKnowledge) {
      return
    }

    setIsSearchingKnowledge(true)
    try {
      const params = new URLSearchParams({
        q: knowledgeQuery.trim(),
        scope: knowledgeScope,
        mode: knowledgeMode,
        backend: knowledgeBackend,
        k: compact ? "6" : "12",
      })
      const response = await fetch(`/api/ships/${shipDeploymentId}/knowledge?${params.toString()}`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`)
      }

      setKnowledgeResults(Array.isArray(payload?.results) ? (payload.results as KnowledgeCitation[]) : [])
      setError(null)
    } catch (searchError) {
      console.error("Ship knowledge query failed:", searchError)
      setKnowledgeResults([])
      setError(searchError instanceof Error ? searchError.message : "Ship knowledge query failed")
    } finally {
      setIsSearchingKnowledge(false)
    }
  }

  const handleKnowledgeSave = async () => {
    if (!shipDeploymentId || !knowledgePathInput.trim() || isSavingKnowledge) {
      return
    }

    setIsSavingKnowledge(true)
    try {
      const response = await fetch(`/api/ships/${shipDeploymentId}/knowledge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          path: knowledgePathInput.trim(),
          content: knowledgeDraft,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`)
      }

      const savedPath = typeof payload?.path === "string" ? payload.path : knowledgePathInput.trim()
      setSelectedKnowledgePath(savedPath)
      setKnowledgePathInput(savedPath)
      await loadKnowledgeTree("all")
      setError(null)
    } catch (saveError) {
      console.error("Saving ship knowledge failed:", saveError)
      setError(saveError instanceof Error ? saveError.message : "Saving ship knowledge failed")
    } finally {
      setIsSavingKnowledge(false)
    }
  }

  const handleKnowledgeDelete = async () => {
    if (!shipDeploymentId || !knowledgePathInput.trim() || isDeletingKnowledge) {
      return
    }

    const confirmed = window.confirm("Delete this knowledge note?")
    if (!confirmed) {
      return
    }

    setIsDeletingKnowledge(true)
    try {
      const params = new URLSearchParams({
        path: knowledgePathInput.trim(),
        mode: "hard",
      })
      const response = await fetch(`/api/ships/${shipDeploymentId}/knowledge?${params.toString()}`, {
        method: "DELETE",
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`)
      }

      setKnowledgeDraft("")
      setKnowledgePathInput("")
      setSelectedKnowledgePath(null)
      await loadKnowledgeTree("all")
      setError(null)
    } catch (deleteError) {
      console.error("Deleting ship knowledge failed:", deleteError)
      setError(deleteError instanceof Error ? deleteError.message : "Deleting ship knowledge failed")
    } finally {
      setIsDeletingKnowledge(false)
    }
  }

  const handleKnowledgeResync = async (scope: KnowledgeScope) => {
    if (!shipDeploymentId || isResyncingKnowledge) {
      return
    }

    setIsResyncingKnowledge(true)
    try {
      const response = await fetch(`/api/ships/${shipDeploymentId}/knowledge/resync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scope,
          mode: knowledgeMode,
          backend: knowledgeBackend,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`)
      }

      setKnowledgeLatestSync(payload?.summary ? (payload.summary as KnowledgeSyncSummary) : null)
      await loadKnowledgeTree("all")
      setError(null)
    } catch (resyncError) {
      console.error("Knowledge resync failed:", resyncError)
      setError(resyncError instanceof Error ? resyncError.message : "Knowledge resync failed")
    } finally {
      setIsResyncingKnowledge(false)
    }
  }

  const createKnowledgePath = (scope: Exclude<KnowledgeScope, "all">) => {
    if (!shipDeploymentId) {
      return
    }

    const prefix = scope === "ship" ? `kb/ships/${shipDeploymentId}/` : "kb/fleet/"
    const suggested = `${prefix}Untitled.md`
    setSelectedKnowledgePath(null)
    setKnowledgePathInput(suggested)
    setKnowledgeDraft("# New Knowledge Note\n")
  }

  if (!shipDeploymentId) {
    return (
      <div className={`rounded-xl border border-slate-300/70 bg-white/70 p-4 text-sm text-slate-600 dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-300 ${className || ""}`.trim()}>
        Select a ship to access Quartermaster.
      </div>
    )
  }

  return (
    <div className={`rounded-xl border border-slate-300/70 bg-white/75 p-4 dark:border-white/12 dark:bg-white/[0.04] ${className || ""}`.trim()}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Ship Quartermaster</p>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {state?.quartermaster.callsign || "QTM-LGR"} · {shipName || state?.ship.name || "Ship"}
          </h3>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className={`rounded-md border px-2 py-1 ${state?.quartermaster.enabled ? "border-emerald-400/45 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200" : "border-amber-400/45 bg-amber-500/10 text-amber-700 dark:text-amber-200"}`}>
            {state?.quartermaster.enabled ? "Enabled" : "Manual Enable"}
          </span>
          {providerState.provider && (
            <span className="rounded-md border border-cyan-400/45 bg-cyan-500/10 px-2 py-1 text-cyan-700 dark:text-cyan-200">
              Provider: {providerState.provider}
            </span>
          )}
          {providerState.fallbackUsed === true && (
            <span className="rounded-md border border-orange-400/45 bg-orange-500/10 px-2 py-1 text-orange-700 dark:text-orange-200">
              Fallback
            </span>
          )}
          <button
            type="button"
            onClick={() => void openToolRequestModal()}
            disabled={isToolRequestOptionsLoading}
            className="inline-flex items-center gap-1 rounded-md border border-cyan-500/45 bg-cyan-500/10 px-2 py-1 text-cyan-700 disabled:opacity-50 dark:border-cyan-300/45 dark:text-cyan-200"
          >
            {isToolRequestOptionsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackagePlus className="h-3.5 w-3.5" />}
            File Tool Request
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
        <span className="inline-flex items-center gap-1 rounded-md border border-slate-300/70 px-2 py-1 dark:border-white/12">
          <ShieldCheck className="h-3 w-3" />
          {state?.quartermaster.authority || "scoped_operator"}
        </span>
        <span className="inline-flex items-center gap-1 rounded-md border border-slate-300/70 px-2 py-1 dark:border-white/12">
          <Wrench className="h-3 w-3" />
          {state?.quartermaster.diagnosticsScope || "read_only"}
        </span>
      </div>

      <div className="mt-3 inline-flex w-full rounded-lg border border-slate-300/70 bg-white/70 p-1 dark:border-white/12 dark:bg-white/[0.03]">
        {(["chat", "knowledge"] as QuartermasterTab[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`flex-1 inline-flex items-center justify-center rounded-md px-2 py-1.5 text-xs font-medium uppercase tracking-wide ${
              tab === item
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "text-slate-600 dark:text-slate-300"
            }`}
          >
            <span>{item === "chat" ? "Chat" : "Knowledge Base"}</span>
            {(() => {
              const badgeLabel = formatUnreadBadgeCount(getUnread([QUARTERMASTER_TAB_NOTIFICATION_CHANNEL[item]]))
              if (!badgeLabel) return null
              return (
                <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                  {badgeLabel}
                </span>
              )
            })()}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="mt-3 inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading Quartermaster state...
        </div>
      ) : state && !state.quartermaster.enabled ? (
        <div className="mt-3 rounded-lg border border-slate-300/70 bg-white/80 p-3 dark:border-white/12 dark:bg-white/[0.03]">
          <p className="text-sm text-slate-700 dark:text-slate-200">
            Quartermaster is not enabled for this ship yet.
          </p>
          <button
            type="button"
            onClick={handleProvision}
            disabled={isProvisioning}
            className="mt-3 inline-flex items-center gap-2 rounded-md border border-cyan-500/45 bg-cyan-500/12 px-3 py-1.5 text-xs font-medium text-cyan-700 disabled:opacity-50 dark:border-cyan-300/45 dark:text-cyan-200"
          >
            {isProvisioning && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Enable Quartermaster
          </button>
        </div>
      ) : state ? (
        <>
          {tab === "chat" ? (
            <>
              <div className={`mt-3 overflow-y-auto rounded-lg border border-slate-300/70 bg-white/80 p-3 dark:border-white/12 dark:bg-white/[0.03] ${compact ? "max-h-48" : "max-h-72"}`}>
                {state.interactions.length === 0 ? (
                  <p className="text-sm text-slate-600 dark:text-slate-300">No Quartermaster interactions yet.</p>
                ) : (
                  <div className="space-y-2">
                    {state.interactions.map((interaction) => (
                      <div key={interaction.id} className="rounded-md border border-slate-200/80 bg-white/90 p-2 dark:border-white/10 dark:bg-white/[0.04]">
                        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                          <span>{interactionLabel(interaction.type)}</span>
                          <span>{new Date(interaction.timestamp).toLocaleString()}</span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">
                          {interaction.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-3">
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={compact ? 2 : 3}
                  placeholder="Ask Quartermaster about setup or ship maintenance diagnostics..."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!prompt.trim() || isSending}
                    className="inline-flex items-center gap-2 rounded-md border border-cyan-500/45 bg-cyan-500/12 px-3 py-1.5 text-xs font-medium text-cyan-700 disabled:opacity-50 dark:border-cyan-300/45 dark:text-cyan-200"
                  >
                    {isSending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Ask Quartermaster
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="rounded-lg border border-slate-300/70 bg-white/80 p-3 dark:border-white/12 dark:bg-white/[0.03]">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={knowledgeScope}
                    onChange={(event) => setKnowledgeScope(event.target.value as KnowledgeScope)}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-100"
                  >
                    <option value="ship">Ship</option>
                    <option value="fleet">Fleet</option>
                    <option value="all">All</option>
                  </select>
                  <select
                    value={knowledgeMode}
                    onChange={(event) => setKnowledgeMode(event.target.value as KnowledgeMode)}
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
                        setKnowledgeBackend(next)
                        return
                      }
                      setKnowledgeBackend("auto")
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
                      onChange={(event) => setKnowledgeQuery(event.target.value)}
                      placeholder="Search ship/fleet knowledge..."
                      className="w-full rounded-md border border-slate-300 bg-white py-1 pl-7 pr-2 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-100"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleKnowledgeSearch}
                    disabled={isSearchingKnowledge || !knowledgeQuery.trim()}
                    className="inline-flex items-center gap-1 rounded-md border border-cyan-500/45 bg-cyan-500/12 px-2 py-1 text-xs font-medium text-cyan-700 disabled:opacity-50 dark:border-cyan-300/45 dark:text-cyan-200"
                  >
                    {isSearchingKnowledge && <Loader2 className="h-3 w-3 animate-spin" />}
                    Search
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleKnowledgeResync(knowledgeScope)}
                    disabled={isResyncingKnowledge}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 disabled:opacity-50 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200"
                  >
                    {isResyncingKnowledge ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    Resync
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                  {formatSyncSummary(knowledgeLatestSync)}
                </p>
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
                        onClick={() => {
                          setSelectedKnowledgePath(result.path)
                          setKnowledgePathInput(result.path)
                        }}
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
                          onClick={() => void loadKnowledgeTree("all")}
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
                            onSelectPath={(path) => {
                              setSelectedKnowledgePath(path)
                              setKnowledgePathInput(path)
                            }}
                          />
                        )}
                      </div>

                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => createKnowledgePath("ship")}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-[11px] text-slate-700 dark:border-white/15 dark:text-slate-300"
                        >
                          <FilePlus2 className="h-3 w-3" />
                          Ship Note
                        </button>
                        <button
                          type="button"
                          onClick={() => createKnowledgePath("fleet")}
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
                              onClick={() => {
                                setSelectedKnowledgePath(result.path)
                                setKnowledgePathInput(result.path)
                              }}
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
                        onChange={(event) => setKnowledgePathInput(event.target.value)}
                        placeholder={`kb/ships/${shipDeploymentId}/topic.md`}
                        className="min-w-[220px] flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={handleKnowledgeSave}
                        disabled={isSavingKnowledge || !knowledgePathInput.trim()}
                        className="inline-flex items-center gap-1 rounded-md border border-cyan-500/45 bg-cyan-500/12 px-2 py-1 text-xs font-medium text-cyan-700 disabled:opacity-50 dark:border-cyan-300/45 dark:text-cyan-200"
                      >
                        {isSavingKnowledge ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={handleKnowledgeDelete}
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
                          onChange={(event) => setKnowledgeDraft(event.target.value)}
                          placeholder="Ship/Fleet knowledge markdown..."
                          className="h-[360px] w-full rounded-md border border-slate-300 bg-white p-2 font-mono text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-100"
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      ) : null}

      {isToolRequestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-300/80 bg-white p-4 shadow-2xl dark:border-white/15 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Quartermaster Action</p>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">File Tool Request</h4>
              </div>
              <button
                type="button"
                onClick={closeToolRequestModal}
                className="inline-flex items-center justify-center rounded-md border border-slate-300 p-1 text-slate-600 hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.06]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isToolRequestOptionsLoading ? (
              <div className="mt-4 inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading tool options...
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <label className="space-y-1">
                  <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Tool</span>
                  <select
                    value={toolRequestCatalogEntryId}
                    onChange={(event) => setToolRequestCatalogEntryId(event.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-100"
                  >
                    {toolRequestableEntries.length === 0 ? (
                      <option value="">No installed tools pending grant</option>
                    ) : (
                      toolRequestableEntries.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.slug}
                        </option>
                      ))
                    )}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Requester Bridge Crew (optional)</span>
                  <select
                    value={toolRequestBridgeCrewId}
                    onChange={(event) => setToolRequestBridgeCrewId(event.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-100"
                  >
                    <option value="">None (operator request)</option>
                    {(toolRequestState?.bridgeCrew || []).map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.callsign} ({member.role})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Scope Preference</span>
                  <select
                    value={toolRequestScopePreference}
                    onChange={(event) => setToolRequestScopePreference(event.target.value as "requester_only" | "ship")}
                    className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-100"
                  >
                    <option value="requester_only">requester_only</option>
                    <option value="ship">ship</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Rationale</span>
                  <textarea
                    value={toolRequestRationale}
                    onChange={(event) => setToolRequestRationale(event.target.value)}
                    rows={3}
                    placeholder="State why this tool is needed."
                    className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-100"
                  />
                </label>
              </div>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeToolRequestModal}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitToolRequest()}
                disabled={isToolRequestSubmitting || isToolRequestOptionsLoading || !toolRequestCatalogEntryId}
                className="inline-flex items-center gap-2 rounded-md border border-cyan-500/45 bg-cyan-500/12 px-3 py-1.5 text-xs font-medium text-cyan-700 disabled:opacity-50 dark:border-cyan-300/45 dark:text-cyan-200"
              >
                {isToolRequestSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackagePlus className="h-3.5 w-3.5" />}
                {isToolRequestSubmitting ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="mt-3 rounded-md border border-emerald-400/45 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-200">
          {successMessage}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-md border border-rose-400/45 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-200">
          {error}
        </div>
      )}
    </div>
  )
}
