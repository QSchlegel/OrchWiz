"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react"
import {
  Loader2,
  PackagePlus,
  X,
} from "lucide-react"
import { useNotifications } from "@/components/notifications"
import { QUARTERMASTER_TAB_NOTIFICATION_CHANNEL } from "@/lib/notifications/channels"
import { formatUnreadBadgeCount } from "@/lib/notifications/store"
import { useEventStream } from "@/lib/realtime/useEventStream"
import { isShipNotFoundApiError } from "@/lib/ships/errors"
import type { ShipToolsStateDto } from "@/lib/tools/types"
import { QuartermasterChatPane } from "@/components/quartermaster/panel/QuartermasterChatPane"
import { QuartermasterControlRail } from "@/components/quartermaster/panel/QuartermasterControlRail"
import { QuartermasterHeader } from "@/components/quartermaster/panel/QuartermasterHeader"
import { QuartermasterKnowledgePane } from "@/components/quartermaster/panel/QuartermasterKnowledgePane"

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
    executionLevel: QuartermasterExecutionLevel
    loopDefaults: QuartermasterLoopDefaults
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

type QuartermasterExecutionLevel = "read_only" | "workspace_write" | "danger_full_access"

interface QuartermasterLoopDefaults {
  intervalSeconds: number
  maxDurationSeconds: number
  maxIterations: number
  autoStopOnHealthyActive: boolean
}

interface QuartermasterLoopRunSummary {
  taskId: string
  shipDeploymentId: string
  status: "pending" | "running" | "thinking" | "completed" | "failed" | "cancelled"
  startedAt: string
  completedAt: string | null
  prompt: string
  executionLevel: QuartermasterExecutionLevel
  loopDefaults: QuartermasterLoopDefaults
  iterationCount: number
  failureCount: number
  stopRequested: boolean
  stopReason: string | null
  lastIterationAt: string | null
  lastError: string | null
}

interface QuartermasterLoopStatusPayload {
  activeRun: QuartermasterLoopRunSummary | null
  recentRuns: QuartermasterLoopRunSummary[]
}

interface ShipQuartermasterPanelProps {
  shipDeploymentId: string | null
  shipName?: string
  className?: string
  compact?: boolean
  autoFocusPrompt?: boolean
  focusSignal?: number
  onShipNotFound?: (shipDeploymentId: string) => void | Promise<void>
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

type QuartermasterTab = "chat" | "knowledge" | "controls"
type KnowledgeScope = "ship" | "fleet" | "all"
type KnowledgeMode = "hybrid" | "lexical"
type KnowledgeBackend = "auto" | "vault-local" | "data-core-merged"

interface ApiResponseError extends Error {
  status?: number
  payload?: unknown
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

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

function codexAccountProviderLabel(provider: CodexCliAccountProvider): string {
  if (provider === "chatgpt") return "ChatGPT"
  if (provider === "api_key") return "API Key"
  if (provider === "unknown") return "Connected"
  return "Not Connected"
}

function asErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).error === "string") {
    const message = ((payload as Record<string, unknown>).error as string).trim()
    if (message.length > 0) {
      return message
    }
  }

  return fallback
}

const DEFAULT_LOOP_DEFAULTS: QuartermasterLoopDefaults = {
  intervalSeconds: 60,
  maxDurationSeconds: 30 * 60,
  maxIterations: 30,
  autoStopOnHealthyActive: true,
}

const LOOP_DEFAULT_PRESETS: {
  key: "balanced" | "fast" | "conservative"
  label: string
  defaults: QuartermasterLoopDefaults
}[] = [
  {
    key: "balanced",
    label: "Balanced",
    defaults: {
      intervalSeconds: 60,
      maxDurationSeconds: 30 * 60,
      maxIterations: 30,
      autoStopOnHealthyActive: true,
    },
  },
  {
    key: "fast",
    label: "Fast Recovery",
    defaults: {
      intervalSeconds: 30,
      maxDurationSeconds: 20 * 60,
      maxIterations: 40,
      autoStopOnHealthyActive: true,
    },
  },
  {
    key: "conservative",
    label: "Conservative",
    defaults: {
      intervalSeconds: 90,
      maxDurationSeconds: 30 * 60,
      maxIterations: 20,
      autoStopOnHealthyActive: true,
    },
  },
]

function normalizeLoopDefaults(value: unknown): QuartermasterLoopDefaults {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_LOOP_DEFAULTS
  }

  const record = value as Record<string, unknown>
  const intervalSecondsRaw = typeof record.intervalSeconds === "number" ? record.intervalSeconds : DEFAULT_LOOP_DEFAULTS.intervalSeconds
  const maxDurationSecondsRaw = typeof record.maxDurationSeconds === "number" ? record.maxDurationSeconds : DEFAULT_LOOP_DEFAULTS.maxDurationSeconds
  const maxIterationsRaw = typeof record.maxIterations === "number" ? record.maxIterations : DEFAULT_LOOP_DEFAULTS.maxIterations
  const autoStopOnHealthyActiveRaw = typeof record.autoStopOnHealthyActive === "boolean"
    ? record.autoStopOnHealthyActive
    : DEFAULT_LOOP_DEFAULTS.autoStopOnHealthyActive

  return {
    intervalSeconds: clamp(Math.trunc(intervalSecondsRaw), 10, 3600),
    maxDurationSeconds: clamp(Math.trunc(maxDurationSecondsRaw), 60, 86400),
    maxIterations: clamp(Math.trunc(maxIterationsRaw), 1, 1000),
    autoStopOnHealthyActive: autoStopOnHealthyActiveRaw,
  }
}

function loopDefaultsEqual(left: QuartermasterLoopDefaults, right: QuartermasterLoopDefaults): boolean {
  return (
    left.intervalSeconds === right.intervalSeconds
    && left.maxDurationSeconds === right.maxDurationSeconds
    && left.maxIterations === right.maxIterations
    && left.autoStopOnHealthyActive === right.autoStopOnHealthyActive
  )
}

function executionLevelLabel(level: QuartermasterExecutionLevel): string {
  if (level === "danger_full_access") return "Danger Full Access"
  if (level === "workspace_write") return "Workspace Write"
  return "Read Only"
}

