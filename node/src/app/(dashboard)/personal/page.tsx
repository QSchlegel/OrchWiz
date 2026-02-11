"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { EmptyState, InlineNotice, PageLayout, SurfaceCard } from "@/components/dashboard/PageLayout"
import { useNotifications } from "@/components/notifications"
import { AgentCardStrip } from "@/components/subagents/personal/AgentCardStrip"
import { AgentEditorDrawer } from "@/components/subagents/personal/AgentEditorDrawer"
import { AgentSyncPanel } from "@/components/subagents/personal/AgentSyncPanel"
import { AdvancedSettingsDrawer } from "@/components/subagents/personal/AdvancedSettingsDrawer"
import { ContextPanel } from "@/components/subagents/personal/ContextPanel"
import { CoreDetailTabs } from "@/components/subagents/personal/CoreDetailTabs"
import { HarnessPanel } from "@/components/subagents/personal/HarnessPanel"
import { OrchestrationPanel } from "@/components/subagents/personal/OrchestrationPanel"
import { PersonalToolsPanel } from "@/components/subagents/personal/PersonalToolsPanel"
import { PermissionsPanel } from "@/components/subagents/personal/PermissionsPanel"
import { SelectedAgentHeader } from "@/components/subagents/personal/SelectedAgentHeader"
import { WorkspaceInspectorDrawer } from "@/components/subagents/personal/WorkspaceInspectorDrawer"
import type {
  SubagentToolBindingView,
  ToolCatalogEntryView,
  ToolImportRunView,
} from "@/components/subagents/personal/types"
import { formatUnreadBadgeCount } from "@/lib/notifications/store"
import {
  PERSONAL_DETAIL_NOTIFICATION_CHANNEL,
  PERSONAL_TAB_NOTIFICATION_CHANNEL,
} from "@/lib/notifications/channels"
import { useEventStream } from "@/lib/realtime/useEventStream"
import { buildInitialBridgeCrewSubagents } from "@/lib/subagents/bridge-crew-bootstrap"
import {
  aggregateAdvancedUnreadCount,
  CORE_DETAIL_TABS,
  coreTabsForMode,
  enforceCoreTabForMode,
  formatAgentCardStatusLine,
  isAdvancedSectionVisible,
  nextVisibleAdvancedSection,
  type AdvancedSection,
  type AgentTypeFilter,
  type CoreDetailView,
} from "@/lib/subagents/personal-view"
import {
  DEFAULT_SUBAGENT_SETTINGS,
  HARNESS_RUNTIME_PROFILES,
  normalizeSubagentSettings,
  type HarnessRuntimeProfile,
  type SubagentSettings,
} from "@/lib/subagents/settings"
import { normalizeSubagentType, type SubagentTypeValue } from "@/lib/subagents/types"

type PersonalTab = "personal" | "shared"
type MobileSection = "agents" | "detail"
type EditableSettingsSection = "orchestration" | "workspace" | "memory" | "guidelines" | "capabilities" | "harness"

interface Subagent {
  id: string
  name: string
  subagentType: SubagentTypeValue
  description: string | null
  content: string
  path: string | null
  settings: SubagentSettings
  isShared: boolean
  createdAt: string
}

interface SubagentFormState {
  name: string
  subagentType: SubagentTypeValue
  description: string
  content: string
  path: string
}

interface ContextSize {
  wordCount: number
  estimatedTokens: number
}

interface ContextFileView {
  fileName: string
  content: string
  relativePath: string
  size: ContextSize
}

interface AgentPermission {
  id: string
  commandPattern: string
  type: "bash_command" | "tool_command"
  status: "allow" | "ask" | "deny"
  scope: "global" | "workspace" | "user" | "subagent"
  subagentId: string | null
  sourceFile: string | null
  isShared: boolean
  createdAt: string
}

interface PermissionPolicyRule {
  id?: string
  commandPattern: string
  type: "bash_command" | "tool_command"
  status: "allow" | "ask" | "deny"
  sortOrder: number
}

interface PermissionPolicy {
  id: string
  slug: string
  name: string
  description: string | null
  isSystem: boolean
  rules: PermissionPolicyRule[]
  _count?: {
    assignments: number
  }
}

interface PolicyAssignment {
  policyId: string
  priority: number
  enabled: boolean
}

interface PolicyEditorState {
  id: string | null
  name: string
  description: string
  rules: PermissionPolicyRule[]
}

interface AgentSyncPreference {
  timezone: string
  nightlyEnabled: boolean
  nightlyHour: number
  lastNightlyRunAt: string | null
}

interface AgentSyncSuggestion {
  id: string
  fileName: string
  risk: "low" | "high"
  status: "proposed" | "applied" | "rejected" | "failed"
  reason: string | null
  fileSyncStatus: "synced" | "filesystem_sync_failed" | "skipped"
  createdAt: string
  appliedAt: string | null
}

interface AgentSyncRun {
  id: string
  subagentId: string | null
  status: "pending" | "running" | "completed" | "failed"
  trigger: "manual" | "nightly"
  scope: "selected_agent" | "bridge_crew"
  summary: string | null
  fileSyncStatus: "synced" | "filesystem_sync_failed" | "skipped"
  createdAt: string
  completedAt: string | null
  suggestions: AgentSyncSuggestion[]
}

const BRIDGE_AGENT_ORDER = ["XO-CB01", "OPS-ARX", "ENG-GEO", "SEC-KOR", "MED-BEV", "COU-DEA"]

const EMPTY_FORM: SubagentFormState = {
  name: "",
  subagentType: "general",
  description: "",
  content: "",
  path: "",
}

const QUICK_PRESET_SLUGS = ["safe-core", "balanced-devops", "power-operator", "github-ingest"]

const DEFAULT_AGENTSYNC_PREFERENCE: AgentSyncPreference = {
  timezone: "UTC",
  nightlyEnabled: true,
  nightlyHour: 2,
  lastNightlyRunAt: null,
}

function parseTab(raw: string | null): PersonalTab {
  return raw === "shared" ? "shared" : "personal"
}

function toFormState(subagent: Subagent): SubagentFormState {
  return {
    name: subagent.name,
    subagentType: subagent.subagentType,
    description: subagent.description || "",
    content: subagent.content,
    path: subagent.path || "",
  }
}

function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length
}

function toContextSize(value: string): ContextSize {
  const wordCount = countWords(value)
  return {
    wordCount,
    estimatedTokens: Math.ceil(wordCount * 1.3),
  }
}

function toTotalContextSize(files: Array<{ content: string }>): ContextSize {
  const wordCount = files.reduce((sum, file) => sum + countWords(file.content), 0)
  return {
    wordCount,
    estimatedTokens: Math.ceil(wordCount * 1.3),
  }
}

function normalizeSettings(value: unknown): SubagentSettings {
  return normalizeSubagentSettings(value)
}

function normalizeSubagent(raw: any): Subagent {
  return {
    ...raw,
    subagentType: normalizeSubagentType(raw?.subagentType),
    settings: normalizeSettings(raw?.settings),
  }
}

function browserTimezone(): string {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (typeof timezone === "string" && timezone.trim()) {
      return timezone
    }
  } catch {
    // ignore and fall back to UTC
  }

  return "UTC"
}

function normalizeAgentSyncPreference(value: any): AgentSyncPreference {
  const timezone = typeof value?.timezone === "string" && value.timezone.trim()
    ? value.timezone.trim()
    : browserTimezone()
  const nightlyHourRaw = Number(value?.nightlyHour)
  const nightlyHour = Number.isFinite(nightlyHourRaw) ? Math.max(0, Math.min(23, Math.round(nightlyHourRaw))) : 2

  return {
    timezone,
    nightlyEnabled: value?.nightlyEnabled !== false,
    nightlyHour,
    lastNightlyRunAt: typeof value?.lastNightlyRunAt === "string" ? value.lastNightlyRunAt : null,
  }
}

function normalizeAgentSyncSuggestion(value: any): AgentSyncSuggestion {
  const risk = value?.risk === "high" ? "high" : "low"
  const status = value?.status === "applied" || value?.status === "rejected" || value?.status === "failed"
    ? value.status
    : "proposed"
  const fileSyncStatus =
    value?.fileSyncStatus === "synced" || value?.fileSyncStatus === "filesystem_sync_failed" ? value.fileSyncStatus : "skipped"

  return {
    id: String(value?.id || ""),
    fileName: typeof value?.fileName === "string" ? value.fileName : "UNKNOWN.md",
    risk,
    status,
    reason: typeof value?.reason === "string" ? value.reason : null,
    fileSyncStatus,
    createdAt: typeof value?.createdAt === "string" ? value.createdAt : new Date(0).toISOString(),
    appliedAt: typeof value?.appliedAt === "string" ? value.appliedAt : null,
  }
}

function normalizeAgentSyncRun(value: any): AgentSyncRun {
  const status = value?.status === "running" || value?.status === "completed" || value?.status === "failed" ? value.status : "pending"
  const trigger = value?.trigger === "nightly" ? "nightly" : "manual"
  const scope = value?.scope === "bridge_crew" ? "bridge_crew" : "selected_agent"
  const fileSyncStatus =
    value?.fileSyncStatus === "synced" || value?.fileSyncStatus === "filesystem_sync_failed" ? value.fileSyncStatus : "skipped"

  const suggestions = Array.isArray(value?.suggestions)
    ? value.suggestions.map((entry: any) => normalizeAgentSyncSuggestion(entry))
    : []

  return {
    id: String(value?.id || ""),
    subagentId: typeof value?.subagentId === "string" ? value.subagentId : null,
    status,
    trigger,
    scope,
    summary: typeof value?.summary === "string" ? value.summary : null,
    fileSyncStatus,
    createdAt: typeof value?.createdAt === "string" ? value.createdAt : new Date(0).toISOString(),
    completedAt: typeof value?.completedAt === "string" ? value.completedAt : null,
    suggestions,
  }
}

function sortAgentSyncRuns(runs: AgentSyncRun[]): AgentSyncRun[] {
  return [...runs].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
}

