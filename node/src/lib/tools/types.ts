export type ToolCatalogSourceValue = "curated" | "custom_github" | "local" | "system"
export type ToolImportStatusValue = "running" | "succeeded" | "failed"
export type ToolCatalogRefreshMode = "auto" | "force" | "none"
export type CatalogActivationStatusValue = "pending" | "approved" | "denied"

export type ShipToolGrantScopeValue = "ship" | "bridge_crew"
export type ShipToolAccessRequestStatusValue = "pending" | "approved" | "denied"
export type ShipToolRequestScopePreferenceValue = "requester_only" | "ship"

export interface ToolCatalogEntryDto {
  id: string
  slug: string
  name: string
  description: string | null
  source: ToolCatalogSourceValue
  sourceKey: string
  repo: string | null
  sourcePath: string | null
  sourceRef: string | null
  sourceUrl: string | null
  isInstalled: boolean
  isSystem: boolean
  installedPath: string | null
  activationStatus: CatalogActivationStatusValue
  activationRationale: string | null
  activatedAt: string | null
  activatedByUserId: string | null
  activatedByBridgeCrewId: string | null
  activationSecurityReportId: string | null
  metadata: Record<string, unknown> | null
  ownerUserId: string
  lastSyncedAt: string
  createdAt: string
  updatedAt: string
}

export interface ToolImportRunDto {
  id: string
  ownerUserId: string
  catalogEntryId: string | null
  mode: string
  source: ToolCatalogSourceValue | null
  toolSlug: string | null
  repo: string | null
  sourcePath: string | null
  sourceRef: string | null
  sourceUrl: string | null
  status: ToolImportStatusValue
  exitCode: number | null
  stdout: string | null
  stderr: string | null
  errorMessage: string | null
  startedAt: string
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ToolCatalogRefreshMetadata {
  refreshMode: ToolCatalogRefreshMode
  refreshed: boolean
  stale: boolean
  lastSyncedAt: string | null
  warnings: string[]
}

export interface ToolCatalogResponse {
  entries: ToolCatalogEntryDto[]
  refresh: ToolCatalogRefreshMetadata
}

export interface ShipToolGrantDto {
  id: string
  ownerUserId: string
  shipDeploymentId: string
  catalogEntryId: string
  scope: ShipToolGrantScopeValue
  scopeKey: string
  bridgeCrewId: string | null
  grantedByUserId: string | null
  createdAt: string
  updatedAt: string
  catalogEntry: ToolCatalogEntryDto
  bridgeCrew: {
    id: string
    role: string
    callsign: string
    name: string
  } | null
}

export interface ShipToolAccessRequestDto {
  id: string
  ownerUserId: string
  shipDeploymentId: string
  catalogEntryId: string
  requesterBridgeCrewId: string | null
  requestedByUserId: string
  scopePreference: ShipToolRequestScopePreferenceValue
  status: ShipToolAccessRequestStatusValue
  rationale: string | null
  metadata: Record<string, unknown> | null
  approvedGrantId: string | null
  reviewedByUserId: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
  catalogEntry: ToolCatalogEntryDto
  requesterBridgeCrew: {
    id: string
    role: string
    callsign: string
    name: string
  } | null
}

export interface ShipToolBridgeCrewOptionDto {
  id: string
  role: string
  callsign: string
  name: string
  status: string
}

export interface ShipToolsStateDto {
  ship: {
    id: string
    name: string
    userId: string
  }
  catalog: ToolCatalogEntryDto[]
  grants: ShipToolGrantDto[]
  requests: ShipToolAccessRequestDto[]
  bridgeCrew: ShipToolBridgeCrewOptionDto[]
  subagentAssignments: ShipToolSubagentAssignmentDto[]
  governanceEvents: ShipToolsGovernanceEventDto[]
}

export interface ShipToolSubagentAssignmentDto {
  id: string
  ownerUserId: string
  shipDeploymentId: string
  bridgeCrewId: string
  subagentId: string
  assignedByUserId: string
  assignedByBridgeCrewId: string | null
  createdAt: string
  updatedAt: string
  bridgeCrew: {
    id: string
    role: string
    callsign: string
    name: string
  }
  subagent: {
    id: string
    name: string
    subagentType: string
  }
}

export interface ShipToolsGovernanceEventDto {
  id: string
  eventType: string
  toolCatalogEntryId: string | null
  skillCatalogEntryId: string | null
  bridgeCrewId: string | null
  subagentId: string | null
  actorBridgeCrewId: string | null
  rationale: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  securityReport: {
    id: string
    reportPathMd: string
    reportPathJson: string
  } | null
}
