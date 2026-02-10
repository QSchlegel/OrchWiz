export type SkillCatalogSourceValue = "curated" | "experimental" | "custom_github" | "local" | "system"
export type SkillImportStatusValue = "running" | "succeeded" | "failed"
export type SkillCatalogRefreshMode = "auto" | "force" | "none"

export type SkillGraphGroupId = "installed" | "curated" | "experimental" | "custom" | "system"

export interface SkillCatalogEntryDto {
  id: string
  slug: string
  name: string
  description: string | null
  source: SkillCatalogSourceValue
  sourceKey: string
  repo: string | null
  sourcePath: string | null
  sourceRef: string | null
  sourceUrl: string | null
  isInstalled: boolean
  isSystem: boolean
  installedPath: string | null
  metadata: Record<string, unknown> | null
  ownerUserId: string
  lastSyncedAt: string
  createdAt: string
  updatedAt: string
}

export interface SkillImportRunDto {
  id: string
  ownerUserId: string
  catalogEntryId: string | null
  mode: string
  source: SkillCatalogSourceValue | null
  skillSlug: string | null
  repo: string | null
  sourcePath: string | null
  sourceRef: string | null
  sourceUrl: string | null
  status: SkillImportStatusValue
  exitCode: number | null
  stdout: string | null
  stderr: string | null
  errorMessage: string | null
  startedAt: string
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface SkillGraphGroup {
  id: SkillGraphGroupId
  label: string
  description: string
}

export interface SkillGraphNode {
  id: string
  nodeType: "group" | "skill"
  label: string
  groupId: SkillGraphGroupId
  skillId?: string
  source?: SkillCatalogSourceValue
  isInstalled?: boolean
}

export interface SkillGraphEdge {
  id: string
  source: string
  target: string
  edgeType: "group-membership"
}

export interface SkillGraphResponse {
  groups: SkillGraphGroup[]
  nodes: SkillGraphNode[]
  edges: SkillGraphEdge[]
  stats: {
    totalSkills: number
    installedCount: number
    systemCount: number
    groupedCounts: Record<SkillGraphGroupId, number>
  }
}

export interface SkillCatalogExperimentalStatus {
  state: "available" | "unavailable" | "not_checked"
  checkedAt: string | null
  error: string | null
}

export interface SkillCatalogRefreshMetadata {
  refreshMode: SkillCatalogRefreshMode
  refreshed: boolean
  stale: boolean
  lastSyncedAt: string | null
  warnings: string[]
  experimentalStatus: SkillCatalogExperimentalStatus
}

export interface SkillCatalogResponse {
  entries: SkillCatalogEntryDto[]
  graph: SkillGraphResponse
  refresh: SkillCatalogRefreshMetadata
}