function trimSummary(text: string, max = 130): string {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (!normalized) return "No summary available"
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max - 3).trimEnd()}...`
}

function bridgeCrewOrderIndex(name: string): number {
  const idx = BRIDGE_AGENT_ORDER.indexOf(name.toUpperCase())
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx
}

function sortSubagentsForDisplay(subagents: Subagent[]): Subagent[] {
  return [...subagents].sort((left, right) => {
    const leftIdx = bridgeCrewOrderIndex(left.name)
    const rightIdx = bridgeCrewOrderIndex(right.name)

    if (leftIdx !== rightIdx) {
      return leftIdx - rightIdx
    }

    return left.name.localeCompare(right.name)
  })
}

function selectDefaultAgentId(subagents: Subagent[]): string | null {
  if (subagents.length === 0) return null

  const byName = new Map(subagents.map((subagent) => [subagent.name.toUpperCase(), subagent.id]))
  const xo = byName.get("XO-CB01")
  if (xo) {
    return xo
  }

  for (const name of BRIDGE_AGENT_ORDER) {
    const matched = byName.get(name)
    if (matched) {
      return matched
    }
  }

  const alphabetical = [...subagents].sort((left, right) => left.name.localeCompare(right.name))
  return alphabetical[0]?.id || null
}

function serializePolicyAssignments(assignments: PolicyAssignment[]): string {
  return JSON.stringify(
    [...assignments]
      .map((assignment) => ({
        policyId: assignment.policyId,
        priority: Number.isFinite(assignment.priority) ? Math.trunc(assignment.priority) : 100,
        enabled: Boolean(assignment.enabled),
      }))
      .sort((left, right) => {
        if (left.priority !== right.priority) {
          return left.priority - right.priority
        }
        return left.policyId.localeCompare(right.policyId)
      }),
  )
}

function normalizeToolCatalogEntry(value: any): ToolCatalogEntryView | null {
  if (!value || typeof value !== "object" || typeof value.id !== "string") {
    return null
  }

  const source = value.source
  if (source !== "curated" && source !== "custom_github" && source !== "local" && source !== "system") {
    return null
  }

  return {
    id: value.id,
    slug: typeof value.slug === "string" ? value.slug : "",
    name: typeof value.name === "string" ? value.name : "",
    description: typeof value.description === "string" ? value.description : null,
    source,
    isInstalled: Boolean(value.isInstalled),
    isSystem: Boolean(value.isSystem),
    sourceUrl: typeof value.sourceUrl === "string" ? value.sourceUrl : null,
    metadata: value.metadata && typeof value.metadata === "object" && !Array.isArray(value.metadata)
      ? (value.metadata as Record<string, unknown>)
      : null,
  }
}

function normalizeToolImportRun(value: any): ToolImportRunView | null {
  if (!value || typeof value !== "object" || typeof value.id !== "string") {
    return null
  }

  const status = value.status
  if (status !== "running" && status !== "succeeded" && status !== "failed") {
    return null
  }

  return {
    id: value.id,
    mode: typeof value.mode === "string" ? value.mode : "",
    toolSlug: typeof value.toolSlug === "string" ? value.toolSlug : null,
    sourceUrl: typeof value.sourceUrl === "string" ? value.sourceUrl : null,
    status,
    errorMessage: typeof value.errorMessage === "string" ? value.errorMessage : null,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date(0).toISOString(),
  }
}

function normalizeSubagentToolBinding(value: any): SubagentToolBindingView | null {
  if (!value || typeof value !== "object" || typeof value.id !== "string") {
    return null
  }

  return {
    id: value.id,
    subagentId: typeof value.subagentId === "string" ? value.subagentId : "",
    toolCatalogEntryId: typeof value.toolCatalogEntryId === "string" ? value.toolCatalogEntryId : "",
    enabled: value.enabled !== false,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date(0).toISOString(),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date(0).toISOString(),
  }
}

function serializeToolBindingDraft(draft: Record<string, boolean>): string {
  return JSON.stringify(
    Object.keys(draft)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => ({
        toolCatalogEntryId: key,
        enabled: draft[key] === true,
      })),
  )
}

function draftFromBindings(bindings: SubagentToolBindingView[]): Record<string, boolean> {
  const draft: Record<string, boolean> = {}
  for (const binding of bindings) {
    if (binding.toolCatalogEntryId.trim()) {
      draft[binding.toolCatalogEntryId] = binding.enabled
    }
  }
  return draft
}

function emptyPolicyEditorState(): PolicyEditorState {
  return {
    id: null,
    name: "",
    description: "",
    rules: [{ commandPattern: "", type: "bash_command", status: "allow", sortOrder: 10 }],
  }
}

function sortPolicyRules(rules: PermissionPolicyRule[]): PermissionPolicyRule[] {
  return [...rules].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder
    }
    return left.commandPattern.localeCompare(right.commandPattern)
  })
}

async function readApiError(response: Response): Promise<string> {
  try {
    const payload = await response.json()
    if (payload && typeof payload.error === "string" && payload.error.trim()) {
      return payload.error
    }
  } catch {
    // ignore parse failures
  }
  return `Request failed with status ${response.status}`
}

export default function PersonalPage() {
  const { getUnread, registerActiveChannels } = useNotifications()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const [allSubagents, setAllSubagents] = useState<Subagent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isBootstrappingCrew, setIsBootstrappingCrew] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [isMobileLayout, setIsMobileLayout] = useState(false)
  const [mobileSection, setMobileSection] = useState<MobileSection>("agents")
  const [detailTab, setDetailTab] = useState<CoreDetailView>("context")
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
  const [isWorkspaceInspectorOpen, setIsWorkspaceInspectorOpen] = useState(false)
  const [advancedSection, setAdvancedSection] = useState<AdvancedSection>("workspace")
  const [agentSearchQuery, setAgentSearchQuery] = useState("")
  const [agentTypeFilter, setAgentTypeFilter] = useState<AgentTypeFilter>("all")
  const [message, setMessage] = useState<{ type: "error" | "success" | "info"; text: string } | null>(null)
  const [formData, setFormData] = useState<SubagentFormState>(EMPTY_FORM)
  const [contextSource, setContextSource] = useState<"filesystem" | "content-fallback">("content-fallback")
  const [contextRootPath, setContextRootPath] = useState<string | null>(null)
  const [contextFiles, setContextFiles] = useState<ContextFileView[]>([])
  const [contextTotals, setContextTotals] = useState<ContextSize>({ wordCount: 0, estimatedTokens: 0 })
  const [isContextLoading, setIsContextLoading] = useState(false)
  const [isContextSaving, setIsContextSaving] = useState(false)
  const [isContextDirty, setIsContextDirty] = useState(false)
  const [settingsDraft, setSettingsDraft] = useState<SubagentSettings>(DEFAULT_SUBAGENT_SETTINGS)
  const [dirtySettingsSections, setDirtySettingsSections] = useState<Record<EditableSettingsSection, boolean>>({
    orchestration: false,
    workspace: false,
    memory: false,
    guidelines: false,
    capabilities: false,
    harness: false,
  })
  const [isSavingSettings, setIsSavingSettings] = useState<Record<EditableSettingsSection, boolean>>({
    orchestration: false,
    workspace: false,
    memory: false,
    guidelines: false,
    capabilities: false,
    harness: false,
  })
  const [agentPermissions, setAgentPermissions] = useState<AgentPermission[]>([])
  const [isPermissionsLoading, setIsPermissionsLoading] = useState(false)
  const [isCreatingPermission, setIsCreatingPermission] = useState(false)
  const [permissionDraft, setPermissionDraft] = useState({
    commandPattern: "",
    type: "bash_command" as "bash_command" | "tool_command",
    status: "allow" as "allow" | "ask" | "deny",
    sourceFile: "",
  })
  const [policyLibrary, setPolicyLibrary] = useState<PermissionPolicy[]>([])
  const [isPolicyLibraryLoading, setIsPolicyLibraryLoading] = useState(false)
  const [isPolicyEditorSaving, setIsPolicyEditorSaving] = useState(false)
  const [isPolicyAssignmentSaving, setIsPolicyAssignmentSaving] = useState(false)
  const [policyAssignments, setPolicyAssignments] = useState<PolicyAssignment[]>([])
  const [policyAssignmentsSnapshot, setPolicyAssignmentsSnapshot] = useState("[]")
  const [policyToAttachId, setPolicyToAttachId] = useState("")
  const [policyEditor, setPolicyEditor] = useState<PolicyEditorState>(emptyPolicyEditorState())
  const [agentSyncPreference, setAgentSyncPreference] = useState<AgentSyncPreference>({
    ...DEFAULT_AGENTSYNC_PREFERENCE,
    timezone: browserTimezone(),
  })
  const [agentSyncRuns, setAgentSyncRuns] = useState<AgentSyncRun[]>([])
  const [isAgentSyncPreferenceLoading, setIsAgentSyncPreferenceLoading] = useState(false)
  const [isAgentSyncPreferenceSaving, setIsAgentSyncPreferenceSaving] = useState(false)
  const [isAgentSyncRunsLoading, setIsAgentSyncRunsLoading] = useState(false)
  const [isAgentSyncRunningSelected, setIsAgentSyncRunningSelected] = useState(false)
  const [isAgentSyncRunningCrew, setIsAgentSyncRunningCrew] = useState(false)
  const [actingSuggestionId, setActingSuggestionId] = useState<string | null>(null)
  const [toolCatalog, setToolCatalog] = useState<ToolCatalogEntryView[]>([])
  const [isToolCatalogLoading, setIsToolCatalogLoading] = useState(false)
  const [isToolCatalogRefreshing, setIsToolCatalogRefreshing] = useState(false)
  const [toolImportRuns, setToolImportRuns] = useState<ToolImportRunView[]>([])
  const [isToolImportRunsLoading, setIsToolImportRunsLoading] = useState(false)
  const [importingCuratedSlug, setImportingCuratedSlug] = useState<string | null>(null)
  const [isImportingGithubUrl, setIsImportingGithubUrl] = useState(false)
  const [githubToolUrlDraft, setGithubToolUrlDraft] = useState("")
  const [agentToolBindings, setAgentToolBindings] = useState<SubagentToolBindingView[]>([])
  const [isAgentToolBindingsLoading, setIsAgentToolBindingsLoading] = useState(false)
  const [isAgentToolBindingsSaving, setIsAgentToolBindingsSaving] = useState(false)
  const [agentToolBindingsDraft, setAgentToolBindingsDraft] = useState<Record<string, boolean>>({})
  const [agentToolBindingsSnapshot, setAgentToolBindingsSnapshot] = useState("[]")
  const autoBootstrapAttemptedRef = useRef(false)

  const activeTab = parseTab(searchParams.get("tab"))
  const effectiveDetailTab = enforceCoreTabForMode(activeTab, detailTab)
  const activeTopChannel = PERSONAL_TAB_NOTIFICATION_CHANNEL[activeTab]
  const activeDetailChannel = PERSONAL_DETAIL_NOTIFICATION_CHANNEL[activeTab][effectiveDetailTab]
  const initialBridgeCrew = useMemo(() => buildInitialBridgeCrewSubagents(), [])

  const personalSubagents = useMemo(
    () => sortSubagentsForDisplay(allSubagents.filter((subagent) => !subagent.isShared)),
    [allSubagents],
  )

  const sharedSubagents = useMemo(
    () => sortSubagentsForDisplay(allSubagents.filter((subagent) => subagent.isShared)),
    [allSubagents],
  )

  const activeSubagents = activeTab === "shared" ? sharedSubagents : personalSubagents

  const selectedSubagent = useMemo(
    () => activeSubagents.find((subagent) => subagent.id === selectedAgentId) || null,
    [activeSubagents, selectedAgentId],
  )

  const visibleCoreTabs = useMemo(
    () => CORE_DETAIL_TABS.filter((tab) => coreTabsForMode(activeTab).includes(tab.id)),
    [activeTab],
  )

  const filteredAgents = useMemo(() => {
    const normalizedQuery = agentSearchQuery.trim().toLowerCase()
    return activeSubagents.filter((subagent) => {
      if (agentTypeFilter !== "all" && subagent.subagentType !== agentTypeFilter) {
        return false
      }

      if (!normalizedQuery) {
        return true
      }

      return `${subagent.name} ${subagent.description || ""} ${subagent.path || ""}`.toLowerCase().includes(normalizedQuery)
    })
  }, [activeSubagents, agentSearchQuery, agentTypeFilter])

  const missingInitialBridgeCrew = useMemo(() => {
    const existingNames = new Set(personalSubagents.map((subagent) => subagent.name.toLowerCase()))
    return initialBridgeCrew.filter((seed) => !existingNames.has(seed.name.toLowerCase()))
  }, [initialBridgeCrew, personalSubagents])

  const fetchSubagents = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/subagents")
      if (!response.ok) {
        setMessage({ type: "error", text: "Unable to load personal agents" })
        return
      }

      const data = await response.json()
      setAllSubagents(Array.isArray(data) ? data.map((entry) => normalizeSubagent(entry)) : [])
    } catch (error) {
      console.error("Error fetching subagents:", error)
      setMessage({ type: "error", text: "Unable to load personal agents" })
    } finally {
      setIsLoading(false)
    }
  }, [])

  const loadContextFiles = useCallback(async (subagentId: string) => {
    setIsContextLoading(true)
    try {
      const response = await fetch(`/api/subagents/${subagentId}/context-files`)
      if (!response.ok) {
        setMessage({ type: "error", text: await readApiError(response) })
        return
      }

      const payload = await response.json()
      const files = Array.isArray(payload?.files)
        ? payload.files
          .filter((entry: any) => entry && typeof entry.fileName === "string" && typeof entry.content === "string")
          .map((entry: any) => ({
            fileName: entry.fileName,
            content: entry.content,
            relativePath: typeof entry.relativePath === "string" ? entry.relativePath : entry.fileName,
            size: {
              wordCount: Number(entry?.size?.wordCount) || 0,
              estimatedTokens: Number(entry?.size?.estimatedTokens) || 0,
            },
          }))
        : []

      setContextSource(payload?.source === "filesystem" ? "filesystem" : "content-fallback")
      setContextRootPath(typeof payload?.rootPath === "string" ? payload.rootPath : null)
      setContextFiles(files)
      setContextTotals({
        wordCount: Number(payload?.totals?.wordCount) || 0,
        estimatedTokens: Number(payload?.totals?.estimatedTokens) || 0,
      })
      setIsContextDirty(false)
    } catch (error) {
      console.error("Failed to load context files:", error)
      setMessage({ type: "error", text: "Unable to load context files" })
    } finally {
      setIsContextLoading(false)
    }
  }, [])

  const loadPermissions = useCallback(async (subagentId: string) => {
    setIsPermissionsLoading(true)
    try {
      const query = new URLSearchParams({
        scope: "subagent",
        subagentId,
      })
      const response = await fetch(`/api/permissions?${query.toString()}`)
      if (!response.ok) {
        setMessage({ type: "error", text: await readApiError(response) })
        return
      }
      const payload = await response.json()
      setAgentPermissions(Array.isArray(payload) ? payload : [])
    } catch (error) {
      console.error("Failed to load subagent permissions:", error)
      setMessage({ type: "error", text: "Unable to load subagent permissions" })
    } finally {
      setIsPermissionsLoading(false)
    }
  }, [])

  const loadPolicyLibrary = useCallback(async () => {
    setIsPolicyLibraryLoading(true)
    try {
      const response = await fetch("/api/permission-policies")
      if (!response.ok) {
        setMessage({ type: "error", text: await readApiError(response) })
        return
      }

      const payload = await response.json()
      const library = Array.isArray(payload)
        ? payload
            .filter((entry: any) => entry && typeof entry.id === "string")
            .map((entry: any) => ({
              id: entry.id,
              slug: typeof entry.slug === "string" ? entry.slug : "",
              name: typeof entry.name === "string" ? entry.name : "",
              description: typeof entry.description === "string" ? entry.description : null,
              isSystem: Boolean(entry.isSystem),
              rules: sortPolicyRules(
                Array.isArray(entry.rules)
                  ? entry.rules
                      .filter((rule: any) => rule && typeof rule.commandPattern === "string")
                      .map((rule: any, index: number) => ({
                        id: typeof rule.id === "string" ? rule.id : undefined,
                        commandPattern: rule.commandPattern,
                        type: rule.type === "tool_command" ? "tool_command" : "bash_command",
                        status: rule.status === "deny" || rule.status === "ask" ? rule.status : "allow",
                        sortOrder: Number.isFinite(rule.sortOrder) ? Number(rule.sortOrder) : (index + 1) * 10,
                      }))
                  : [],
              ),
              _count: {
                assignments: Number(entry?._count?.assignments) || 0,
              },
            }))
            .sort((left: PermissionPolicy, right: PermissionPolicy) => {
              if (left.isSystem !== right.isSystem) {
                return left.isSystem ? -1 : 1
              }
              return left.name.localeCompare(right.name)
            })
        : []

      setPolicyLibrary(library)
    } catch (error) {
      console.error("Failed to load permission policy library:", error)
      setMessage({ type: "error", text: "Unable to load policy library" })
    } finally {
      setIsPolicyLibraryLoading(false)
    }
  }, [])

  const loadPolicyAssignments = useCallback(async (subagentId: string) => {
    try {
      const response = await fetch(`/api/subagents/${subagentId}/permission-policies`)
      if (!response.ok) {
        setMessage({ type: "error", text: await readApiError(response) })
        return
      }

      const payload = await response.json()
      const assignments = Array.isArray(payload)
        ? payload
            .filter((entry: any) => entry && typeof entry.policyId === "string")
            .map((entry: any) => ({
              policyId: entry.policyId,
              priority: Number.isFinite(entry.priority) ? Number(entry.priority) : 100,
              enabled: Boolean(entry.enabled),
            }))
        : []

      const snapshot = serializePolicyAssignments(assignments)
      setPolicyAssignments(assignments)
      setPolicyAssignmentsSnapshot(snapshot)
    } catch (error) {
      console.error("Failed to load policy assignments:", error)
      setMessage({ type: "error", text: "Unable to load policy assignments" })
    }
  }, [])

  const loadToolCatalog = useCallback(async (options?: { refreshMode?: "auto" | "force"; manual?: boolean }) => {
    const refreshMode = options?.refreshMode || "auto"
    const manual = options?.manual === true

    if (manual) {
      setIsToolCatalogRefreshing(true)
    } else {
      setIsToolCatalogLoading(true)
    }

    try {
      const params = new URLSearchParams()
      params.set("refresh", refreshMode)
      const response = await fetch(`/api/tools/catalog?${params.toString()}`)
      if (!response.ok) {
        setMessage({ type: "error", text: await readApiError(response) })
        return
      }

      const payload = await response.json()
      const entries = Array.isArray(payload?.entries)
        ? payload.entries
            .map((entry: any) => normalizeToolCatalogEntry(entry))
            .filter((entry: ToolCatalogEntryView | null): entry is ToolCatalogEntryView => Boolean(entry))
        : []

      setToolCatalog(entries)
    } catch (error) {
      console.error("Failed to load tool catalog:", error)
      setMessage({ type: "error", text: "Unable to load tool catalog" })
    } finally {
      if (manual) {
        setIsToolCatalogRefreshing(false)
      } else {
        setIsToolCatalogLoading(false)
      }
    }
  }, [])

  const loadToolImportRuns = useCallback(async () => {
    setIsToolImportRunsLoading(true)
    try {
      const response = await fetch("/api/tools/import-runs?limit=20")
      if (!response.ok) {
        setMessage({ type: "error", text: await readApiError(response) })
        return
      }

      const payload = await response.json()
      const runs = Array.isArray(payload?.runs)
        ? payload.runs
            .map((entry: any) => normalizeToolImportRun(entry))
            .filter((entry: ToolImportRunView | null): entry is ToolImportRunView => Boolean(entry))
        : []

      setToolImportRuns(runs)
    } catch (error) {
      console.error("Failed to load tool import runs:", error)
      setMessage({ type: "error", text: "Unable to load tool import runs" })
    } finally {
      setIsToolImportRunsLoading(false)
    }
  }, [])

  const loadAgentToolBindings = useCallback(async (subagentId: string) => {
    setIsAgentToolBindingsLoading(true)
    try {
      const response = await fetch(`/api/subagents/${subagentId}/tool-bindings`)
      if (!response.ok) {
        setMessage({ type: "error", text: await readApiError(response) })
        return
      }

      const payload = await response.json()
      const bindings = Array.isArray(payload?.bindings)
        ? payload.bindings
            .map((entry: any) => normalizeSubagentToolBinding(entry))
            .filter((entry: SubagentToolBindingView | null): entry is SubagentToolBindingView => Boolean(entry))
        : []

      const draft = draftFromBindings(bindings)
      setAgentToolBindings(bindings)
      setAgentToolBindingsDraft(draft)
      setAgentToolBindingsSnapshot(serializeToolBindingDraft(draft))
    } catch (error) {
      console.error("Failed to load subagent tool bindings:", error)
      setMessage({ type: "error", text: "Unable to load tool bindings" })
    } finally {
      setIsAgentToolBindingsLoading(false)
    }
  }, [])

  const loadAgentSyncPreference = useCallback(async () => {
    setIsAgentSyncPreferenceLoading(true)
    try {
      const response = await fetch("/api/agentsync/preferences")
      if (!response.ok) {
        setMessage({ type: "error", text: await readApiError(response) })
        return
      }

      const payload = await response.json()
      setAgentSyncPreference(normalizeAgentSyncPreference(payload))
    } catch (error) {
      console.error("Failed to load AgentSync preferences:", error)
      setMessage({ type: "error", text: "Unable to load AgentSync preferences" })
    } finally {
      setIsAgentSyncPreferenceLoading(false)
    }
  }, [])

  const loadAgentSyncRuns = useCallback(async (subagentId: string | null) => {
    setIsAgentSyncRunsLoading(true)
    try {
      const params = new URLSearchParams({ take: "30" })
      if (subagentId) {
        params.set("subagentId", subagentId)
      }

      const response = await fetch(`/api/agentsync/runs?${params.toString()}`)
      if (!response.ok) {
        setMessage({ type: "error", text: await readApiError(response) })
        return
      }

      const payload = await response.json()
      const runs = Array.isArray(payload) ? payload.map((entry: any) => normalizeAgentSyncRun(entry)) : []
      setAgentSyncRuns(sortAgentSyncRuns(runs))
    } catch (error) {
      console.error("Failed to load AgentSync runs:", error)
      setMessage({ type: "error", text: "Unable to load AgentSync runs" })
    } finally {
      setIsAgentSyncRunsLoading(false)
    }
  }, [])

  const runAgentSync = useCallback(async (scope: "selected_agent" | "bridge_crew") => {
    if (scope === "selected_agent" && !selectedSubagent) {
      setMessage({ type: "error", text: "Select an agent before running AgentSync." })
      return
    }

    if (scope === "selected_agent") {
      setIsAgentSyncRunningSelected(true)
    } else {
      setIsAgentSyncRunningCrew(true)
    }
    setMessage(null)

    try {
      const response = await fetch("/api/agentsync/runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scope,
          subagentId: scope === "selected_agent" ? selectedSubagent?.id : null,
        }),
      })

      if (!response.ok) {
        setMessage({ type: "error", text: await readApiError(response) })
        return
      }

      await loadAgentSyncRuns(selectedSubagent?.id || null)
      setMessage({
        type: "success",
        text: scope === "selected_agent" ? "AgentSync run started for selected agent." : "AgentSync full bridge crew run started.",
      })
    } catch (error) {
      console.error("Failed to run AgentSync:", error)
      setMessage({ type: "error", text: "Unable to trigger AgentSync run" })
    } finally {
      if (scope === "selected_agent") {
        setIsAgentSyncRunningSelected(false)
      } else {
        setIsAgentSyncRunningCrew(false)
      }
    }
  }, [loadAgentSyncRuns, selectedSubagent])

  const saveAgentSyncPreference = useCallback(async () => {
    setIsAgentSyncPreferenceSaving(true)
    setMessage(null)

    try {
      const response = await fetch("/api/agentsync/preferences", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timezone: agentSyncPreference.timezone,
          nightlyEnabled: agentSyncPreference.nightlyEnabled,
          nightlyHour: agentSyncPreference.nightlyHour,
        }),
      })

      if (!response.ok) {
        setMessage({ type: "error", text: await readApiError(response) })
        return
      }

      const payload = await response.json()
      setAgentSyncPreference(normalizeAgentSyncPreference(payload))
      setMessage({ type: "success", text: "AgentSync preferences saved." })
    } catch (error) {
      console.error("Failed to save AgentSync preferences:", error)
      setMessage({ type: "error", text: "Unable to save AgentSync preferences" })
    } finally {
      setIsAgentSyncPreferenceSaving(false)
    }
  }, [agentSyncPreference])

  const applyAgentSyncSuggestionAction = useCallback(async (suggestionId: string) => {
    setActingSuggestionId(suggestionId)
    setMessage(null)

    try {
      const response = await fetch(`/api/agentsync/suggestions/${suggestionId}/apply`, {
        method: "POST",
      })
      if (!response.ok) {
        setMessage({ type: "error", text: await readApiError(response) })
        return
      }

      await loadAgentSyncRuns(selectedSubagent?.id || null)
      setMessage({ type: "success", text: "Suggestion applied." })
    } catch (error) {
      console.error("Failed to apply AgentSync suggestion:", error)
      setMessage({ type: "error", text: "Unable to apply suggestion" })
    } finally {
      setActingSuggestionId(null)
    }
  }, [loadAgentSyncRuns, selectedSubagent])

  const rejectAgentSyncSuggestionAction = useCallback(async (suggestionId: string) => {
    setActingSuggestionId(suggestionId)
    setMessage(null)

    try {
      const response = await fetch(`/api/agentsync/suggestions/${suggestionId}/reject`, {
        method: "POST",
      })
      if (!response.ok) {
        setMessage({ type: "error", text: await readApiError(response) })
        return
      }

      await loadAgentSyncRuns(selectedSubagent?.id || null)
      setMessage({ type: "success", text: "Suggestion rejected." })
    } catch (error) {
      console.error("Failed to reject AgentSync suggestion:", error)
      setMessage({ type: "error", text: "Unable to reject suggestion" })
    } finally {
      setActingSuggestionId(null)
    }
  }, [loadAgentSyncRuns, selectedSubagent])

  useEffect(() => {
    void fetchSubagents()
  }, [fetchSubagents])

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1023px)")
    const sync = () => setIsMobileLayout(mediaQuery.matches)
    sync()
    mediaQuery.addEventListener("change", sync)
    return () => mediaQuery.removeEventListener("change", sync)
  }, [])

  useEffect(() => {
    void loadPolicyLibrary()
  }, [loadPolicyLibrary])

  useEffect(() => {
    void loadToolCatalog({ refreshMode: "auto" })
    void loadToolImportRuns()
  }, [loadToolCatalog, loadToolImportRuns])

  useEffect(() => {
    void loadAgentSyncPreference()
  }, [loadAgentSyncPreference])

  useEffect(() => {
    if (activeTab === "shared") {
      setShowCreateForm(false)
      setEditingId(null)
      setFormData(EMPTY_FORM)
      setIsAdvancedOpen(false)
      setIsWorkspaceInspectorOpen(false)
    }
    setMobileSection("agents")
  }, [activeTab])

  useEffect(() => {
    return registerActiveChannels([activeTopChannel])
  }, [activeTopChannel, registerActiveChannels])

  useEffect(() => {
    if (!selectedSubagent) {
      return
    }
    return registerActiveChannels([activeDetailChannel])
  }, [activeDetailChannel, registerActiveChannels, selectedSubagent])

  useEffect(() => {
    if (!selectedSubagent || !isAdvancedOpen) {
      return
    }

    const channel = PERSONAL_DETAIL_NOTIFICATION_CHANNEL[activeTab][advancedSection]
    return registerActiveChannels([channel])
  }, [activeTab, advancedSection, isAdvancedOpen, registerActiveChannels, selectedSubagent])

  useEffect(() => {
    if (activeSubagents.length === 0) {
      setSelectedAgentId(null)
      return
    }

    if (selectedAgentId && activeSubagents.some((subagent) => subagent.id === selectedAgentId)) {
      return
    }

    setSelectedAgentId(selectDefaultAgentId(activeSubagents))
  }, [activeSubagents, selectedAgentId])

  useEffect(() => {
    if (!selectedSubagent) {
      setMobileSection("agents")
    }
  }, [selectedSubagent])

  useEffect(() => {
    const enforced = enforceCoreTabForMode(activeTab, detailTab)
    if (enforced !== detailTab) {
      setDetailTab(enforced)
    }
  }, [activeTab, detailTab])

  useEffect(() => {
    if (!selectedSubagent) {
      setAgentSyncRuns([])
      return
    }

    void loadAgentSyncRuns(selectedSubagent.id)
  }, [loadAgentSyncRuns, selectedSubagent])

  useEffect(() => {
    if (!selectedSubagent) {
      setContextFiles([])
      setContextTotals({ wordCount: 0, estimatedTokens: 0 })
      setContextRootPath(null)
      setAgentPermissions([])
      setPolicyAssignments([])
      setPolicyAssignmentsSnapshot("[]")
      setPolicyToAttachId("")
      setAgentToolBindings([])
      setAgentToolBindingsDraft({})
      setAgentToolBindingsSnapshot("[]")
      return
    }

    setSettingsDraft(normalizeSettings(selectedSubagent.settings))
    setAdvancedSection(nextVisibleAdvancedSection("workspace", selectedSubagent.subagentType))
    setPolicyEditor(emptyPolicyEditorState())
    setDirtySettingsSections({
      orchestration: false,
      workspace: false,
      memory: false,
      guidelines: false,
      capabilities: false,
      harness: false,
    })

    void loadContextFiles(selectedSubagent.id)
    void loadPermissions(selectedSubagent.id)
    void loadPolicyAssignments(selectedSubagent.id)
    void loadAgentToolBindings(selectedSubagent.id)
  }, [selectedSubagent, loadContextFiles, loadPermissions, loadPolicyAssignments, loadAgentToolBindings])

  const handleAgentSyncRealtimeUpdate = useCallback(() => {
    void loadAgentSyncPreference()
    void loadAgentSyncRuns(selectedSubagent?.id || null)
  }, [loadAgentSyncPreference, loadAgentSyncRuns, selectedSubagent])

  useEventStream({
    enabled: activeTab === "personal",
    types: ["agentsync.updated"],
    onEvent: handleAgentSyncRealtimeUpdate,
  })

  const setActiveTab = (tab: PersonalTab) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", tab)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const closeForm = () => {
    setShowCreateForm(false)
    setEditingId(null)
    setFormData(EMPTY_FORM)
  }

  const handleBootstrapBridgeCrew = useCallback(async (auto = false) => {
    const seedsToCreate = [...missingInitialBridgeCrew]
    if (seedsToCreate.length === 0) {
      if (!auto) {
        setMessage({ type: "info", text: "Initial bridge crew is already present." })
      }
      return
    }

    setIsBootstrappingCrew(true)
    if (!auto) {
      setMessage(null)
    }

    let created = 0
    const failures: string[] = []

    for (const seed of seedsToCreate) {
      try {
        const response = await fetch("/api/subagents", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(seed),
        })

        if (response.ok) {
          created += 1
        } else {
          failures.push(`${seed.name}: ${await readApiError(response)}`)
        }
      } catch (error) {
        failures.push(`${seed.name}: ${(error as Error).message}`)
      }
    }

    await fetchSubagents()
    setIsBootstrappingCrew(false)

    if (failures.length === 0) {
      setMessage({
        type: "success",
        text: `Initialized ${created} bridge crew agent${created === 1 ? "" : "s"}.`,
      })
      return
    }

    if (created > 0) {
      setMessage({
        type: "error",
        text: `Initialized ${created} bridge crew agents, but ${failures.length} failed (${failures.join(" | ")}).`,
      })
      return
    }

    setMessage({ type: "error", text: `Failed to initialize bridge crew (${failures.join(" | ")}).` })
  }, [fetchSubagents, missingInitialBridgeCrew])

  useEffect(() => {
    if (isLoading) return
    if (autoBootstrapAttemptedRef.current) return
    if (personalSubagents.length > 0) return

    autoBootstrapAttemptedRef.current = true
    void handleBootstrapBridgeCrew(true)
  }, [handleBootstrapBridgeCrew, isLoading, personalSubagents.length])

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (activeTab !== "personal") {
      setMessage({ type: "error", text: "Shared agents are read-only on this page." })
      return
    }

    setIsCreating(true)
    setMessage(null)

    try {
      const response = await fetch("/api/subagents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formData,
          isShared: false,
        }),
      })

      const payload = await response.json()
      if (!response.ok) {
        setMessage({ type: "error", text: payload?.error || "Failed to create personal agent" })
        return
      }

      setMessage({ type: "success", text: "Personal agent created" })
      closeForm()
      await fetchSubagents()
      setSelectedAgentId(payload.id)
    } catch (error) {
      console.error("Error creating subagent:", error)
      setMessage({ type: "error", text: "Failed to create personal agent" })
    } finally {
      setIsCreating(false)
    }
  }

  const handleUpdate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!editingId) return

    const target = allSubagents.find((subagent) => subagent.id === editingId)
    if (!target) {
      setMessage({ type: "error", text: "Agent no longer exists." })
      closeForm()
      return
    }
    if (target.isShared) {
      setMessage({ type: "error", text: "Shared agents are read-only on this page." })
      closeForm()
      return
    }

    setIsUpdating(true)
    setMessage(null)

    try {
      const response = await fetch(`/api/subagents/${editingId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formData,
          isShared: false,
        }),
      })

      const payload = await response.json()
      if (!response.ok) {
        setMessage({ type: "error", text: payload?.error || "Failed to update personal agent" })
        return
      }

      setMessage({ type: "success", text: "Personal agent updated" })
      closeForm()
      await fetchSubagents()
    } catch (error) {
      console.error("Error updating subagent:", error)
      setMessage({ type: "error", text: "Failed to update personal agent" })
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDelete = async (id: string) => {
    const target = allSubagents.find((subagent) => subagent.id === id)
    if (!target) {
      setMessage({ type: "error", text: "Agent no longer exists." })
      return
    }
    if (target.isShared) {
      setMessage({ type: "error", text: "Shared agents are read-only on this page." })
      return
    }

    if (!confirm("Are you sure you want to delete this personal agent?")) return

    try {
      const response = await fetch(`/api/subagents/${id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        setMessage({ type: "error", text: "Failed to delete personal agent" })
        return
      }

      setMessage({ type: "success", text: "Personal agent deleted" })
      await fetchSubagents()
      if (selectedAgentId === id) {
        setSelectedAgentId(null)
      }
    } catch (error) {
      console.error("Error deleting subagent:", error)
      setMessage({ type: "error", text: "Failed to delete personal agent" })
    }
  }

  const updateContextFile = (fileName: string, nextContent: string) => {
    setContextFiles((current) => {
      const updated = current.map((file) =>
        file.fileName === fileName
          ? {
              ...file,
              content: nextContent,
              size: toContextSize(nextContent),
            }
          : file,
      )

      setContextTotals(toTotalContextSize(updated))
      return updated
    })
    setIsContextDirty(true)
  }

  const saveContextFiles = async () => {
    if (!selectedSubagent) return
    if (selectedSubagent.isShared) {
      setMessage({ type: "error", text: "Shared agents are read-only on this page." })
      return
    }

    setIsContextSaving(true)
    setMessage(null)

    try {
      const response = await fetch(`/api/subagents/${selectedSubagent.id}/context-files`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          files: contextFiles.map((file) => ({ fileName: file.fileName, content: file.content })),
        }),
      })

      const payload = await response.json()
      if (!response.ok) {
        setMessage({ type: "error", text: payload?.error || "Unable to save context files" })
        return
      }

      const files = Array.isArray(payload?.files)
        ? payload.files.map((entry: any) => ({
          fileName: entry.fileName,
          content: entry.content,
          relativePath: entry.relativePath,
          size: {
            wordCount: Number(entry?.size?.wordCount) || 0,
            estimatedTokens: Number(entry?.size?.estimatedTokens) || 0,
          },
        }))
        : []

      setContextSource(payload?.source === "filesystem" ? "filesystem" : "content-fallback")
      setContextRootPath(typeof payload?.rootPath === "string" ? payload.rootPath : null)
      setContextFiles(files)
      setContextTotals({
        wordCount: Number(payload?.totals?.wordCount) || 0,
        estimatedTokens: Number(payload?.totals?.estimatedTokens) || 0,
      })
      setIsContextDirty(false)
      setAllSubagents((current) =>
        current.map((entry) =>
          entry.id === selectedSubagent.id
            ? {
                ...entry,
                content: typeof payload?.content === "string" ? payload.content : entry.content,
                path: typeof payload?.path === "string" ? payload.path : entry.path,
              }
            : entry,
        ),
      )

      setMessage({ type: "success", text: "Context files saved" })
    } catch (error) {
      console.error("Error saving context files:", error)
      setMessage({ type: "error", text: "Unable to save context files" })
    } finally {
      setIsContextSaving(false)
    }
  }

  const markSettingsDirty = (section: EditableSettingsSection) => {
    setDirtySettingsSections((current) => ({ ...current, [section]: true }))
  }

  const saveSettingsSection = async (section: EditableSettingsSection) => {
    if (!selectedSubagent) return
    if (selectedSubagent.isShared) {
      setMessage({ type: "error", text: "Shared agents are read-only on this page." })
      return
    }

    setIsSavingSettings((current) => ({ ...current, [section]: true }))
    setMessage(null)

    try {
      const response = await fetch(`/api/subagents/${selectedSubagent.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          settings: {
            [section]: settingsDraft[section],
          },
        }),
      })

      const payload = await response.json()
      if (!response.ok) {
        setMessage({ type: "error", text: payload?.error || "Unable to save settings" })
        return
      }

      const normalized = normalizeSubagent(payload)
      setAllSubagents((current) => current.map((subagent) => (subagent.id === normalized.id ? normalized : subagent)))
      setSettingsDraft(normalized.settings)
      setDirtySettingsSections((current) => ({ ...current, [section]: false }))
      setMessage({ type: "success", text: `${section[0].toUpperCase()}${section.slice(1)} settings saved` })
    } catch (error) {
      console.error("Error saving subagent settings:", error)
      setMessage({ type: "error", text: "Unable to save settings" })
    } finally {
      setIsSavingSettings((current) => ({ ...current, [section]: false }))
    }
  }

  const refreshTools = async () => {
    await Promise.all([
      loadToolCatalog({ refreshMode: "force", manual: true }),
      loadToolImportRuns(),
    ])
  }

  const importCuratedTool = async (toolSlug: string) => {
    setImportingCuratedSlug(toolSlug)
    setMessage(null)

    try {
      const response = await fetch("/api/tools/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "curated",
          toolSlug,
        }),
      })

      if (!response.ok) {
        setMessage({ type: "error", text: await readApiError(response) })
      } else {
        setMessage({ type: "success", text: `Imported ${toolSlug}` })
      }
    } catch (error) {
      console.error("Failed to import curated tool:", error)
      setMessage({ type: "error", text: "Unable to import curated tool" })
    } finally {
      setImportingCuratedSlug(null)
      await refreshTools()
    }
  }

  const importToolFromGithubUrl = async () => {
    const githubUrl = githubToolUrlDraft.trim()
    if (!githubUrl) {
      return
    }

    setIsImportingGithubUrl(true)
    setMessage(null)

    try {
      const response = await fetch("/api/tools/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "github_url",
          githubUrl,
        }),
      })

      if (!response.ok) {
        setMessage({ type: "error", text: await readApiError(response) })
      } else {
        setGithubToolUrlDraft("")
        setMessage({ type: "success", text: "Imported tool from GitHub URL" })
      }
    } catch (error) {
      console.error("Failed to import tool from GitHub URL:", error)
      setMessage({ type: "error", text: "Unable to import tool from GitHub URL" })
    } finally {
      setIsImportingGithubUrl(false)
      await refreshTools()
    }
  }

  const toggleAgentToolBinding = (toolCatalogEntryId: string, enabled: boolean) => {
    setAgentToolBindingsDraft((current) => ({
      ...current,
      [toolCatalogEntryId]: enabled,
    }))
  }

  const saveAgentToolBindings = async () => {
    if (!selectedSubagent) return
    if (selectedSubagent.isShared || activeTab !== "personal") {
      setMessage({ type: "error", text: "Shared agents are read-only on this page." })
      return
    }

    setIsAgentToolBindingsSaving(true)
    setMessage(null)

    try {
      const payloadBindings = Object.keys(agentToolBindingsDraft).map((toolCatalogEntryId) => ({
        toolCatalogEntryId,
        enabled: agentToolBindingsDraft[toolCatalogEntryId] === true,
      }))

      const response = await fetch(`/api/subagents/${selectedSubagent.id}/tool-bindings`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bindings: payloadBindings,
        }),
      })

      if (!response.ok) {
        setMessage({ type: "error", text: await readApiError(response) })
        return
      }

      const responsePayload = await response.json()
      const bindings = Array.isArray(responsePayload?.bindings)
        ? responsePayload.bindings
            .map((entry: any) => normalizeSubagentToolBinding(entry))
            .filter((entry: SubagentToolBindingView | null): entry is SubagentToolBindingView => Boolean(entry))
        : []

      const draft = draftFromBindings(bindings)
      setAgentToolBindings(bindings)
      setAgentToolBindingsDraft(draft)
      setAgentToolBindingsSnapshot(serializeToolBindingDraft(draft))
      setMessage({ type: "success", text: "Agent tool bindings saved." })
    } catch (error) {
      console.error("Failed to save agent tool bindings:", error)
      setMessage({ type: "error", text: "Unable to save tool bindings" })
    } finally {
      setIsAgentToolBindingsSaving(false)
    }
  }

  const createPermission = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedSubagent) return

    if (selectedSubagent.isShared) {
      setMessage({ type: "error", text: "Shared agents are read-only on this page." })
      return
    }

    setIsCreatingPermission(true)
    setMessage(null)

    try {
      const response = await fetch("/api/permissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          commandPattern: permissionDraft.commandPattern,
          type: permissionDraft.type,
          status: permissionDraft.status,
          scope: "subagent",
          subagentId: selectedSubagent.id,
          sourceFile: permissionDraft.sourceFile || null,
          isShared: false,
        }),
      })

      if (!response.ok) {
        setMessage({ type: "error", text: await readApiError(response) })
        return
      }

      setPermissionDraft({
        commandPattern: "",
        type: "bash_command",
        status: "allow",
        sourceFile: "",
      })
      await loadPermissions(selectedSubagent.id)
      setMessage({ type: "success", text: "Permission rule created" })
    } catch (error) {
      console.error("Error creating permission:", error)
      setMessage({ type: "error", text: "Unable to create permission rule" })
    } finally {
      setIsCreatingPermission(false)
    }
  }

  const deletePermission = async (permissionId: string) => {
    if (!confirm("Delete this permission rule?")) return

    try {
      const response = await fetch(`/api/permissions/${permissionId}`, { method: "DELETE" })
      if (!response.ok) {
        setMessage({ type: "error", text: await readApiError(response) })
        return
      }

      if (selectedSubagent) {
        await loadPermissions(selectedSubagent.id)
      }
      setMessage({ type: "success", text: "Permission rule deleted" })
    } catch (error) {
      console.error("Error deleting permission:", error)
      setMessage({ type: "error", text: "Unable to delete permission rule" })
    }
  }

  const savePolicyAssignments = async (nextAssignments: PolicyAssignment[], successText: string) => {
    if (!selectedSubagent) return
    if (selectedSubagent.isShared) {
      setMessage({ type: "error", text: "Shared agents are read-only on this page." })
      return
    }

    setIsPolicyAssignmentSaving(true)
    setMessage(null)

    try {
      const response = await fetch(`/api/subagents/${selectedSubagent.id}/permission-policies`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assignments: nextAssignments.map((assignment) => ({
            policyId: assignment.policyId,
            priority: Math.trunc(assignment.priority),
            enabled: Boolean(assignment.enabled),
          })),
        }),
      })

      if (!response.ok) {
        setMessage({ type: "error", text: await readApiError(response) })
        return
      }

      const payload = await response.json()
      const normalized = Array.isArray(payload)
        ? payload
            .filter((entry: any) => entry && typeof entry.policyId === "string")
            .map((entry: any) => ({
              policyId: entry.policyId,
              priority: Number.isFinite(entry.priority) ? Number(entry.priority) : 100,
              enabled: Boolean(entry.enabled),
            }))
        : []

      const snapshot = serializePolicyAssignments(normalized)
      setPolicyAssignments(normalized)
      setPolicyAssignmentsSnapshot(snapshot)
      setMessage({ type: "success", text: successText })
    } catch (error) {
      console.error("Failed to save policy assignments:", error)
      setMessage({ type: "error", text: "Unable to save policy assignments" })
    } finally {
      setIsPolicyAssignmentSaving(false)
    }
  }

  const attachPolicyToAgent = (policyId: string) => {
    if (!policyId) return

    setPolicyAssignments((current) => {
      if (current.some((assignment) => assignment.policyId === policyId)) {
        return current
      }
      return [
        ...current,
        {
          policyId,
          priority: 100,
          enabled: true,
        },
      ]
    })
    setPolicyToAttachId("")
  }

  const removePolicyAssignment = (policyId: string) => {
    setPolicyAssignments((current) => current.filter((assignment) => assignment.policyId !== policyId))
  }

  const updatePolicyAssignment = (policyId: string, patch: Partial<PolicyAssignment>) => {
    setPolicyAssignments((current) =>
      current.map((assignment) =>
        assignment.policyId === policyId
          ? {
              ...assignment,
              ...patch,
            }
          : assignment,
      ),
    )
  }

  const assignQuickPreset = async (slug: string) => {
    if (!selectedSubagent) return
    const preset = policyLibrary.find((policy) => policy.slug === slug)
    if (!preset) {
      setMessage({ type: "error", text: "Preset policy not found in library." })
      return
    }

    await savePolicyAssignments(
      [{ policyId: preset.id, priority: 100, enabled: true }],
      `Assigned ${preset.name} preset`,
    )
  }

  const addPolicyEditorRule = () => {
    setPolicyEditor((current) => ({
      ...current,
      rules: [
        ...current.rules,
        {
          commandPattern: "",
          type: "bash_command",
          status: "allow",
          sortOrder: (current.rules.length + 1) * 10,
        },
      ],
    }))
  }

  const updatePolicyEditorRule = (index: number, patch: Partial<PermissionPolicyRule>) => {
    setPolicyEditor((current) => ({
      ...current,
      rules: current.rules.map((rule, ruleIndex) =>
        ruleIndex === index
          ? {
              ...rule,
              ...patch,
            }
          : rule,
      ),
    }))
  }

  const removePolicyEditorRule = (index: number) => {
    setPolicyEditor((current) => ({
      ...current,
      rules: current.rules.filter((_, ruleIndex) => ruleIndex !== index),
    }))
  }

  const editPolicyFromLibrary = (policy: PermissionPolicy) => {
    if (policy.isSystem) {
      setMessage({ type: "info", text: "System policy profiles are immutable." })
      return
    }

    setPolicyEditor({
      id: policy.id,
      name: policy.name,
      description: policy.description || "",
      rules: sortPolicyRules(policy.rules).map((rule, index) => ({
        id: rule.id,
        commandPattern: rule.commandPattern,
        type: rule.type,
        status: rule.status,
        sortOrder: Number.isFinite(rule.sortOrder) ? Number(rule.sortOrder) : (index + 1) * 10,
      })),
    })
  }

  const resetPolicyEditor = () => {
    setPolicyEditor(emptyPolicyEditorState())
  }

  const savePolicyEditor = async (event: React.FormEvent) => {
    event.preventDefault()

    const trimmedName = policyEditor.name.trim()
    if (!trimmedName) {
      setMessage({ type: "error", text: "Policy name is required." })
      return
    }

    const preparedRules = sortPolicyRules(policyEditor.rules)
      .map((rule, index) => ({
        commandPattern: rule.commandPattern.trim(),
        type: rule.type,
        status: rule.status,
        sortOrder: Number.isFinite(rule.sortOrder) ? Number(rule.sortOrder) : (index + 1) * 10,
      }))
      .filter((rule) => rule.commandPattern.length > 0)

    if (preparedRules.length === 0) {
      setMessage({ type: "error", text: "Add at least one non-empty policy rule." })
      return
    }

    setIsPolicyEditorSaving(true)
    setMessage(null)

    try {
      const method = policyEditor.id ? "PUT" : "POST"
      const url = policyEditor.id ? `/api/permission-policies/${policyEditor.id}` : "/api/permission-policies"
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: trimmedName,
          description: policyEditor.description.trim() || null,
          rules: preparedRules,
        }),
      })

      if (!response.ok) {
        setMessage({ type: "error", text: await readApiError(response) })
        return
      }

      await loadPolicyLibrary()
      if (selectedSubagent) {
        await loadPolicyAssignments(selectedSubagent.id)
      }
      resetPolicyEditor()
      setMessage({ type: "success", text: "Policy profile saved" })
    } catch (error) {
      console.error("Error saving policy profile:", error)
      setMessage({ type: "error", text: "Unable to save policy profile" })
    } finally {
      setIsPolicyEditorSaving(false)
    }
  }

  const deletePolicyProfile = async (policyId: string) => {
    if (!confirm("Delete this policy profile?")) return

    try {
      const response = await fetch(`/api/permission-policies/${policyId}`, {
        method: "DELETE",
      })
      if (!response.ok) {
        setMessage({ type: "error", text: await readApiError(response) })
        return
      }

      await loadPolicyLibrary()
      if (selectedSubagent) {
        await loadPolicyAssignments(selectedSubagent.id)
      }
      if (policyEditor.id === policyId) {
        resetPolicyEditor()
      }
      setMessage({ type: "success", text: "Policy profile deleted" })
    } catch (error) {
      console.error("Error deleting policy profile:", error)
      setMessage({ type: "error", text: "Unable to delete policy profile" })
    }
  }

  const policyById = useMemo(
    () => new Map(policyLibrary.map((policy) => [policy.id, policy])),
    [policyLibrary],
  )

  const quickPresetPolicies = useMemo(
    () => QUICK_PRESET_SLUGS
      .map((slug) => policyLibrary.find((policy) => policy.slug === slug))
      .filter((policy): policy is PermissionPolicy => Boolean(policy)),
    [policyLibrary],
  )

  const assignedPolicyIds = useMemo(
    () => new Set(policyAssignments.map((assignment) => assignment.policyId)),
    [policyAssignments],
  )

  const attachablePolicies = useMemo(
    () => policyLibrary.filter((policy) => !assignedPolicyIds.has(policy.id)),
    [assignedPolicyIds, policyLibrary],
  )

  const policyAssignmentsDirty = useMemo(
    () => serializePolicyAssignments(policyAssignments) !== policyAssignmentsSnapshot,
    [policyAssignments, policyAssignmentsSnapshot],
  )

  const selectedSummary = selectedSubagent ? trimSummary(selectedSubagent.content) : ""
  const selectedContextSize = selectedSubagent
    ? (contextFiles.length > 0 || contextTotals.wordCount > 0 ? contextTotals : toContextSize(selectedSubagent.content))
    : { wordCount: 0, estimatedTokens: 0 }
  const canRunSelectedAgentSync = Boolean(selectedSubagent && !selectedSubagent.isShared && activeTab === "personal")
  const proposedHighRiskSuggestionCount = useMemo(
    () =>
      agentSyncRuns.reduce(
        (count, run) =>
          count + run.suggestions.filter((suggestion) => suggestion.risk === "high" && suggestion.status === "proposed").length,
        0,
      ),
    [agentSyncRuns],
  )
  const selectedHighRiskPendingCount = useMemo(() => {
    if (!selectedSubagent) {
      return 0
    }

    return agentSyncRuns
      .filter((run) => run.subagentId === selectedSubagent.id || run.scope === "bridge_crew")
      .reduce(
        (count, run) =>
          count + run.suggestions.filter((suggestion) => suggestion.risk === "high" && suggestion.status === "proposed").length,
        0,
      )
  }, [agentSyncRuns, selectedSubagent])
  const advancedUnreadCount = aggregateAdvancedUnreadCount(activeTab, getUnread)
  const coreTabsWithBadges = useMemo(
    () =>
      visibleCoreTabs.map((tab) => ({
        ...tab,
        badgeLabel: formatUnreadBadgeCount(getUnread([PERSONAL_DETAIL_NOTIFICATION_CHANNEL[activeTab][tab.id]])),
      })),
    [activeTab, getUnread, visibleCoreTabs],
  )
  const advancedBadgeLabel = formatUnreadBadgeCount(advancedUnreadCount)
  const selectedPolicyCoverageLabel = `${policyAssignments.filter((assignment) => assignment.enabled).length} profiles · ${agentPermissions.length} overrides`
  const personalTopBadgeLabel = formatUnreadBadgeCount(getUnread([PERSONAL_TAB_NOTIFICATION_CHANNEL.personal]))
  const sharedTopBadgeLabel = formatUnreadBadgeCount(getUnread([PERSONAL_TAB_NOTIFICATION_CHANNEL.shared]))
  const harnessSettingsDirty = dirtySettingsSections.harness
  const harnessSettingsSaving = isSavingSettings.harness
  const agentToolBindingsDirty = useMemo(
    () => serializeToolBindingDraft(agentToolBindingsDraft) !== agentToolBindingsSnapshot,
    [agentToolBindingsDraft, agentToolBindingsSnapshot],
  )
  const isSelectedMutable = Boolean(selectedSubagent && activeTab === "personal" && !selectedSubagent.isShared)
  const advancedDirtySections: Record<AdvancedSection, boolean> = {
    workspace: dirtySettingsSections.workspace,
    memory: dirtySettingsSections.memory,
    guidelines: dirtySettingsSections.guidelines,
    capabilities: dirtySettingsSections.capabilities,
  }
  const advancedSavingSections: Record<AdvancedSection, boolean> = {
    workspace: isSavingSettings.workspace,
    memory: isSavingSettings.memory,
    guidelines: isSavingSettings.guidelines,
    capabilities: isSavingSettings.capabilities,
  }
  const publicMemoryHref = "/vault?tab=explorer&vault=agent-public"
  const privateMemoryHref = "/vault?tab=explorer&vault=agent-private"
  const showAgentListPanel = !isMobileLayout || mobileSection === "agents"
  const showAgentDetailPanel = !isMobileLayout || mobileSection === "detail"

  const handleSelectAgent = (nextAgentId: string | null) => {
    setSelectedAgentId(nextAgentId)
    if (isMobileLayout && nextAgentId) {
      setMobileSection("detail")
    }
  }

  useEffect(() => {
    if (!selectedSubagent) {
      return
    }

    if (isAdvancedSectionVisible(advancedSection, selectedSubagent.subagentType)) {
      return
    }

    setAdvancedSection(nextVisibleAdvancedSection(advancedSection, selectedSubagent.subagentType))
  }, [advancedSection, selectedSubagent])

  useEffect(() => {
    if (!isSelectedMutable) {
      setIsWorkspaceInspectorOpen(false)
    }
  }, [isSelectedMutable])

  return (
    <>
      <PageLayout
        title="Personal"
        description="Manage personal agents with focused context, permissions, and runtime controls."
        actions={
          activeTab === "personal" ? (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <button
                onClick={() => {
                  setEditingId(null)
                  setFormData(EMPTY_FORM)
                  setShowCreateForm(true)
                }}
                className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black sm:w-auto dark:bg-white dark:text-slate-900"
              >
                New Personal Agent
              </button>
              {missingInitialBridgeCrew.length > 0 ? (
                <button
                  onClick={() => {
                    void handleBootstrapBridgeCrew(false)
                  }}
                  disabled={isBootstrappingCrew}
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 sm:w-auto dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/[0.08]"
                >
                  {isBootstrappingCrew ? "Initializing..." : `Initialize Bridge Crew (${missingInitialBridgeCrew.length})`}
                </button>
              ) : null}
            </div>
          ) : null
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200/80 bg-white/80 p-1 dark:border-white/10 dark:bg-white/[0.03]">
            <button
              type="button"
              onClick={() => setActiveTab("personal")}
              className={`inline-flex min-h-[38px] items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium ${
                activeTab === "personal"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.08]"
              }`}
              aria-pressed={activeTab === "personal"}
            >
              <span>Personal</span>
              {personalTopBadgeLabel ? (
                <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                  {personalTopBadgeLabel}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("shared")}
              className={`inline-flex min-h-[38px] items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium ${
                activeTab === "shared"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.08]"
              }`}
              aria-pressed={activeTab === "shared"}
            >
              <span>Shared</span>
              {sharedTopBadgeLabel ? (
                <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                  {sharedTopBadgeLabel}
                </span>
              ) : null}
            </button>
          </div>

          {message ? <InlineNotice variant={message.type}>{message.text}</InlineNotice> : null}

          {activeTab === "shared" ? (
            <InlineNotice variant="info">Shared agents are visible in compact read-only mode.</InlineNotice>
          ) : null}

          {isLoading ? (
            <SurfaceCard>Loading agents...</SurfaceCard>
          ) : activeSubagents.length === 0 ? (
            activeTab === "personal" ? (
              <SurfaceCard>
                <div className="space-y-3">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">No personal agents found</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Initialize the standard bridge crew or create an agent manually.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => {
                        void handleBootstrapBridgeCrew(false)
                      }}
                      disabled={isBootstrappingCrew}
                      className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 sm:w-auto dark:bg-white dark:text-slate-900"
                    >
                      {isBootstrappingCrew ? "Initializing..." : "Initialize Bridge Crew"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null)
                        setFormData(EMPTY_FORM)
                        setShowCreateForm(true)
                      }}
                      className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 sm:w-auto dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.08]"
                    >
                      Create manually
                    </button>
                  </div>
                </div>
              </SurfaceCard>
            ) : (
              <EmptyState title="No shared agents found" description="Shared agents will appear here automatically." />
            )
          ) : (
            <div className="space-y-4">
              {isMobileLayout ? (
                <SurfaceCard className="lg:hidden">
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200/80 bg-white/75 p-1 dark:border-white/10 dark:bg-white/[0.03]">
                      <button
                        type="button"
                        onClick={() => setMobileSection("agents")}
                        className={`inline-flex min-h-[38px] items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium ${
                          mobileSection === "agents"
                            ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                            : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.08]"
                        }`}
                        aria-pressed={mobileSection === "agents"}
                      >
                        Agents
                      </button>
                      <button
                        type="button"
                        onClick={() => setMobileSection("detail")}
                        disabled={!selectedSubagent}
                        className={`inline-flex min-h-[38px] items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium ${
                          mobileSection === "detail"
                            ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                            : "text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-300 dark:hover:bg-white/[0.08]"
                        }`}
                        aria-pressed={mobileSection === "detail"}
                        aria-disabled={!selectedSubagent}
                      >
                        Detail
                      </button>
                    </div>
                    <p className="min-h-[1.25rem] text-xs text-slate-500 dark:text-slate-400">
                      {selectedSubagent ? (
                        <>
                          Selected: <span className="font-semibold text-slate-700 dark:text-slate-200">{selectedSubagent.name}</span>
                          {" · "}
                          {selectedSubagent.subagentType.replace("_", " ")}
                        </>
                      ) : (
                        "Select an agent to open detail."
                      )}
                    </p>
                  </div>
                </SurfaceCard>
              ) : null}

              {showAgentListPanel ? (
                <SurfaceCard>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Available agents</h2>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{filteredAgents.length}</span>
                  </div>
                  <div className="mt-3">
                    <AgentCardStrip
                      agents={activeSubagents}
                      filteredAgents={filteredAgents}
                      selectedAgentId={selectedAgentId}
                      onSelectAgent={handleSelectAgent}
                      searchQuery={agentSearchQuery}
                      onSearchQueryChange={setAgentSearchQuery}
                      typeFilter={agentTypeFilter}
                      onTypeFilterChange={setAgentTypeFilter}
                      statusLineForAgent={(agent) => formatAgentCardStatusLine({ estimatedTokens: toContextSize(agent.content).estimatedTokens, path: agent.path })}
                    />
                  </div>
                </SurfaceCard>
              ) : null}

              {showAgentDetailPanel ? (
                <SurfaceCard>
                  {!selectedSubagent ? (
                    <EmptyState title="Select an agent" description="Pick an agent from the list to inspect and manage its runtime." />
                  ) : (
                    <div className="space-y-4">
                      <SelectedAgentHeader
                        subagent={selectedSubagent}
                        summary={selectedSummary}
                        isMutable={isSelectedMutable}
                        contextWords={selectedContextSize.wordCount}
                        contextTokens={selectedContextSize.estimatedTokens}
                        policyCoverageLabel={selectedPolicyCoverageLabel}
                        pendingHighRiskCount={selectedHighRiskPendingCount}
                        onEditBasics={() => {
                          setEditingId(selectedSubagent.id)
                          setFormData(toFormState(selectedSubagent))
                          setShowCreateForm(true)
                        }}
                        onDelete={() => {
                          void handleDelete(selectedSubagent.id)
                        }}
                      />

                      {activeTab === "personal" ? (
                        <CoreDetailTabs
                          tabs={coreTabsWithBadges}
                          activeTab={effectiveDetailTab}
                          onTabChange={setDetailTab}
                          showAdvancedButton={!selectedSubagent.isShared}
                          advancedBadgeLabel={advancedBadgeLabel}
                          onOpenAdvanced={() => setIsAdvancedOpen(true)}
                        />
                      ) : null}

                      {effectiveDetailTab === "context" ? (
                        <ContextPanel
                          contextSource={contextSource}
                          contextRootPath={contextRootPath}
                          contextTotals={contextTotals}
                          contextFiles={contextFiles}
                          isContextLoading={isContextLoading}
                          isContextSaving={isContextSaving}
                          isContextDirty={isContextDirty}
                          readOnly={selectedSubagent.isShared || activeTab === "shared"}
                          onReload={() => {
                            void loadContextFiles(selectedSubagent.id)
                          }}
                          onSave={() => {
                            void saveContextFiles()
                          }}
                          onUpdateFile={updateContextFile}
                        />
                      ) : null}

                      {effectiveDetailTab === "permissions" ? (
                        <PermissionsPanel
                          readOnly={selectedSubagent.isShared}
                          quickPresetPolicies={quickPresetPolicies}
                          attachablePolicies={attachablePolicies}
                          policyAssignments={policyAssignments}
                          policyById={policyById}
                          policyToAttachId={policyToAttachId}
                          onPolicyToAttachChange={setPolicyToAttachId}
                          onAssignQuickPreset={(slug) => {
                            void assignQuickPreset(slug)
                          }}
                          onAttachPolicy={attachPolicyToAgent}
                          onRemovePolicyAssignment={removePolicyAssignment}
                          onUpdatePolicyAssignment={updatePolicyAssignment}
                          onSavePolicyAssignments={() => {
                            void savePolicyAssignments(policyAssignments, "Policy assignments saved")
                          }}
                          isPolicyAssignmentSaving={isPolicyAssignmentSaving}
                          policyAssignmentsDirty={policyAssignmentsDirty}
                          permissionDraft={permissionDraft}
                          onPermissionDraftChange={(patch) =>
                            setPermissionDraft((current) => ({
                              ...current,
                              ...patch,
                            }))
                          }
                          onCreatePermission={createPermission}
                          isCreatingPermission={isCreatingPermission}
                          isPermissionsLoading={isPermissionsLoading}
                          agentPermissions={agentPermissions}
                          onDeletePermission={(permissionId) => {
                            void deletePermission(permissionId)
                          }}
                        />
                      ) : null}

                      {effectiveDetailTab === "agentsync" ? (
                        <AgentSyncPanel
                          canRunSelectedAgentSync={canRunSelectedAgentSync}
                          isAgentSyncRunningSelected={isAgentSyncRunningSelected}
                          isAgentSyncRunningCrew={isAgentSyncRunningCrew}
                          proposedHighRiskSuggestionCount={proposedHighRiskSuggestionCount}
                          agentSyncPreference={agentSyncPreference}
                          isAgentSyncPreferenceLoading={isAgentSyncPreferenceLoading}
                          isAgentSyncPreferenceSaving={isAgentSyncPreferenceSaving}
                          onPreferenceChange={(patch) =>
                            setAgentSyncPreference((current) => ({
                              ...current,
                              ...patch,
                            }))
                          }
                          onSavePreference={() => {
                            void saveAgentSyncPreference()
                          }}
                          onRunAgentSync={(scope) => {
                            void runAgentSync(scope)
                          }}
                          agentSyncRuns={agentSyncRuns}
                          isAgentSyncRunsLoading={isAgentSyncRunsLoading}
                          actingSuggestionId={actingSuggestionId}
                          onApplySuggestion={(suggestionId) => {
                            void applyAgentSyncSuggestionAction(suggestionId)
                          }}
                          onRejectSuggestion={(suggestionId) => {
                            void rejectAgentSyncSuggestionAction(suggestionId)
                          }}
                        />
                      ) : null}

                      {effectiveDetailTab === "orchestration" ? (
                        <OrchestrationPanel
                          subagents={activeSubagents}
                          selectedAgentId={selectedSubagent.id}
                          onSelectedAgentIdChange={handleSelectAgent}
                        />
                      ) : null}

                      {effectiveDetailTab === "harness" ? (
                        <HarnessPanel
                          harness={settingsDraft.harness}
                          readOnly={selectedSubagent.isShared || activeTab !== "personal"}
                          isDirty={harnessSettingsDirty}
                          isSaving={harnessSettingsSaving}
                          onRuntimeProfileChange={(profile) => {
                            if (!HARNESS_RUNTIME_PROFILES.includes(profile)) {
                              return
                            }
                            setSettingsDraft((current) => ({
                              ...current,
                              harness: {
                                ...current.harness,
                                runtimeProfile: profile as HarnessRuntimeProfile,
                              },
                            }))
                            markSettingsDirty("harness")
                          }}
                          onAutoloadChange={(key, value) => {
                            setSettingsDraft((current) => ({
                              ...current,
                              harness: {
                                ...current.harness,
                                autoload: {
                                  ...current.harness.autoload,
                                  [key]: value,
                                },
                              },
                            }))
                            markSettingsDirty("harness")
                          }}
                          onApplyWhenSubagentPresentChange={(value) => {
                            setSettingsDraft((current) => ({
                              ...current,
                              harness: {
                                ...current.harness,
                                applyWhenSubagentPresent: value,
                              },
                            }))
                            markSettingsDirty("harness")
                          }}
                          onSave={() => {
                            void saveSettingsSection("harness")
                          }}
                        />
                      ) : null}

                      {effectiveDetailTab === "tools" ? (
                        <PersonalToolsPanel
                          readOnly={selectedSubagent.isShared || activeTab !== "personal"}
                          selectedAgentName={selectedSubagent.name}
                          toolCatalog={toolCatalog}
                          toolImportRuns={toolImportRuns}
                          isCatalogLoading={isToolCatalogLoading}
                          isRefreshingCatalog={isToolCatalogRefreshing}
                          importingCuratedSlug={importingCuratedSlug}
                          isImportingGithubUrl={isImportingGithubUrl}
                          githubUrlDraft={githubToolUrlDraft}
                          bindings={agentToolBindings}
                          bindingsDraft={agentToolBindingsDraft}
                          isBindingsLoading={isAgentToolBindingsLoading || isToolImportRunsLoading}
                          isBindingsSaving={isAgentToolBindingsSaving}
                          bindingsDirty={agentToolBindingsDirty}
                          onRefreshCatalog={() => {
                            void loadToolCatalog({ refreshMode: "force", manual: true })
                          }}
                          onImportCurated={(slug) => {
                            void importCuratedTool(slug)
                          }}
                          onGithubUrlDraftChange={setGithubToolUrlDraft}
                          onImportGithubUrl={() => {
                            void importToolFromGithubUrl()
                          }}
                          onToggleBinding={toggleAgentToolBinding}
                          onSaveBindings={() => {
                            void saveAgentToolBindings()
                          }}
                        />
                      ) : null}
                    </div>
                  )}
                </SurfaceCard>
              ) : null}
            </div>
          )}
        </div>
      </PageLayout>

      {activeTab === "personal" && selectedSubagent && !selectedSubagent.isShared ? (
        <AdvancedSettingsDrawer
          open={isAdvancedOpen}
          onClose={() => setIsAdvancedOpen(false)}
          activeSection={advancedSection}
          onSectionChange={setAdvancedSection}
          settingsDraft={settingsDraft}
          readOnly={selectedSubagent.isShared}
          visibleCapabilities={selectedSubagent.subagentType === "exocomp"}
          dirtySections={advancedDirtySections}
          savingSections={advancedSavingSections}
          onUpdateOrchestration={(patch) => {
            setSettingsDraft((current) => ({
              ...current,
              orchestration: {
                ...current.orchestration,
                ...patch,
              },
            }))
            markSettingsDirty("orchestration")
          }}
          onUpdateWorkspace={(patch) => {
            setSettingsDraft((current) => ({
              ...current,
              workspace: {
                ...current.workspace,
                ...patch,
              },
            }))
            markSettingsDirty("workspace")
          }}
          onUpdateMemory={(patch) => {
            setSettingsDraft((current) => ({
              ...current,
              memory: {
                ...current.memory,
                ...patch,
              },
            }))
            markSettingsDirty("memory")
          }}
          onUpdateGuidelines={(patch) => {
            setSettingsDraft((current) => ({
              ...current,
              guidelines: {
                ...current.guidelines,
                ...patch,
              },
            }))
            markSettingsDirty("guidelines")
          }}
          onUpdateCapabilities={(patch) => {
            setSettingsDraft((current) => ({
              ...current,
              capabilities: {
                ...current.capabilities,
                ...patch,
              },
            }))
            markSettingsDirty("capabilities")
          }}
          onSaveSection={(section) => {
            void saveSettingsSection(section)
          }}
          onOpenWorkspaceInspector={() => setIsWorkspaceInspectorOpen(true)}
          publicMemoryHref={publicMemoryHref}
          privateMemoryHref={privateMemoryHref}
        />
      ) : null}

      <WorkspaceInspectorDrawer
        open={isWorkspaceInspectorOpen}
        onClose={() => setIsWorkspaceInspectorOpen(false)}
        subagentId={isSelectedMutable ? selectedSubagent?.id || null : null}
      />

      <AgentEditorDrawer
        open={activeTab === "personal" && showCreateForm}
        isEditing={Boolean(editingId)}
        isSubmitting={isCreating || isUpdating}
        formData={formData}
        onClose={closeForm}
        onSubmit={editingId ? handleUpdate : handleCreate}
        onChange={(patch) => setFormData((current) => ({ ...current, ...patch }))}
      />
    </>
  )
}