function loopStopReasonLabel(reason: string | null): string {
  if (!reason) return "Not set"
  return reason.replaceAll("_", " ")
}

function formatDurationSeconds(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  if (minutes > 0) {
    return `${minutes}m ${remainder}s`
  }
  return `${remainder}s`
}

function createApiResponseError(payload: unknown, status: number, fallback: string): ApiResponseError {
  const error = new Error(asErrorMessage(payload, fallback)) as ApiResponseError
  error.status = status
  error.payload = payload
  return error
}

export function ShipQuartermasterPanel({
  shipDeploymentId,
  shipName,
  className,
  compact = false,
  autoFocusPrompt = false,
  focusSignal,
  onShipNotFound,
}: ShipQuartermasterPanelProps) {
  const { getUnread, registerActiveChannels } = useNotifications()
  const [tab, setTab] = useState<QuartermasterTab>("chat")
  const [state, setState] = useState<QuartermasterStatePayload | null>(null)
  const [quartermasterConfig, setQuartermasterConfig] = useState<QuartermasterStatePayload["quartermaster"] | null>(null)
  const [executionLevelDraft, setExecutionLevelDraft] = useState<QuartermasterExecutionLevel>("read_only")
  const [loopDefaultsDraft, setLoopDefaultsDraft] = useState<QuartermasterLoopDefaults>(DEFAULT_LOOP_DEFAULTS)
  const [isConfigLoading, setIsConfigLoading] = useState(false)
  const [isConfigSaving, setIsConfigSaving] = useState(false)
  const [dangerModeConfirmed, setDangerModeConfirmed] = useState(false)
  const [showExecutiveControls, setShowExecutiveControls] = useState(!compact)
  const [showLoopControls, setShowLoopControls] = useState(!compact)
  const [isLoading, setIsLoading] = useState(false)
  const [isProvisioning, setIsProvisioning] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [loopPrompt, setLoopPrompt] = useState("")
  const [loopStatus, setLoopStatus] = useState<QuartermasterLoopStatusPayload | null>(null)
  const [isLoopStatusLoading, setIsLoopStatusLoading] = useState(false)
  const [isLoopStarting, setIsLoopStarting] = useState(false)
  const [isLoopStopping, setIsLoopStopping] = useState(false)
  const [loopNowMs, setLoopNowMs] = useState<number>(Date.now())
  const [prompt, setPrompt] = useState("")
  const [pendingChatInteraction, setPendingChatInteraction] = useState<QuartermasterInteraction | null>(null)
  const [isNarrowLayout, setIsNarrowLayout] = useState(() => {
    if (typeof window === "undefined") {
      return compact
    }
    return window.matchMedia("(max-width: 1023px)").matches
  })
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
  const [codexConnector, setCodexConnector] = useState<CodexCliConnectorState | null>(null)
  const [isCodexConnectorLoading, setIsCodexConnectorLoading] = useState(false)
  const [isCodexConnectorUpdating, setIsCodexConnectorUpdating] = useState(false)
  const [codexConnectorApiKey, setCodexConnectorApiKey] = useState("")
  const [codexConnectorNotice, setCodexConnectorNotice] = useState<string | null>(null)
  const [shipNotFoundNotice, setShipNotFoundNotice] = useState<string | null>(null)
  const chatLogRef = useRef<HTMLDivElement | null>(null)
  const promptRef = useRef<HTMLTextAreaElement | null>(null)
  const pendingPromptFocusRef = useRef(false)
  const chatResizeStartRef = useRef<{
    startX: number
    startY: number
    startWidthPx: number
    startHeightPx: number
  } | null>(null)
  const shipNotFoundNotifiedRef = useRef<Set<string>>(new Set())

  const focusPromptSoon = useCallback(() => {
    window.requestAnimationFrame(() => {
      promptRef.current?.focus()
    })
  }, [])

  const requestPromptFocus = useCallback(() => {
    if (tab === "chat") {
      focusPromptSoon()
      return
    }

    pendingPromptFocusRef.current = true
    setTab("chat")
  }, [focusPromptSoon, setTab, tab])

  useEffect(() => {
    if (!pendingPromptFocusRef.current) {
      return
    }

    if (tab !== "chat") {
      return
    }

    pendingPromptFocusRef.current = false
    focusPromptSoon()
  }, [focusPromptSoon, tab])

  useEffect(() => {
    if (autoFocusPrompt) {
      requestPromptFocus()
    }
  }, [autoFocusPrompt, requestPromptFocus])

  useEffect(() => {
    if (typeof focusSignal !== "number") {
      return
    }

    requestPromptFocus()
  }, [focusSignal, requestPromptFocus])

  const handleShipNotFound = useCallback(
    async (error: unknown): Promise<boolean> => {
      if (!shipDeploymentId || !(error instanceof Error)) {
        return false
      }

      const status = typeof (error as ApiResponseError).status === "number"
        ? (error as ApiResponseError).status
        : undefined
      const payload = (error as ApiResponseError).payload
      if (!isShipNotFoundApiError(payload, status)) {
        return false
      }

      setError(null)
      setShipNotFoundNotice("Selected ship is no longer available. Refreshing ship selection.")

      if (shipNotFoundNotifiedRef.current.has(shipDeploymentId)) {
        return true
      }

      shipNotFoundNotifiedRef.current.add(shipDeploymentId)
      try {
        await onShipNotFound?.(shipDeploymentId)
      } catch (callbackError) {
        console.error("Ship-not-found recovery callback failed for ShipQuartermasterPanel:", callbackError)
      }

      return true
    },
    [onShipNotFound, shipDeploymentId],
  )

  const fetchState = useCallback(async () => {
    if (!shipDeploymentId) {
      setState(null)
      setQuartermasterConfig(null)
      setError(null)
      setShipNotFoundNotice(null)
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch(`/api/ships/${shipDeploymentId}/quartermaster`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw createApiResponseError(payload, response.status, `Failed to load quartermaster state (${response.status})`)
      }

      const nextState = payload as QuartermasterStatePayload
      setState(nextState)
      if (nextState.quartermaster) {
        setQuartermasterConfig((current) => current || nextState.quartermaster)
      }
      setError(null)
      setShipNotFoundNotice(null)
    } catch (loadError) {
      if (await handleShipNotFound(loadError)) {
        setState(null)
        return
      }

      console.error("Failed to load quartermaster state:", loadError)
      setState(null)
      setError(loadError instanceof Error ? loadError.message : "Failed to load quartermaster state")
    } finally {
      setIsLoading(false)
    }
  }, [handleShipNotFound, shipDeploymentId])

  const fetchQuartermasterConfig = useCallback(async () => {
    if (!shipDeploymentId) {
      setQuartermasterConfig(null)
      setExecutionLevelDraft("read_only")
      setLoopDefaultsDraft(DEFAULT_LOOP_DEFAULTS)
      setDangerModeConfirmed(false)
      return
    }

    setIsConfigLoading(true)
    try {
      const response = await fetch(`/api/ships/${shipDeploymentId}/quartermaster/config`, {
        cache: "no-store",
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw createApiResponseError(payload, response.status, `Failed to load quartermaster controls (${response.status})`)
      }

      const quartermaster = (payload as { quartermaster?: QuartermasterStatePayload["quartermaster"] }).quartermaster
      if (quartermaster) {
        setQuartermasterConfig(quartermaster)
        setExecutionLevelDraft(quartermaster.executionLevel || "read_only")
        setLoopDefaultsDraft(normalizeLoopDefaults(quartermaster.loopDefaults))
      }
      setDangerModeConfirmed(false)
      setError(null)
      setShipNotFoundNotice(null)
    } catch (configError) {
      if (await handleShipNotFound(configError)) {
        setQuartermasterConfig(null)
        setExecutionLevelDraft("read_only")
        setLoopDefaultsDraft(DEFAULT_LOOP_DEFAULTS)
        return
      }

      console.error("Failed to load quartermaster controls:", configError)
      setQuartermasterConfig(null)
      setExecutionLevelDraft("read_only")
      setLoopDefaultsDraft(DEFAULT_LOOP_DEFAULTS)
      setError(configError instanceof Error ? configError.message : "Failed to load quartermaster controls")
    } finally {
      setIsConfigLoading(false)
    }
  }, [handleShipNotFound, shipDeploymentId])

  const fetchLoopStatus = useCallback(async (options?: { silent?: boolean }) => {
    if (!shipDeploymentId) {
      setLoopStatus(null)
      return
    }

    if (!options?.silent) {
      setIsLoopStatusLoading(true)
    }
    try {
      const response = await fetch(`/api/ships/${shipDeploymentId}/quartermaster/loop`, {
        cache: "no-store",
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw createApiResponseError(payload, response.status, `Failed to load quartermaster loop status (${response.status})`)
      }

      setLoopStatus(payload as QuartermasterLoopStatusPayload)
      setError(null)
      setShipNotFoundNotice(null)
    } catch (loopError) {
      if (await handleShipNotFound(loopError)) {
        setLoopStatus(null)
        return
      }

      console.error("Failed to load quartermaster loop status:", loopError)
      if (!options?.silent) {
        setError(loopError instanceof Error ? loopError.message : "Failed to load quartermaster loop status")
      }
      setLoopStatus(null)
    } finally {
      if (!options?.silent) {
        setIsLoopStatusLoading(false)
      }
    }
  }, [handleShipNotFound, shipDeploymentId])

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
        throw createApiResponseError(payload, response.status, `Failed to load ship knowledge tree (${response.status})`)
      }

      const tree = Array.isArray(payload?.tree) ? (payload.tree as KnowledgeTreeNode[]) : []
      setKnowledgeTree(tree)
      setKnowledgeLatestSync(payload?.latestSync ? (payload.latestSync as KnowledgeSyncSummary) : null)
      setShipNotFoundNotice(null)

      const filePaths = flattenKnowledgeFilePaths(tree)
      setSelectedKnowledgePath((current) => {
        if (current && filePaths.includes(current)) {
          return current
        }
        return filePaths[0] || null
      })
    } catch (treeError) {
      if (await handleShipNotFound(treeError)) {
        setKnowledgeTree([])
        setKnowledgeLatestSync(null)
        setSelectedKnowledgePath(null)
        return
      }

      console.error("Failed to load ship knowledge tree:", treeError)
      setKnowledgeTree([])
      setKnowledgeLatestSync(null)
      setSelectedKnowledgePath(null)
      setError(treeError instanceof Error ? treeError.message : "Failed to load ship knowledge tree")
    } finally {
      setIsLoadingKnowledgeTree(false)
    }
  }, [handleShipNotFound, shipDeploymentId])

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
        throw createApiResponseError(payload, response.status, `Failed to submit tool request (${response.status})`)
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
        throw createApiResponseError(payload, response.status, `Failed to load ship tool options (${response.status})`)
      }

      const parsed = payload as ShipToolsStateDto
      setToolRequestState(parsed)
      setError(null)
      setShipNotFoundNotice(null)
    } catch (toolsError) {
      if (await handleShipNotFound(toolsError)) {
        setToolRequestState(null)
        return
      }

      console.error("Failed to load ship tool options:", toolsError)
      setToolRequestState(null)
      setError(toolsError instanceof Error ? toolsError.message : "Failed to load ship tool options")
    } finally {
      setIsToolRequestOptionsLoading(false)
    }
  }, [handleShipNotFound, shipDeploymentId])

  const loadCodexConnector = useCallback(async () => {
    setIsCodexConnectorLoading(true)
    try {
      const response = await fetch("/api/runtime/codex-cli/connector", {
        cache: "no-store",
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw createApiResponseError(payload, response.status, `Failed to submit tool request (${response.status})`)
      }

      setCodexConnector(payload?.connector ? (payload.connector as CodexCliConnectorState) : null)
      setCodexConnectorNotice(null)
    } catch (connectorError) {
      console.error("Failed to load Codex CLI connector status:", connectorError)
      setCodexConnector(null)
      setCodexConnectorNotice(
        connectorError instanceof Error ? connectorError.message : "Failed to load Codex CLI connector status",
      )
    } finally {
      setIsCodexConnectorLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchState()
  }, [fetchState])

  useEffect(() => {
    void fetchQuartermasterConfig()
  }, [fetchQuartermasterConfig])

  useEffect(() => {
    void fetchLoopStatus()
  }, [fetchLoopStatus])

  useEffect(() => {
    if (!shipDeploymentId) {
      setQuartermasterConfig(null)
      setExecutionLevelDraft("read_only")
      setLoopDefaultsDraft(DEFAULT_LOOP_DEFAULTS)
      setDangerModeConfirmed(false)
      setLoopPrompt("")
      setLoopStatus(null)
      setLoopNowMs(Date.now())
      setCodexConnector(null)
      setCodexConnectorApiKey("")
      setCodexConnectorNotice(null)
      return
    }

    void loadCodexConnector()
  }, [loadCodexConnector, shipDeploymentId])

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
      setCodexConnectorApiKey("")
      setPendingChatInteraction(null)
      setShipNotFoundNotice(null)
      setLoopStatus(null)
      setLoopPrompt("")
      setDangerModeConfirmed(false)
      return
    }

    setShipNotFoundNotice(null)
    void loadKnowledgeTree("all")
  }, [loadKnowledgeTree, shipDeploymentId])

  useEffect(() => {
    if (!selectedKnowledgePath) {
      return
    }
    void loadKnowledgeNote(selectedKnowledgePath)
  }, [loadKnowledgeNote, selectedKnowledgePath])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const media = window.matchMedia("(max-width: 1023px)")
    const apply = () => {
      setIsNarrowLayout(media.matches)
    }
    apply()
    media.addEventListener("change", apply)
    return () => {
      media.removeEventListener("change", apply)
    }
  }, [])

  useEffect(() => {
    if (!isNarrowLayout && tab === "controls") {
      setTab("chat")
    }
  }, [isNarrowLayout, tab])

  useEventStream({
    enabled: Boolean(state?.session?.id),
    types: ["session.prompted"],
    onEvent: (event) => {
      const payload = event.payload as { sessionId?: string }
      if (payload?.sessionId && payload.sessionId === state?.session?.id) {
        void fetchState()
        void fetchLoopStatus({ silent: true })
      }
    },
  })

  useEffect(() => {
    if (!successMessage) {
      return
    }

    const timer = window.setTimeout(() => {
      setSuccessMessage(null)
    }, 4500)
    return () => {
      window.clearTimeout(timer)
    }
  }, [successMessage])

  useEffect(() => {
    const activeTab = tab === "knowledge" ? "knowledge" : "chat"
    return registerActiveChannels([QUARTERMASTER_TAB_NOTIFICATION_CHANNEL[activeTab]])
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
  const displayedInteractions = useMemo(() => {
    const baseInteractions = state?.interactions || []
    if (!pendingChatInteraction) {
      return baseInteractions
    }
    return [...baseInteractions, pendingChatInteraction]
  }, [pendingChatInteraction, state?.interactions])
  const showCodexConnectorSetup = isCodexConnectorLoading || codexConnector?.accountConnected !== true
  const effectiveQuartermaster = quartermasterConfig || state?.quartermaster || null
  const persistedExecutionLevel = effectiveQuartermaster?.executionLevel || "read_only"
  const persistedLoopDefaults = normalizeLoopDefaults(effectiveQuartermaster?.loopDefaults)
  const isControlDraftDirty = (
    executionLevelDraft !== persistedExecutionLevel
    || !loopDefaultsEqual(loopDefaultsDraft, persistedLoopDefaults)
  )
  const activeLoopRun = loopStatus?.activeRun || null
  const latestLoopRun = loopStatus?.recentRuns?.[0] || null
  const activeLoopElapsedSeconds = (() => {
    if (!activeLoopRun) {
      return 0
    }
    const startedAtMs = Date.parse(activeLoopRun.startedAt)
    if (!Number.isFinite(startedAtMs)) {
      return 0
    }
    return Math.max(0, Math.floor((loopNowMs - startedAtMs) / 1000))
  })()
  const activeLoopDurationPercent = activeLoopRun
    ? clamp(Math.round((activeLoopElapsedSeconds / Math.max(1, activeLoopRun.loopDefaults.maxDurationSeconds)) * 100), 0, 100)
    : 0

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

  useEffect(() => {
    if (tab !== "chat") {
      return
    }

    const node = chatLogRef.current
    if (!node) {
      return
    }

    node.scrollTop = node.scrollHeight
  }, [displayedInteractions.length, isSending, pendingChatInteraction?.id, tab])

  useEffect(() => {
    if (!shipDeploymentId) {
      return
    }

    const pollInterval = window.setInterval(() => {
      void fetchLoopStatus({ silent: true })
    }, 5000)

    return () => {
      window.clearInterval(pollInterval)
    }
  }, [fetchLoopStatus, shipDeploymentId])

  useEffect(() => {
    if (!loopStatus?.activeRun) {
      return
    }

    setLoopNowMs(Date.now())
    const ticker = window.setInterval(() => {
      setLoopNowMs(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(ticker)
    }
  }, [loopStatus?.activeRun?.taskId])

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
        throw createApiResponseError(payload, response.status, `Failed to submit tool request (${response.status})`)
      }

      setToolRequestRationale("")
      setToolRequestBridgeCrewId("")
      setToolRequestScopePreference("requester_only")
      setSuccessMessage("Tool request filed and queued for owner review.")
      setError(null)
      setShipNotFoundNotice(null)
      closeToolRequestModal()
    } catch (requestError) {
      if (await handleShipNotFound(requestError)) {
        return
      }

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
        throw createApiResponseError(payload, response.status, `Failed to provision quartermaster (${response.status})`)
      }

      await fetchState()
      await fetchQuartermasterConfig()
      await fetchLoopStatus()
      setError(null)
      setShipNotFoundNotice(null)
    } catch (provisionError) {
      if (await handleShipNotFound(provisionError)) {
        return
      }

      console.error("Quartermaster provisioning failed:", provisionError)
      setError(provisionError instanceof Error ? provisionError.message : "Failed to enable Quartermaster")
    } finally {
      setIsProvisioning(false)
    }
  }

  const saveQuartermasterConfig = async () => {
    if (!shipDeploymentId || isConfigSaving) {
      return
    }
    if (!isControlDraftDirty) {
      setSuccessMessage("Quartermaster controls already match saved state.")
      return
    }

    if (executionLevelDraft === "danger_full_access" && !dangerModeConfirmed) {
      setError("Danger mode requires explicit confirmation before applying controls.")
      return
    }

    setIsConfigSaving(true)
    try {
      const response = await fetch(`/api/ships/${shipDeploymentId}/quartermaster/config`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          executionLevel: executionLevelDraft,
          loopDefaults: loopDefaultsDraft,
          ...(executionLevelDraft === "danger_full_access"
            ? { confirmDangerous: true }
            : {}),
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw createApiResponseError(payload, response.status, `Failed to update quartermaster controls (${response.status})`)
      }

      const updatedQuartermaster = (payload as { quartermaster?: QuartermasterStatePayload["quartermaster"] }).quartermaster
      if (updatedQuartermaster) {
        setQuartermasterConfig(updatedQuartermaster)
        setExecutionLevelDraft(updatedQuartermaster.executionLevel || "read_only")
        setLoopDefaultsDraft(normalizeLoopDefaults(updatedQuartermaster.loopDefaults))
        setState((current) => {
          if (!current) {
            return current
          }
          return {
            ...current,
            quartermaster: updatedQuartermaster,
          }
        })
      }

      setDangerModeConfirmed(false)
      setError(null)
      setShipNotFoundNotice(null)
      setSuccessMessage("Quartermaster controls updated.")
    } catch (configError) {
      if (await handleShipNotFound(configError)) {
        return
      }

      console.error("Failed to update quartermaster controls:", configError)
      setError(configError instanceof Error ? configError.message : "Failed to update quartermaster controls")
    } finally {
      setIsConfigSaving(false)
    }
  }

  const updateLoopDefaultsDraft = (patch: Partial<QuartermasterLoopDefaults>) => {
    setLoopDefaultsDraft((current) => normalizeLoopDefaults({
      ...current,
      ...patch,
    }))
  }

  const applyLoopDefaultsPreset = (presetKey: "balanced" | "fast" | "conservative") => {
    const preset = LOOP_DEFAULT_PRESETS.find((entry) => entry.key === presetKey)
    if (!preset) {
      return
    }
    setLoopDefaultsDraft(normalizeLoopDefaults(preset.defaults))
  }

  const resetControlDraftToSaved = () => {
    setExecutionLevelDraft(persistedExecutionLevel)
    setLoopDefaultsDraft(persistedLoopDefaults)
    setDangerModeConfirmed(false)
    setError(null)
  }

  const startQuartermasterLoopRun = async (options?: { promptOverride?: string }) => {
    if (!shipDeploymentId || isLoopStarting) {
      return
    }

    const effectivePrompt = options?.promptOverride?.trim() || loopPrompt.trim() || prompt.trim()
    if (!effectivePrompt) {
      setError("Loop prompt required. Add a loop objective before starting.")
      return
    }

    setIsLoopStarting(true)
    try {
      const response = await fetch(`/api/ships/${shipDeploymentId}/quartermaster/loop`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: effectivePrompt,
          executionLevel: executionLevelDraft,
          loopDefaults: loopDefaultsDraft,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw createApiResponseError(payload, response.status, `Failed to start quartermaster loop (${response.status})`)
      }

      setLoopStatus(payload as QuartermasterLoopStatusPayload)
      setLoopPrompt(effectivePrompt)
      setError(null)
      setShipNotFoundNotice(null)
      setSuccessMessage("Quartermaster self-prompt loop started.")
    } catch (loopError) {
      if (await handleShipNotFound(loopError)) {
        return
      }

      console.error("Failed to start quartermaster loop:", loopError)
      setError(loopError instanceof Error ? loopError.message : "Failed to start quartermaster loop")
    } finally {
      setIsLoopStarting(false)
    }
  }

  const stopQuartermasterLoopRun = async () => {
    if (!shipDeploymentId || isLoopStopping) {
      return
    }

    setIsLoopStopping(true)
    try {
      const response = await fetch(`/api/ships/${shipDeploymentId}/quartermaster/loop`, {
        method: "DELETE",
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw createApiResponseError(payload, response.status, `Failed to stop quartermaster loop (${response.status})`)
      }

      setLoopStatus(payload as QuartermasterLoopStatusPayload)
      setError(null)
      setShipNotFoundNotice(null)
      setSuccessMessage("Quartermaster self-prompt loop stopped.")
    } catch (loopError) {
      if (await handleShipNotFound(loopError)) {
        return
      }

      console.error("Failed to stop quartermaster loop:", loopError)
      setError(loopError instanceof Error ? loopError.message : "Failed to stop quartermaster loop")
    } finally {
      setIsLoopStopping(false)
    }
  }

  const submitPrompt = async (outgoingPrompt: string) => {
    if (!shipDeploymentId || !outgoingPrompt || isSending) {
      return
    }

    const persistedExecutionLevel = quartermasterConfig?.executionLevel
      || state?.quartermaster.executionLevel
      || "read_only"
    const executionLevelOverride = executionLevelDraft !== persistedExecutionLevel
      ? executionLevelDraft
      : undefined

    const optimisticInteraction: QuartermasterInteraction = {
      id: `pending:${Date.now()}`,
      type: "user_input",
      content: outgoingPrompt,
      timestamp: new Date().toISOString(),
    }

    setPendingChatInteraction(optimisticInteraction)
    setPrompt("")
    setIsSending(true)
    try {
      const response = await fetch(`/api/ships/${shipDeploymentId}/quartermaster`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: outgoingPrompt,
          backend: knowledgeBackend,
          ...(executionLevelOverride ? { executionLevel: executionLevelOverride } : {}),
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw createApiResponseError(payload, response.status, `Failed to submit prompt (${response.status})`)
      }

      setPendingChatInteraction(null)
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
      setShipNotFoundNotice(null)
    } catch (sendError) {
      setPendingChatInteraction(null)
      if (await handleShipNotFound(sendError)) {
        return
      }

      console.error("Quartermaster prompt failed:", sendError)
      setPrompt((current) => (current.length === 0 ? outgoingPrompt : current))
      setError(sendError instanceof Error ? sendError.message : "Failed to submit prompt")
    } finally {
      setIsSending(false)
    }
  }

  const handleSend = async () => {
    const outgoingPrompt = prompt.trim()
    await submitPrompt(outgoingPrompt)
  }

  const retryLastPrompt = () => {
    const sourceInteractions = state?.interactions || []
    for (let i = sourceInteractions.length - 1; i >= 0; i -= 1) {
      if (sourceInteractions[i].type === "user_input") {
        void submitPrompt(sourceInteractions[i].content.trim())
        return
      }
    }

    setError("No prior operator prompt is available to retry.")
  }

  const handlePromptKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) {
      return
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void startQuartermasterLoopRun({
        promptOverride: prompt.trim(),
      })
      return
    }
    if (event.key !== "Enter" || event.shiftKey) {
      return
    }

    event.preventDefault()
    void handleSend()
  }

  const handleLoopPromptKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) {
      return
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void startQuartermasterLoopRun()
    }
  }

  const connectCodexAccountWithApiKey = async () => {
    if (!codexConnectorApiKey.trim() || isCodexConnectorUpdating) {
      return
    }

    setIsCodexConnectorUpdating(true)
    try {
      const response = await fetch("/api/runtime/codex-cli/connector", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "connect_api_key",
          apiKey: codexConnectorApiKey.trim(),
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`)
      }

      setCodexConnector(payload?.connector ? (payload.connector as CodexCliConnectorState) : null)
      setCodexConnectorApiKey("")
      setCodexConnectorNotice(
        typeof payload?.actionResult?.message === "string"
          ? payload.actionResult.message
          : "Codex CLI account setup completed.",
      )
    } catch (connectorError) {
      console.error("Codex CLI account setup failed:", connectorError)
      setCodexConnectorNotice(
        connectorError instanceof Error ? connectorError.message : "Codex CLI account setup failed",
      )
    } finally {
      setIsCodexConnectorUpdating(false)
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
        k: isNarrowLayout ? "6" : "12",
      })
      const response = await fetch(`/api/ships/${shipDeploymentId}/knowledge?${params.toString()}`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw createApiResponseError(payload, response.status, `Ship knowledge query failed (${response.status})`)
      }

      setKnowledgeResults(Array.isArray(payload?.results) ? (payload.results as KnowledgeCitation[]) : [])
      setError(null)
      setShipNotFoundNotice(null)
    } catch (searchError) {
      if (await handleShipNotFound(searchError)) {
        setKnowledgeResults([])
        return
      }

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
        throw createApiResponseError(payload, response.status, `Saving ship knowledge failed (${response.status})`)
      }

      const savedPath = typeof payload?.path === "string" ? payload.path : knowledgePathInput.trim()
      setSelectedKnowledgePath(savedPath)
      setKnowledgePathInput(savedPath)
      await loadKnowledgeTree("all")
      setError(null)
      setShipNotFoundNotice(null)
    } catch (saveError) {
      if (await handleShipNotFound(saveError)) {
        return
      }

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
        throw createApiResponseError(payload, response.status, `Deleting ship knowledge failed (${response.status})`)
      }

      setKnowledgeDraft("")
      setKnowledgePathInput("")
      setSelectedKnowledgePath(null)
      await loadKnowledgeTree("all")
      setError(null)
      setShipNotFoundNotice(null)
    } catch (deleteError) {
      if (await handleShipNotFound(deleteError)) {
        return
      }

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
        throw createApiResponseError(payload, response.status, `Knowledge resync failed (${response.status})`)
      }

      setKnowledgeLatestSync(payload?.summary ? (payload.summary as KnowledgeSyncSummary) : null)
      await loadKnowledgeTree("all")
      setError(null)
      setShipNotFoundNotice(null)
    } catch (resyncError) {
      if (await handleShipNotFound(resyncError)) {
        return
      }

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

  const tabBadgeLabel = (item: QuartermasterTab): string | null => {
    if (item === "controls") {
      return null
    }
    const unread = getUnread([QUARTERMASTER_TAB_NOTIFICATION_CHANNEL[item]])
    return formatUnreadBadgeCount(unread)
  }

  return (
    <div className={`flex h-[min(80vh,56rem)] min-h-[480px] max-h-[calc(100vh-var(--theme-footer-height)-env(safe-area-inset-bottom)-0.75rem)] flex-col overflow-hidden rounded-xl border border-slate-300/70 bg-white/75 p-4 dark:border-white/12 dark:bg-white/[0.04] ${className || ""}`.trim()}>
      <QuartermasterHeader
        callsign={effectiveQuartermaster?.callsign || "QTM-LGR"}
        shipName={shipName || state?.ship.name || "Ship"}
        enabled={state?.quartermaster.enabled === true}
        authority={effectiveQuartermaster?.authority || "scoped_operator"}
        diagnosticsScope={effectiveQuartermaster?.diagnosticsScope || "read_only"}
        providerState={providerState}
        onOpenToolRequest={() => void openToolRequestModal()}
        isToolRequestOptionsLoading={isToolRequestOptionsLoading}
        showToolRequestAction
      />

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
        <div className="mt-3 min-h-0 flex-1">
          {isNarrowLayout ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="inline-flex w-full rounded-lg border border-slate-300/70 bg-white/70 p-1 dark:border-white/12 dark:bg-white/[0.03]">
                {(["chat", "controls", "knowledge"] as QuartermasterTab[]).map((item) => {
                  const badgeLabel = tabBadgeLabel(item)
                  return (
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
                      <span>{item === "chat" ? "Chat" : item === "controls" ? "Controls" : "Knowledge"}</span>
                      {badgeLabel && (
                        <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                          {badgeLabel}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              <div className="mt-3 min-h-0 flex-1">
                {tab === "chat" && (
                  <QuartermasterChatPane
                    interactions={displayedInteractions}
                    isSending={isSending}
                    prompt={prompt}
                    onPromptChange={setPrompt}
                    onPromptKeyDown={handlePromptKeyDown}
                    onSend={() => void handleSend()}
                    sendDisabled={!prompt.trim() || isSending}
                    chatLogRef={chatLogRef}
                    compact={isNarrowLayout}
                    activeLoopRun={activeLoopRun}
                    activeLoopElapsedSeconds={activeLoopElapsedSeconds}
                    formatDurationSeconds={formatDurationSeconds}
                    onRetryLastPrompt={retryLastPrompt}
                    onRefreshConnector={() => void loadCodexConnector()}
                    isConnectorRefreshing={isCodexConnectorLoading}
                  />
                )}
                {tab === "controls" && (
                  <div className="h-full overflow-y-auto pr-1">
                    <QuartermasterControlRail
                      showExecutiveControls={showExecutiveControls}
                      onToggleExecutiveControls={() => setShowExecutiveControls((current) => !current)}
                      isControlDraftDirty={isControlDraftDirty}
                      isConfigLoading={isConfigLoading}
                      executionLevelDraft={executionLevelDraft}
                      onExecutionLevelDraftChange={(nextLevel) => {
                        setExecutionLevelDraft(nextLevel)
                        if (nextLevel !== "danger_full_access") {
                          setDangerModeConfirmed(false)
                        }
                      }}
                      loopPresets={LOOP_DEFAULT_PRESETS.map(({ key, label }) => ({ key, label }))}
                      onApplyLoopDefaultsPreset={applyLoopDefaultsPreset}
                      loopDefaultsDraft={loopDefaultsDraft}
                      onUpdateLoopDefaultsDraft={updateLoopDefaultsDraft}
                      dangerModeConfirmed={dangerModeConfirmed}
                      onDangerModeConfirmedChange={setDangerModeConfirmed}
                      persistedExecutionLevel={persistedExecutionLevel}
                      executionLevelLabel={executionLevelLabel}
                      onResetControlDraft={resetControlDraftToSaved}
                      onSaveQuartermasterConfig={() => void saveQuartermasterConfig()}
                      isConfigSaving={isConfigSaving}
                      showLoopControls={showLoopControls}
                      onToggleLoopControls={() => setShowLoopControls((current) => !current)}
                      onRefreshLoopStatus={() => void fetchLoopStatus()}
                      isLoopStatusLoading={isLoopStatusLoading}
                      isLoopStarting={isLoopStarting}
                      isLoopStopping={isLoopStopping}
                      loopPrompt={loopPrompt}
                      onLoopPromptChange={setLoopPrompt}
                      onLoopPromptKeyDown={handleLoopPromptKeyDown}
                      onStartLoop={() => void startQuartermasterLoopRun()}
                      onStopLoop={() => void stopQuartermasterLoopRun()}
                      activeLoopRun={activeLoopRun}
                      latestLoopRun={latestLoopRun}
                      activeLoopElapsedSeconds={activeLoopElapsedSeconds}
                      activeLoopDurationPercent={activeLoopDurationPercent}
                      loopStopReasonLabel={loopStopReasonLabel}
                      formatDurationSeconds={formatDurationSeconds}
                      prompt={prompt}
                      showCodexConnectorSetup={showCodexConnectorSetup}
                      codexConnector={codexConnector}
                      isCodexConnectorLoading={isCodexConnectorLoading}
                      isCodexConnectorUpdating={isCodexConnectorUpdating}
                      codexConnectorApiKey={codexConnectorApiKey}
                      onCodexConnectorApiKeyChange={setCodexConnectorApiKey}
                      onConnectCodexAccountWithApiKey={() => void connectCodexAccountWithApiKey()}
                      onLoadCodexConnector={() => void loadCodexConnector()}
                      codexConnectorNotice={codexConnectorNotice}
                      codexAccountProviderLabel={codexAccountProviderLabel}
                    />
                  </div>
                )}
                {tab === "knowledge" && (
                  <div className="h-full overflow-y-auto pr-1">
                    <QuartermasterKnowledgePane
                      compact={isNarrowLayout}
                      shipDeploymentId={shipDeploymentId}
                      knowledgeScope={knowledgeScope}
                      knowledgeMode={knowledgeMode}
                      knowledgeBackend={knowledgeBackend}
                      knowledgeQuery={knowledgeQuery}
                      onKnowledgeScopeChange={setKnowledgeScope}
                      onKnowledgeModeChange={setKnowledgeMode}
                      onKnowledgeBackendChange={setKnowledgeBackend}
                      onKnowledgeQueryChange={setKnowledgeQuery}
                      onKnowledgeSearch={() => void handleKnowledgeSearch()}
                      isSearchingKnowledge={isSearchingKnowledge}
                      onKnowledgeResync={(scope) => void handleKnowledgeResync(scope)}
                      isResyncingKnowledge={isResyncingKnowledge}
                      syncSummaryText={formatSyncSummary(knowledgeLatestSync)}
                      knowledgeResults={knowledgeResults}
                      knowledgeTree={knowledgeTree}
                      isLoadingKnowledgeTree={isLoadingKnowledgeTree}
                      onReloadKnowledgeTree={() => void loadKnowledgeTree("all")}
                      selectedKnowledgePath={selectedKnowledgePath}
                      onSelectKnowledgePath={(path) => {
                        setSelectedKnowledgePath(path)
                        setKnowledgePathInput(path)
                      }}
                      onCreateKnowledgePath={createKnowledgePath}
                      knowledgePathInput={knowledgePathInput}
                      onKnowledgePathInputChange={setKnowledgePathInput}
                      onKnowledgeSave={() => void handleKnowledgeSave()}
                      isSavingKnowledge={isSavingKnowledge}
                      onKnowledgeDelete={() => void handleKnowledgeDelete()}
                      isDeletingKnowledge={isDeletingKnowledge}
                      isLoadingKnowledgeNote={isLoadingKnowledgeNote}
                      knowledgeDraft={knowledgeDraft}
                      onKnowledgeDraftChange={setKnowledgeDraft}
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="min-w-0 min-h-0 flex flex-col gap-3">
                <div className="inline-flex w-full rounded-lg border border-slate-300/70 bg-white/70 p-1 dark:border-white/12 dark:bg-white/[0.03]">
                  {(["chat", "knowledge"] as QuartermasterTab[]).map((item) => {
                    const badgeLabel = tabBadgeLabel(item)
                    return (
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
                        {badgeLabel && (
                          <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                            {badgeLabel}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>

                <div className="min-h-0 flex-1">
                  {tab === "knowledge" ? (
                    <div className="h-full overflow-y-auto pr-1">
                      <QuartermasterKnowledgePane
                        compact={false}
                        shipDeploymentId={shipDeploymentId}
                        knowledgeScope={knowledgeScope}
                        knowledgeMode={knowledgeMode}
                        knowledgeBackend={knowledgeBackend}
                        knowledgeQuery={knowledgeQuery}
                        onKnowledgeScopeChange={setKnowledgeScope}
                        onKnowledgeModeChange={setKnowledgeMode}
                        onKnowledgeBackendChange={setKnowledgeBackend}
                        onKnowledgeQueryChange={setKnowledgeQuery}
                        onKnowledgeSearch={() => void handleKnowledgeSearch()}
                        isSearchingKnowledge={isSearchingKnowledge}
                        onKnowledgeResync={(scope) => void handleKnowledgeResync(scope)}
                        isResyncingKnowledge={isResyncingKnowledge}
                        syncSummaryText={formatSyncSummary(knowledgeLatestSync)}
                        knowledgeResults={knowledgeResults}
                        knowledgeTree={knowledgeTree}
                        isLoadingKnowledgeTree={isLoadingKnowledgeTree}
                        onReloadKnowledgeTree={() => void loadKnowledgeTree("all")}
                        selectedKnowledgePath={selectedKnowledgePath}
                        onSelectKnowledgePath={(path) => {
                          setSelectedKnowledgePath(path)
                          setKnowledgePathInput(path)
                        }}
                        onCreateKnowledgePath={createKnowledgePath}
                        knowledgePathInput={knowledgePathInput}
                        onKnowledgePathInputChange={setKnowledgePathInput}
                        onKnowledgeSave={() => void handleKnowledgeSave()}
                        isSavingKnowledge={isSavingKnowledge}
                        onKnowledgeDelete={() => void handleKnowledgeDelete()}
                        isDeletingKnowledge={isDeletingKnowledge}
                        isLoadingKnowledgeNote={isLoadingKnowledgeNote}
                        knowledgeDraft={knowledgeDraft}
                        onKnowledgeDraftChange={setKnowledgeDraft}
                      />
                    </div>
                  ) : (
                    <QuartermasterChatPane
                      interactions={displayedInteractions}
                      isSending={isSending}
                      prompt={prompt}
                      onPromptChange={setPrompt}
                      onPromptKeyDown={handlePromptKeyDown}
                      onSend={() => void handleSend()}
                      sendDisabled={!prompt.trim() || isSending}
                      chatLogRef={chatLogRef}
                      compact={false}
                      activeLoopRun={activeLoopRun}
                      activeLoopElapsedSeconds={activeLoopElapsedSeconds}
                      formatDurationSeconds={formatDurationSeconds}
                      onRetryLastPrompt={retryLastPrompt}
                      onRefreshConnector={() => void loadCodexConnector()}
                      isConnectorRefreshing={isCodexConnectorLoading}
                    />
                  )}
                </div>
              </div>

              <div className="min-w-0 min-h-0 overflow-y-auto pr-1">
                <QuartermasterControlRail
                  showExecutiveControls={showExecutiveControls}
                  onToggleExecutiveControls={() => setShowExecutiveControls((current) => !current)}
                  isControlDraftDirty={isControlDraftDirty}
                  isConfigLoading={isConfigLoading}
                  executionLevelDraft={executionLevelDraft}
                  onExecutionLevelDraftChange={(nextLevel) => {
                    setExecutionLevelDraft(nextLevel)
                    if (nextLevel !== "danger_full_access") {
                      setDangerModeConfirmed(false)
                    }
                  }}
                  loopPresets={LOOP_DEFAULT_PRESETS.map(({ key, label }) => ({ key, label }))}
                  onApplyLoopDefaultsPreset={applyLoopDefaultsPreset}
                  loopDefaultsDraft={loopDefaultsDraft}
                  onUpdateLoopDefaultsDraft={updateLoopDefaultsDraft}
                  dangerModeConfirmed={dangerModeConfirmed}
                  onDangerModeConfirmedChange={setDangerModeConfirmed}
                  persistedExecutionLevel={persistedExecutionLevel}
                  executionLevelLabel={executionLevelLabel}
                  onResetControlDraft={resetControlDraftToSaved}
                  onSaveQuartermasterConfig={() => void saveQuartermasterConfig()}
                  isConfigSaving={isConfigSaving}
                  showLoopControls={showLoopControls}
                  onToggleLoopControls={() => setShowLoopControls((current) => !current)}
                  onRefreshLoopStatus={() => void fetchLoopStatus()}
                  isLoopStatusLoading={isLoopStatusLoading}
                  isLoopStarting={isLoopStarting}
                  isLoopStopping={isLoopStopping}
                  loopPrompt={loopPrompt}
                  onLoopPromptChange={setLoopPrompt}
                  onLoopPromptKeyDown={handleLoopPromptKeyDown}
                  onStartLoop={() => void startQuartermasterLoopRun()}
                  onStopLoop={() => void stopQuartermasterLoopRun()}
                  activeLoopRun={activeLoopRun}
                  latestLoopRun={latestLoopRun}
                  activeLoopElapsedSeconds={activeLoopElapsedSeconds}
                  activeLoopDurationPercent={activeLoopDurationPercent}
                  loopStopReasonLabel={loopStopReasonLabel}
                  formatDurationSeconds={formatDurationSeconds}
                  prompt={prompt}
                  showCodexConnectorSetup={showCodexConnectorSetup}
                  codexConnector={codexConnector}
                  isCodexConnectorLoading={isCodexConnectorLoading}
                  isCodexConnectorUpdating={isCodexConnectorUpdating}
                  codexConnectorApiKey={codexConnectorApiKey}
                  onCodexConnectorApiKeyChange={setCodexConnectorApiKey}
                  onConnectCodexAccountWithApiKey={() => void connectCodexAccountWithApiKey()}
                  onLoadCodexConnector={() => void loadCodexConnector()}
                  codexConnectorNotice={codexConnectorNotice}
                  codexAccountProviderLabel={codexAccountProviderLabel}
                />
              </div>
            </div>
          )}
        </div>
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

      {shipNotFoundNotice && (
        <div className="mt-3 rounded-md border border-cyan-400/45 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-700 dark:text-cyan-200">
          {shipNotFoundNotice}
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
