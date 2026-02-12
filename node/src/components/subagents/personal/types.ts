import type { SubagentTypeValue } from "@/lib/subagents/types"
import type { SubagentSettings } from "@/lib/subagents/settings"

export type { SubagentSettings } from "@/lib/subagents/settings"

export interface Subagent {
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

export interface ContextSize {
  wordCount: number
  estimatedTokens: number
}

export interface ContextFileView {
  fileName: string
  content: string
  relativePath: string
  size: ContextSize
}

export interface WorkspaceInspectorEntry {
  name: string
  path: string
  nodeType: "folder" | "file"
  size: number | null
  mtime: string | null
}

export interface WorkspaceInspectorTreeResponse {
  subagentId: string
  rootPath: string
  currentPath: string
  exists: boolean
  truncated: boolean
  entries: WorkspaceInspectorEntry[]
}

export interface WorkspaceInspectorFileResponse {
  subagentId: string
  rootPath: string
  path: string
  exists: boolean
  isBinary: boolean
  truncated: boolean
  size: number
  mtime: string | null
  content: string
}

export interface AgentPermission {
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

export interface PermissionPolicyRule {
  id?: string
  commandPattern: string
  type: "bash_command" | "tool_command"
  status: "allow" | "ask" | "deny"
  sortOrder: number
}

export interface PermissionPolicy {
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

export interface PolicyAssignment {
  policyId: string
  priority: number
  enabled: boolean
}

export interface AgentSyncPreference {
  timezone: string
  nightlyEnabled: boolean
  nightlyHour: number
  lastNightlyRunAt: string | null
}

export interface AgentSyncSuggestion {
  id: string
  fileName: string
  risk: "low" | "high"
  status: "proposed" | "applied" | "rejected" | "failed"
  reason: string | null
  fileSyncStatus: "synced" | "filesystem_sync_failed" | "skipped"
  createdAt: string
  appliedAt: string | null
}

export interface AgentSyncRun {
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

export interface ToolCatalogEntryView {
  id: string
  slug: string
  name: string
  description: string | null
  source: "curated" | "custom_github" | "local" | "system"
  isInstalled: boolean
  isSystem: boolean
  activationStatus: "pending" | "approved" | "denied"
  activationRationale: string | null
  activatedAt: string | null
  activatedByUserId: string | null
  activatedByBridgeCrewId: string | null
  activationSecurityReportId: string | null
  sourceUrl: string | null
  metadata: Record<string, unknown> | null
}

export interface ToolImportRunView {
  id: string
  mode: string
  toolSlug: string | null
  sourceUrl: string | null
  status: "running" | "succeeded" | "failed"
  errorMessage: string | null
  createdAt: string
}

export interface SubagentToolBindingView {
  id: string
  subagentId: string
  toolCatalogEntryId: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}
