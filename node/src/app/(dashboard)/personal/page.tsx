"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ContextOrchestrationBoard } from "@/components/subagents/ContextOrchestrationBoard"
import { EmptyState, InlineNotice, PageLayout, SurfaceCard } from "@/components/dashboard/PageLayout"
import { useNotifications } from "@/components/notifications"
import { formatUnreadBadgeCount } from "@/lib/notifications/store"
import {
  PERSONAL_DETAIL_NOTIFICATION_CHANNEL,
  PERSONAL_TAB_NOTIFICATION_CHANNEL,
} from "@/lib/notifications/channels"
import { useEventStream } from "@/lib/realtime/useEventStream"
import { buildInitialBridgeCrewSubagents } from "@/lib/subagents/bridge-crew-bootstrap"

type PersonalTab = "personal" | "shared"
type AgentDetailTab = "context" | "orchestration" | "permissions" | "agentsync" | "workspace" | "memory" | "guidelines"
type EditableSettingsSection = "orchestration" | "workspace" | "memory" | "guidelines"

interface SubagentSettings {
  orchestration: {
    handoffEnabled: boolean
    handoffMode: "manual" | "assisted" | "auto"
    riskChecksEnabled: boolean
    outputContractStrict: boolean
  }
  workspace: {
    workingDirectory: string
    includePaths: string[]
    excludePaths: string[]
  }
  memory: {
    mode: "session" | "rolling" | "ephemeral"
    maxEntries: number
    summaryStyle: "concise" | "detailed"
  }
  guidelines: {
    references: string[]
    notes: string
  }
}

interface Subagent {
  id: string
  name: string
  description: string | null
  content: string
  path: string | null
  settings: SubagentSettings
  isShared: boolean
  createdAt: string
}

interface SubagentFormState {
  name: string
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

const DETAIL_TABS: Array<{ id: AgentDetailTab; label: string }> = [
  { id: "context", label: "Context" },
  { id: "orchestration", label: "Orchestration" },
  { id: "permissions", label: "Permissions" },
  { id: "agentsync", label: "AgentSync" },
  { id: "workspace", label: "Workspace" },
  { id: "memory", label: "Memory" },
  { id: "guidelines", label: "Guidelines" },
]

const BRIDGE_AGENT_ORDER = ["XO-CB01", "OPS-ARX", "ENG-GEO", "SEC-KOR", "MED-BEV", "COU-DEA"]

const EMPTY_FORM: SubagentFormState = {
  name: "",
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

const DEFAULT_SUBAGENT_SETTINGS: SubagentSettings = {
  orchestration: {
    handoffEnabled: true,
    handoffMode: "assisted",
    riskChecksEnabled: true,
    outputContractStrict: true,
  },
  workspace: {
    workingDirectory: "",
    includePaths: [],
    excludePaths: [],
  },
  memory: {
    mode: "session",
    maxEntries: 50,
    summaryStyle: "concise",
  },
  guidelines: {
    references: [],
    notes: "",
  },
}

function parseTab(raw: string | null): PersonalTab {
  return raw === "shared" ? "shared" : "personal"
}

function toFormState(subagent: Subagent): SubagentFormState {
  return {
    name: subagent.name,
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

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function joinLines(values: string[]): string {
  return values.join("\n")
}

function normalizeSettings(value: unknown): SubagentSettings {
  if (!value || typeof value !== "object") {
    return DEFAULT_SUBAGENT_SETTINGS
  }

  const raw = value as Record<string, unknown>
  const rawOrchestration = raw.orchestration as Record<string, unknown> | undefined
  const rawWorkspace = raw.workspace as Record<string, unknown> | undefined
  const rawMemory = raw.memory as Record<string, unknown> | undefined
  const rawGuidelines = raw.guidelines as Record<string, unknown> | undefined

  const includePaths = Array.isArray(rawWorkspace?.includePaths)
    ? rawWorkspace.includePaths.filter((entry): entry is string => typeof entry === "string")
    : []
  const excludePaths = Array.isArray(rawWorkspace?.excludePaths)
    ? rawWorkspace.excludePaths.filter((entry): entry is string => typeof entry === "string")
    : []
  const references = Array.isArray(rawGuidelines?.references)
    ? rawGuidelines.references.filter((entry): entry is string => typeof entry === "string")
    : []

  const handoffMode = rawOrchestration?.handoffMode
  const memoryMode = rawMemory?.mode
  const summaryStyle = rawMemory?.summaryStyle

  return {
    orchestration: {
      handoffEnabled:
        typeof rawOrchestration?.handoffEnabled === "boolean"
          ? rawOrchestration.handoffEnabled
          : DEFAULT_SUBAGENT_SETTINGS.orchestration.handoffEnabled,
      handoffMode:
        handoffMode === "manual" || handoffMode === "assisted" || handoffMode === "auto"
          ? handoffMode
          : DEFAULT_SUBAGENT_SETTINGS.orchestration.handoffMode,
      riskChecksEnabled:
        typeof rawOrchestration?.riskChecksEnabled === "boolean"
          ? rawOrchestration.riskChecksEnabled
          : DEFAULT_SUBAGENT_SETTINGS.orchestration.riskChecksEnabled,
      outputContractStrict:
        typeof rawOrchestration?.outputContractStrict === "boolean"
          ? rawOrchestration.outputContractStrict
          : DEFAULT_SUBAGENT_SETTINGS.orchestration.outputContractStrict,
    },
    workspace: {
      workingDirectory:
        typeof rawWorkspace?.workingDirectory === "string"
          ? rawWorkspace.workingDirectory
          : DEFAULT_SUBAGENT_SETTINGS.workspace.workingDirectory,
      includePaths,
      excludePaths,
    },
    memory: {
      mode:
        memoryMode === "session" || memoryMode === "rolling" || memoryMode === "ephemeral"
          ? memoryMode
          : DEFAULT_SUBAGENT_SETTINGS.memory.mode,
      maxEntries:
        typeof rawMemory?.maxEntries === "number" && Number.isFinite(rawMemory.maxEntries)
          ? Math.max(1, Math.min(1000, Math.round(rawMemory.maxEntries)))
          : DEFAULT_SUBAGENT_SETTINGS.memory.maxEntries,
      summaryStyle:
        summaryStyle === "concise" || summaryStyle === "detailed"
          ? summaryStyle
          : DEFAULT_SUBAGENT_SETTINGS.memory.summaryStyle,
    },
    guidelines: {
      references,
      notes: typeof rawGuidelines?.notes === "string" ? rawGuidelines.notes : "",
    },
  }
}

function normalizeSubagent(raw: any): Subagent {
  return {
    ...raw,
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
  const [detailTab, setDetailTab] = useState<AgentDetailTab>("context")
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
  })
  const [isSavingSettings, setIsSavingSettings] = useState<Record<EditableSettingsSection, boolean>>({
    orchestration: false,
    workspace: false,
    memory: false,
    guidelines: false,
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
  const autoBootstrapAttemptedRef = useRef(false)

  const activeTab = parseTab(searchParams.get("tab"))
  const activeTopChannel = PERSONAL_TAB_NOTIFICATION_CHANNEL[activeTab]
  const activeDetailChannel = PERSONAL_DETAIL_NOTIFICATION_CHANNEL[activeTab][detailTab]
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
    void loadPolicyLibrary()
  }, [loadPolicyLibrary])

  useEffect(() => {
    void loadAgentSyncPreference()
  }, [loadAgentSyncPreference])

  useEffect(() => {
    if (activeTab === "shared") {
      setShowCreateForm(false)
      setEditingId(null)
      setFormData(EMPTY_FORM)
    }
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
      return
    }

    setSettingsDraft(normalizeSettings(selectedSubagent.settings))
    setPolicyEditor(emptyPolicyEditorState())
    setDirtySettingsSections({
      orchestration: false,
      workspace: false,
      memory: false,
      guidelines: false,
    })

    void loadContextFiles(selectedSubagent.id)
    void loadPermissions(selectedSubagent.id)
    void loadPolicyAssignments(selectedSubagent.id)
  }, [selectedSubagent, loadContextFiles, loadPermissions, loadPolicyAssignments])

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
  const activeDetailTabLabel = DETAIL_TABS.find((tab) => tab.id === detailTab)?.label || "Context"

  return (
    <PageLayout
      title="Personal"
      description="Manage personal agents with focused context, permissions, and runtime controls."
      actions={
        activeTab === "personal" ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                void handleBootstrapBridgeCrew(false)
              }}
              disabled={isBootstrappingCrew || missingInitialBridgeCrew.length === 0}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/[0.08]"
            >
              {isBootstrappingCrew
                ? "Initializing..."
                : missingInitialBridgeCrew.length === 0
                  ? "Bridge Crew Ready"
                  : `Initialize Bridge Crew (${missingInitialBridgeCrew.length})`}
            </button>
            <button
              onClick={() => {
                setEditingId(null)
                setFormData(EMPTY_FORM)
                setShowCreateForm(true)
              }}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black dark:bg-white dark:text-slate-900"
            >
              New Personal Agent
            </button>
          </div>
        ) : null
      }
    >
      <div className="space-y-4">
        <div className="inline-flex rounded-lg border border-slate-200/80 bg-white/80 p-1 dark:border-white/10 dark:bg-white/[0.03]">
          <button
            type="button"
            onClick={() => setActiveTab("personal")}
            className={`inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium ${
              activeTab === "personal"
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.08]"
            }`}
          >
            <span>Personal</span>
            {(() => {
              const badgeLabel = formatUnreadBadgeCount(getUnread([PERSONAL_TAB_NOTIFICATION_CHANNEL.personal]))
              if (!badgeLabel) return null
              return (
                <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                  {badgeLabel}
                </span>
              )
            })()}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("shared")}
            className={`inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium ${
              activeTab === "shared"
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.08]"
            }`}
          >
            <span>Shared</span>
            {(() => {
              const badgeLabel = formatUnreadBadgeCount(getUnread([PERSONAL_TAB_NOTIFICATION_CHANNEL.shared]))
              if (!badgeLabel) return null
              return (
                <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                  {badgeLabel}
                </span>
              )
            })()}
          </button>
        </div>

        {message && <InlineNotice variant={message.type}>{message.text}</InlineNotice>}

        {activeTab === "shared" && <InlineNotice variant="info">Shared agents are visible in read-only mode.</InlineNotice>}

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
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-slate-900"
                  >
                    {isBootstrappingCrew ? "Initializing..." : "Initialize Bridge Crew"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(true)}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.08]"
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
            <SurfaceCard className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Available agents</h2>
                <span className="text-xs text-slate-500 dark:text-slate-400">{activeSubagents.length}</span>
              </div>

              <div className="overflow-x-auto pb-1">
                <div className="flex min-w-max gap-2">
                  {activeSubagents.map((subagent) => {
                    const isSelected = subagent.id === selectedAgentId
                    const size = toContextSize(subagent.content)

                    return (
                      <button
                        key={subagent.id}
                        type="button"
                        onClick={() => setSelectedAgentId(subagent.id)}
                        className={`min-w-[260px] max-w-[320px] rounded-xl border px-3 py-3 text-left transition ${
                          isSelected
                            ? "border-cyan-500/45 bg-cyan-500/10"
                            : "border-slate-300/70 bg-white/80 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{subagent.name}</p>
                            <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">
                              {subagent.description || "No description"}
                            </p>
                          </div>
                          {subagent.isShared && (
                            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">
                              Shared
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                          <span>{size.wordCount} words</span>
                          <span>~{size.estimatedTokens} tokens</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </SurfaceCard>

            <SurfaceCard>
              {!selectedSubagent ? (
                <EmptyState title="Select an agent" description="Pick an agent from the grid to inspect and manage its context." />
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{selectedSubagent.name}</h2>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{selectedSummary}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{selectedSubagent.path || "No path configured"}</p>
                      <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                        Total context size: {selectedContextSize.wordCount} words (~{selectedContextSize.estimatedTokens} tokens)
                      </p>
                    </div>

                    {activeTab === "personal" && !selectedSubagent.isShared && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(selectedSubagent.id)
                            setFormData(toFormState(selectedSubagent))
                            setShowCreateForm(true)
                          }}
                          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.08]"
                        >
                          Edit basics
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(selectedSubagent.id)}
                          className="rounded-lg border border-rose-500/35 px-3 py-2 text-sm text-rose-700 hover:bg-rose-500/10 dark:text-rose-300"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {DETAIL_TABS.map((tab) => {
                      const channel = PERSONAL_DETAIL_NOTIFICATION_CHANNEL[activeTab][tab.id]
                      const badgeLabel = formatUnreadBadgeCount(getUnread([channel]))
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setDetailTab(tab.id)}
                          className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-sm ${
                            detailTab === tab.id
                              ? "border-cyan-500/45 bg-cyan-500/12 text-cyan-700 dark:text-cyan-200"
                              : "border-slate-300/70 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/[0.06]"
                          }`}
                        >
                          <span>{tab.label}</span>
                          {badgeLabel && (
                            <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                              {badgeLabel}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>

                  <div className="rounded-lg border border-slate-200/80 bg-slate-50/70 p-3 text-xs text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">
                    <p className="uppercase tracking-[0.14em] text-[10px] text-slate-500">Editing Focus</p>
                    <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-200">
                      {selectedSubagent.name} / {activeDetailTabLabel}
                    </p>
                    <p className="mt-1">
                      Context source: {contextSource === "filesystem" ? "Filesystem" : "Content fallback"}
                      {contextRootPath ? ` / ${contextRootPath}` : ""}
                    </p>
                    <p className="mt-1">
                      Total context size: {selectedContextSize.wordCount} words (~{selectedContextSize.estimatedTokens} tokens)
                    </p>
                  </div>

                  {detailTab === "context" && (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-slate-200/80 bg-slate-50/70 p-3 text-xs text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span>
                            Source: <span className="font-semibold">{contextSource === "filesystem" ? "Filesystem" : "Content fallback"}</span>
                          </span>
                          <span>
                            Total: <span className="font-semibold">{contextTotals.wordCount} words</span> · <span className="font-semibold">~{contextTotals.estimatedTokens} tokens</span>
                          </span>
                        </div>
                        {contextRootPath && <p className="mt-1">Root: {contextRootPath}</p>}
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
                              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <p className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">{file.fileName}</p>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">{file.relativePath}</p>
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  {file.size.wordCount} words · ~{file.size.estimatedTokens} tokens
                                </p>
                              </div>
                              <textarea
                                value={file.content}
                                onChange={(event) => updateContextFile(file.fileName, event.target.value)}
                                rows={6}
                                disabled={selectedSubagent.isShared}
                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 disabled:opacity-60 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (selectedSubagent) {
                              void loadContextFiles(selectedSubagent.id)
                            }
                          }}
                          disabled={isContextLoading}
                          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.08]"
                        >
                          Reload
                        </button>
                        <button
                          type="button"
                          onClick={() => void saveContextFiles()}
                          disabled={selectedSubagent.isShared || isContextSaving || !isContextDirty}
                          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-slate-900"
                        >
                          {isContextSaving ? "Saving..." : "Save Context"}
                        </button>
                      </div>
                    </div>
                  )}

                  {detailTab === "orchestration" && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <label className="flex items-center justify-between rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.03]">
                          Handoff enabled
                          <input
                            type="checkbox"
                            checked={settingsDraft.orchestration.handoffEnabled}
                            disabled={selectedSubagent.isShared}
                            onChange={(event) => {
                              setSettingsDraft((current) => ({
                                ...current,
                                orchestration: {
                                  ...current.orchestration,
                                  handoffEnabled: event.target.checked,
                                },
                              }))
                              markSettingsDirty("orchestration")
                            }}
                          />
                        </label>

                        <label className="flex items-center justify-between rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.03]">
                          Risk checks enabled
                          <input
                            type="checkbox"
                            checked={settingsDraft.orchestration.riskChecksEnabled}
                            disabled={selectedSubagent.isShared}
                            onChange={(event) => {
                              setSettingsDraft((current) => ({
                                ...current,
                                orchestration: {
                                  ...current.orchestration,
                                  riskChecksEnabled: event.target.checked,
                                },
                              }))
                              markSettingsDirty("orchestration")
                            }}
                          />
                        </label>

                        <label className="flex items-center justify-between rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.03]">
                          Output contract strict
                          <input
                            type="checkbox"
                            checked={settingsDraft.orchestration.outputContractStrict}
                            disabled={selectedSubagent.isShared}
                            onChange={(event) => {
                              setSettingsDraft((current) => ({
                                ...current,
                                orchestration: {
                                  ...current.orchestration,
                                  outputContractStrict: event.target.checked,
                                },
                              }))
                              markSettingsDirty("orchestration")
                            }}
                          />
                        </label>

                        <label className="rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.03]">
                          Handoff mode
                          <select
                            value={settingsDraft.orchestration.handoffMode}
                            disabled={selectedSubagent.isShared}
                            onChange={(event) => {
                              setSettingsDraft((current) => ({
                                ...current,
                                orchestration: {
                                  ...current.orchestration,
                                  handoffMode: event.target.value as "manual" | "assisted" | "auto",
                                },
                              }))
                              markSettingsDirty("orchestration")
                            }}
                            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                          >
                            <option value="manual">manual</option>
                            <option value="assisted">assisted</option>
                            <option value="auto">auto</option>
                          </select>
                        </label>
                      </div>

                      <button
                        type="button"
                        onClick={() => void saveSettingsSection("orchestration")}
                        disabled={selectedSubagent.isShared || isSavingSettings.orchestration || !dirtySettingsSections.orchestration}
                        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-slate-900"
                      >
                        {isSavingSettings.orchestration ? "Saving..." : "Save Orchestration"}
                      </button>
                    </div>
                  )}

                  {detailTab === "permissions" && (
                    <div className="space-y-4">
                      <div className="rounded-lg border border-slate-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Assigned Profiles</h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Assign reusable policy profiles to this agent. Direct overrides still take precedence.
                            </p>
                          </div>
                          {selectedSubagent.isShared && (
                            <span className="rounded-full border border-slate-300 px-2 py-0.5 text-xs text-slate-500 dark:border-white/15 dark:text-slate-400">
                              Read-only (shared agent)
                            </span>
                          )}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {quickPresetPolicies.map((preset) => (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => void assignQuickPreset(preset.slug)}
                              disabled={selectedSubagent.isShared || isPolicyAssignmentSaving}
                              className="rounded-lg border border-cyan-500/35 px-3 py-1.5 text-xs text-cyan-700 hover:bg-cyan-500/10 disabled:opacity-50 dark:text-cyan-300"
                            >
                              Quick preset: {preset.name}
                            </button>
                          ))}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <select
                            value={policyToAttachId}
                            onChange={(event) => setPolicyToAttachId(event.target.value)}
                            disabled={selectedSubagent.isShared || attachablePolicies.length === 0}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                          >
                            <option value="">Attach profile...</option>
                            {attachablePolicies.map((policy) => (
                              <option key={policy.id} value={policy.id}>
                                {policy.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => attachPolicyToAgent(policyToAttachId)}
                            disabled={selectedSubagent.isShared || !policyToAttachId}
                            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.08]"
                          >
                            Attach
                          </button>
                        </div>

                        {policyAssignments.length === 0 ? (
                          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No profiles assigned.</p>
                        ) : (
                          <div className="mt-3 space-y-2">
                            {policyAssignments
                              .slice()
                              .sort((left, right) => left.priority - right.priority)
                              .map((assignment) => {
                                const policy = policyById.get(assignment.policyId)
                                if (!policy) {
                                  return null
                                }

                                return (
                                  <div
                                    key={assignment.policyId}
                                    className="rounded-lg border border-slate-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.03]"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div>
                                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{policy.name}</p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                          {policy.slug} · {policy.rules.length} rule{policy.rules.length === 1 ? "" : "s"}
                                        </p>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => removePolicyAssignment(assignment.policyId)}
                                        disabled={selectedSubagent.isShared}
                                        className="rounded-lg border border-rose-500/35 px-2 py-1 text-xs text-rose-700 hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-300"
                                      >
                                        Remove
                                      </button>
                                    </div>

                                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                                      <label className="text-xs text-slate-600 dark:text-slate-300">
                                        Priority (lower runs first)
                                        <input
                                          type="number"
                                          value={assignment.priority}
                                          disabled={selectedSubagent.isShared}
                                          onChange={(event) =>
                                            updatePolicyAssignment(assignment.policyId, {
                                              priority: Number(event.target.value) || 0,
                                            })
                                          }
                                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                                        />
                                      </label>
                                      <label className="inline-flex items-center justify-between rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2 text-sm text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200">
                                        Enabled
                                        <input
                                          type="checkbox"
                                          checked={assignment.enabled}
                                          disabled={selectedSubagent.isShared}
                                          onChange={(event) =>
                                            updatePolicyAssignment(assignment.policyId, {
                                              enabled: event.target.checked,
                                            })
                                          }
                                        />
                                      </label>
                                    </div>
                                  </div>
                                )
                              })}
                          </div>
                        )}

                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() => void savePolicyAssignments(policyAssignments, "Policy assignments saved")}
                            disabled={selectedSubagent.isShared || isPolicyAssignmentSaving || !policyAssignmentsDirty}
                            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-slate-900"
                          >
                            {isPolicyAssignmentSaving ? "Saving..." : "Save Assigned Profiles"}
                          </button>
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Policy Library</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Create and maintain reusable profile bundles. System profiles are immutable.
                        </p>

                        <form onSubmit={savePolicyEditor} className="mt-3 space-y-2 rounded-lg border border-slate-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                            <input
                              type="text"
                              value={policyEditor.name}
                              onChange={(event) => setPolicyEditor((current) => ({ ...current, name: event.target.value }))}
                              placeholder="Profile name"
                              required
                              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                            />
                            <input
                              type="text"
                              value={policyEditor.description}
                              onChange={(event) => setPolicyEditor((current) => ({ ...current, description: event.target.value }))}
                              placeholder="Description (optional)"
                              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                            />
                          </div>

                          <div className="space-y-2">
                            {policyEditor.rules.map((rule, index) => (
                              <div key={`${rule.id || "draft"}-${index}`} className="grid grid-cols-1 gap-2 md:grid-cols-12">
                                <input
                                  type="text"
                                  value={rule.commandPattern}
                                  onChange={(event) => updatePolicyEditorRule(index, { commandPattern: event.target.value })}
                                  placeholder="command pattern"
                                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 md:col-span-6 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                                />
                                <select
                                  value={rule.status}
                                  onChange={(event) =>
                                    updatePolicyEditorRule(index, { status: event.target.value as "allow" | "ask" | "deny" })
                                  }
                                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 md:col-span-2 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                                >
                                  <option value="allow">allow</option>
                                  <option value="ask">ask</option>
                                  <option value="deny">deny</option>
                                </select>
                                <select
                                  value={rule.type}
                                  onChange={(event) =>
                                    updatePolicyEditorRule(index, { type: event.target.value as "bash_command" | "tool_command" })
                                  }
                                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 md:col-span-2 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                                >
                                  <option value="bash_command">bash_command</option>
                                  <option value="tool_command">tool_command</option>
                                </select>
                                <div className="flex gap-2 md:col-span-2">
                                  <input
                                    type="number"
                                    value={rule.sortOrder}
                                    onChange={(event) =>
                                      updatePolicyEditorRule(index, { sortOrder: Number(event.target.value) || 0 })
                                    }
                                    className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removePolicyEditorRule(index)}
                                    disabled={policyEditor.rules.length <= 1}
                                    className="rounded-lg border border-rose-500/35 px-2 py-2 text-xs text-rose-700 hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-300"
                                  >
                                    X
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={addPolicyEditorRule}
                              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.08]"
                            >
                              Add Rule
                            </button>
                            <button
                              type="submit"
                              disabled={isPolicyEditorSaving}
                              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-slate-900"
                            >
                              {isPolicyEditorSaving ? "Saving..." : policyEditor.id ? "Update Profile" : "Create Profile"}
                            </button>
                            {policyEditor.id && (
                              <button
                                type="button"
                                onClick={resetPolicyEditor}
                                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.08]"
                              >
                                Cancel Edit
                              </button>
                            )}
                          </div>
                        </form>

                        {isPolicyLibraryLoading ? (
                          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Loading policy library...</p>
                        ) : policyLibrary.length === 0 ? (
                          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No profiles available.</p>
                        ) : (
                          <div className="mt-3 space-y-2">
                            {policyLibrary.map((policy) => (
                              <div
                                key={policy.id}
                                className="rounded-lg border border-slate-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.03]"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div>
                                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                      {policy.name}
                                      {policy.isSystem && (
                                        <span className="ml-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[11px] text-indigo-700 dark:text-indigo-300">
                                          system
                                        </span>
                                      )}
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                      {policy.slug} · {policy._count?.assignments || 0} assignment{(policy._count?.assignments || 0) === 1 ? "" : "s"}
                                    </p>
                                    {policy.description && (
                                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{policy.description}</p>
                                    )}
                                  </div>
                                  {!policy.isSystem && (
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => editPolicyFromLibrary(policy)}
                                        className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.08]"
                                      >
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void deletePolicyProfile(policy.id)}
                                        className="rounded-lg border border-rose-500/35 px-2 py-1 text-xs text-rose-700 hover:bg-rose-500/10 dark:text-rose-300"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="rounded-lg border border-slate-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Agent Overrides</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Direct rules that override assigned profiles for this agent.
                        </p>

                        <form onSubmit={createPermission} className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
                          <input
                            type="text"
                            value={permissionDraft.commandPattern}
                            onChange={(event) => setPermissionDraft((current) => ({ ...current, commandPattern: event.target.value }))}
                            placeholder="bun run build:*"
                            required
                            disabled={selectedSubagent.isShared}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 md:col-span-2 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                          />
                          <select
                            value={permissionDraft.status}
                            onChange={(event) =>
                              setPermissionDraft((current) => ({ ...current, status: event.target.value as "allow" | "ask" | "deny" }))
                            }
                            disabled={selectedSubagent.isShared}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                          >
                            <option value="allow">allow</option>
                            <option value="ask">ask</option>
                            <option value="deny">deny</option>
                          </select>
                          <select
                            value={permissionDraft.type}
                            onChange={(event) =>
                              setPermissionDraft((current) => ({ ...current, type: event.target.value as "bash_command" | "tool_command" }))
                            }
                            disabled={selectedSubagent.isShared}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                          >
                            <option value="bash_command">bash_command</option>
                            <option value="tool_command">tool_command</option>
                          </select>
                          <input
                            type="text"
                            value={permissionDraft.sourceFile}
                            onChange={(event) => setPermissionDraft((current) => ({ ...current, sourceFile: event.target.value }))}
                            placeholder="source file (optional)"
                            disabled={selectedSubagent.isShared}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 md:col-span-3 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                          />
                          <button
                            type="submit"
                            disabled={selectedSubagent.isShared || isCreatingPermission || !permissionDraft.commandPattern.trim()}
                            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-slate-900"
                          >
                            {isCreatingPermission ? "Adding..." : "Add Override Rule"}
                          </button>
                        </form>

                        {isPermissionsLoading ? (
                          <SurfaceCard className="mt-3">Loading override rules...</SurfaceCard>
                        ) : agentPermissions.length === 0 ? (
                          <div className="mt-3">
                            <EmptyState
                              title="No agent overrides"
                              description="Add allow/ask/deny command patterns for direct agent precedence."
                            />
                          </div>
                        ) : (
                          <div className="mt-3 space-y-2">
                            {agentPermissions.map((permission) => (
                              <div
                                key={permission.id}
                                className="rounded-lg border border-slate-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.03]"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <p className="font-mono text-sm text-slate-900 dark:text-slate-100">{permission.commandPattern}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                      {permission.status} · {permission.type} · {permission.scope}
                                    </p>
                                  </div>
                                  {!selectedSubagent.isShared && (
                                    <button
                                      type="button"
                                      onClick={() => void deletePermission(permission.id)}
                                      className="rounded-lg border border-rose-500/35 px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-500/10 dark:text-rose-300"
                                    >
                                      Delete
                                    </button>
                                  )}
                                </div>
                                {permission.sourceFile && (
                                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Source: {permission.sourceFile}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {detailTab === "agentsync" && (
                    <div className="space-y-4">
                      <div className="rounded-lg border border-slate-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Run AgentSync</h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Heuristic reinforcement updates are auto-applied to low-risk files and proposed for high-risk files.
                            </p>
                          </div>
                          <span className="rounded-full border border-cyan-500/35 bg-cyan-500/10 px-2 py-0.5 text-xs text-cyan-700 dark:text-cyan-200">
                            {proposedHighRiskSuggestionCount} pending high-risk
                          </span>
                        </div>

                        {!canRunSelectedAgentSync && (
                          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                            Select a personal agent to run selected-agent AgentSync.
                          </p>
                        )}

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              void runAgentSync("selected_agent")
                            }}
                            disabled={!canRunSelectedAgentSync || isAgentSyncRunningSelected || isAgentSyncRunningCrew}
                            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-slate-900"
                          >
                            {isAgentSyncRunningSelected ? "Running Selected..." : "Run AgentSync (Selected Agent)"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void runAgentSync("bridge_crew")
                            }}
                            disabled={activeTab !== "personal" || isAgentSyncRunningCrew || isAgentSyncRunningSelected}
                            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.08]"
                          >
                            {isAgentSyncRunningCrew ? "Running Bridge Crew..." : "Run Full Bridge Crew"}
                          </button>
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Nightly Preferences</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Hourly cron should call `/api/agentsync/nightly`; due users run at local {agentSyncPreference.nightlyHour
                            .toString()
                            .padStart(2, "0")}
                          :00.
                        </p>

                        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            Timezone
                            <input
                              type="text"
                              value={agentSyncPreference.timezone}
                              onChange={(event) =>
                                setAgentSyncPreference((current) => ({
                                  ...current,
                                  timezone: event.target.value,
                                }))
                              }
                              disabled={isAgentSyncPreferenceLoading || isAgentSyncPreferenceSaving}
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                              placeholder="America/New_York"
                            />
                          </label>
                          <label className="inline-flex items-center justify-between rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2 text-sm text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200">
                            Nightly enabled
                            <input
                              type="checkbox"
                              checked={agentSyncPreference.nightlyEnabled}
                              onChange={(event) =>
                                setAgentSyncPreference((current) => ({
                                  ...current,
                                  nightlyEnabled: event.target.checked,
                                }))
                              }
                              disabled={isAgentSyncPreferenceLoading || isAgentSyncPreferenceSaving}
                            />
                          </label>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Last nightly run: {agentSyncPreference.lastNightlyRunAt
                              ? new Date(agentSyncPreference.lastNightlyRunAt).toLocaleString()
                              : "never"}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              void saveAgentSyncPreference()
                            }}
                            disabled={isAgentSyncPreferenceLoading || isAgentSyncPreferenceSaving}
                            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.08]"
                          >
                            {isAgentSyncPreferenceSaving ? "Saving..." : "Save Preferences"}
                          </button>
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Run History</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Recent selected-agent or bridge-crew runs with high-risk approval actions.
                        </p>

                        {isAgentSyncRunsLoading ? (
                          <SurfaceCard className="mt-3">Loading AgentSync runs...</SurfaceCard>
                        ) : agentSyncRuns.length === 0 ? (
                          <div className="mt-3">
                            <EmptyState title="No AgentSync runs yet" description="Trigger a run to generate reinforcement updates." />
                          </div>
                        ) : (
                          <div className="mt-3 space-y-3">
                            {agentSyncRuns.map((run) => {
                              const highRiskSuggestions = run.suggestions.filter((suggestion) => suggestion.risk === "high")

                              return (
                                <div
                                  key={run.id}
                                  className="rounded-lg border border-slate-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.03]"
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                        {run.scope === "selected_agent" ? "Selected Agent Run" : "Bridge Crew Run"} · {run.status}
                                      </p>
                                      <p className="text-xs text-slate-500 dark:text-slate-400">
                                        {run.trigger} · {new Date(run.createdAt).toLocaleString()}
                                      </p>
                                    </div>
                                    <span className="rounded-full border border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 dark:border-white/15 dark:text-slate-300">
                                      {run.fileSyncStatus === "filesystem_sync_failed" ? "filesystem sync warning" : run.fileSyncStatus}
                                    </span>
                                  </div>

                                  {run.summary && (
                                    <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{run.summary}</p>
                                  )}

                                  {highRiskSuggestions.length > 0 && (
                                    <div className="mt-3 space-y-2 border-t border-slate-200/80 pt-2 dark:border-white/10">
                                      {highRiskSuggestions.map((suggestion) => (
                                        <div
                                          key={suggestion.id}
                                          className="rounded-lg border border-slate-200/80 bg-slate-50/70 p-2 dark:border-white/10 dark:bg-white/[0.02]"
                                        >
                                          <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div>
                                              <p className="font-mono text-xs font-medium text-slate-900 dark:text-slate-100">
                                                {suggestion.fileName}
                                              </p>
                                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                                {suggestion.status}
                                                {suggestion.reason ? ` · ${suggestion.reason}` : ""}
                                              </p>
                                            </div>
                                            {suggestion.status === "proposed" && (
                                              <div className="flex gap-2">
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    void applyAgentSyncSuggestionAction(suggestion.id)
                                                  }}
                                                  disabled={actingSuggestionId === suggestion.id}
                                                  className="rounded-lg border border-emerald-500/35 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-500/10 disabled:opacity-50 dark:text-emerald-300"
                                                >
                                                  {actingSuggestionId === suggestion.id ? "Applying..." : "Apply"}
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    void rejectAgentSyncSuggestionAction(suggestion.id)
                                                  }}
                                                  disabled={actingSuggestionId === suggestion.id}
                                                  className="rounded-lg border border-rose-500/35 px-2 py-1 text-xs text-rose-700 hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-300"
                                                >
                                                  {actingSuggestionId === suggestion.id ? "Saving..." : "Reject"}
                                                </button>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {detailTab === "workspace" && (
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Working directory</label>
                        <input
                          type="text"
                          value={settingsDraft.workspace.workingDirectory}
                          disabled={selectedSubagent.isShared}
                          onChange={(event) => {
                            setSettingsDraft((current) => ({
                              ...current,
                              workspace: {
                                ...current.workspace,
                                workingDirectory: event.target.value,
                              },
                            }))
                            markSettingsDirty("workspace")
                          }}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Include paths (one per line)</label>
                          <textarea
                            rows={6}
                            value={joinLines(settingsDraft.workspace.includePaths)}
                            disabled={selectedSubagent.isShared}
                            onChange={(event) => {
                              setSettingsDraft((current) => ({
                                ...current,
                                workspace: {
                                  ...current.workspace,
                                  includePaths: splitLines(event.target.value),
                                },
                              }))
                              markSettingsDirty("workspace")
                            }}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Exclude paths (one per line)</label>
                          <textarea
                            rows={6}
                            value={joinLines(settingsDraft.workspace.excludePaths)}
                            disabled={selectedSubagent.isShared}
                            onChange={(event) => {
                              setSettingsDraft((current) => ({
                                ...current,
                                workspace: {
                                  ...current.workspace,
                                  excludePaths: splitLines(event.target.value),
                                },
                              }))
                              markSettingsDirty("workspace")
                            }}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => void saveSettingsSection("workspace")}
                        disabled={selectedSubagent.isShared || isSavingSettings.workspace || !dirtySettingsSections.workspace}
                        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-slate-900"
                      >
                        {isSavingSettings.workspace ? "Saving..." : "Save Workspace"}
                      </button>
                    </div>
                  )}

                  {detailTab === "memory" && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          Mode
                          <select
                            value={settingsDraft.memory.mode}
                            disabled={selectedSubagent.isShared}
                            onChange={(event) => {
                              setSettingsDraft((current) => ({
                                ...current,
                                memory: {
                                  ...current.memory,
                                  mode: event.target.value as "session" | "rolling" | "ephemeral",
                                },
                              }))
                              markSettingsDirty("memory")
                            }}
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
                            disabled={selectedSubagent.isShared}
                            onChange={(event) => {
                              const nextValue = Number(event.target.value)
                              setSettingsDraft((current) => ({
                                ...current,
                                memory: {
                                  ...current.memory,
                                  maxEntries: Number.isFinite(nextValue)
                                    ? Math.max(1, Math.min(1000, Math.round(nextValue)))
                                    : current.memory.maxEntries,
                                },
                              }))
                              markSettingsDirty("memory")
                            }}
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                          />
                        </label>

                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          Summary style
                          <select
                            value={settingsDraft.memory.summaryStyle}
                            disabled={selectedSubagent.isShared}
                            onChange={(event) => {
                              setSettingsDraft((current) => ({
                                ...current,
                                memory: {
                                  ...current.memory,
                                  summaryStyle: event.target.value as "concise" | "detailed",
                                },
                              }))
                              markSettingsDirty("memory")
                            }}
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                          >
                            <option value="concise">concise</option>
                            <option value="detailed">detailed</option>
                          </select>
                        </label>
                      </div>

                      <button
                        type="button"
                        onClick={() => void saveSettingsSection("memory")}
                        disabled={selectedSubagent.isShared || isSavingSettings.memory || !dirtySettingsSections.memory}
                        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-slate-900"
                      >
                        {isSavingSettings.memory ? "Saving..." : "Save Memory"}
                      </button>
                    </div>
                  )}

                  {detailTab === "guidelines" && (
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Guideline references (one per line)</label>
                        <textarea
                          rows={5}
                          value={joinLines(settingsDraft.guidelines.references)}
                          disabled={selectedSubagent.isShared}
                          onChange={(event) => {
                            setSettingsDraft((current) => ({
                              ...current,
                              guidelines: {
                                ...current.guidelines,
                                references: splitLines(event.target.value),
                              },
                            }))
                            markSettingsDirty("guidelines")
                          }}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Guideline notes</label>
                        <textarea
                          rows={7}
                          value={settingsDraft.guidelines.notes}
                          disabled={selectedSubagent.isShared}
                          onChange={(event) => {
                            setSettingsDraft((current) => ({
                              ...current,
                              guidelines: {
                                ...current.guidelines,
                                notes: event.target.value,
                              },
                            }))
                            markSettingsDirty("guidelines")
                          }}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => void saveSettingsSection("guidelines")}
                        disabled={selectedSubagent.isShared || isSavingSettings.guidelines || !dirtySettingsSections.guidelines}
                        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-slate-900"
                      >
                        {isSavingSettings.guidelines ? "Saving..." : "Save Guidelines"}
                      </button>
                    </div>
                  )}

                  <div className="space-y-2 border-t border-slate-200/80 pt-3 dark:border-white/10">
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Orchestration Graph</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Showing {selectedSubagent.name} while editing {activeDetailTabLabel.toLowerCase()}.
                      </p>
                    </div>
                    <ContextOrchestrationBoard
                      subagents={activeSubagents}
                      selectedAgentId={selectedSubagent.id}
                      onSelectedAgentIdChange={setSelectedAgentId}
                      hideAgentSelector
                    />
                  </div>
                </div>
              )}
            </SurfaceCard>
          </div>
        )}

        {activeTab === "personal" && showCreateForm && (
          <SurfaceCard>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {editingId ? "Edit Personal Agent" : "Create New Personal Agent"}
            </h2>
            <form onSubmit={editingId ? handleUpdate : handleCreate} className="mt-4 space-y-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(event) => setFormData((current) => ({ ...current, name: event.target.value }))}
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
                    onChange={(event) => setFormData((current) => ({ ...current, path: event.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                    placeholder=".claude/agents/code-simplifier/SOUL.md"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(event) => setFormData((current) => ({ ...current, description: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Legacy content scaffold</label>
                <textarea
                  value={formData.content}
                  onChange={(event) => setFormData((current) => ({ ...current, content: event.target.value }))}
                  required
                  rows={8}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={isCreating || isUpdating}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-slate-900"
                >
                  {isCreating || isUpdating ? (editingId ? "Updating..." : "Creating...") : editingId ? "Update" : "Create"}
                </button>
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.08]"
                >
                  Cancel
                </button>
              </div>
            </form>
          </SurfaceCard>
        )}
      </div>
    </PageLayout>
  )
}
