export type VaultId = "orchwiz" | "ship" | "agent-public" | "agent-private" | "joined"
export type VaultRagMode = "hybrid" | "lexical"
export type VaultRagScopeType = "ship" | "fleet" | "global"

export type PhysicalVaultId = Exclude<VaultId, "joined">
export type VaultFileReadMode = "preview" | "full"
export type VaultDeleteMode = "soft" | "hard"

export interface VaultSummary {
  id: VaultId
  label: string
  exists: boolean
  isPrivate: boolean
  isJoined: boolean
  encryptedLabel?: string
  noteCount: number
}

export interface VaultTreeNode {
  id: string
  name: string
  path: string
  nodeType: "folder" | "file"
  vaultId: VaultId
  originVaultId?: PhysicalVaultId
  children?: VaultTreeNode[]
}

export interface VaultTreeResponse {
  vaultId: VaultId
  exists: boolean
  tree: VaultTreeNode[]
}

export interface VaultLinkRef {
  kind: "wiki" | "markdown"
  sourceVaultId: VaultId
  sourcePath: string
  target: string
  label: string
  resolvedVaultId: VaultId | null
  resolvedPath: string | null
  exists: boolean
  originVaultId?: PhysicalVaultId
}

export interface VaultFileResponse {
  vaultId: VaultId
  path: string
  content: string
  truncated: boolean
  size: number
  mtime: string
  outgoingLinks: VaultLinkRef[]
  backlinks: VaultLinkRef[]
  originVaultId?: PhysicalVaultId
}

export interface VaultSaveResponse {
  vaultId: VaultId
  path: string
  size: number
  mtime: string
  encrypted: boolean
  originVaultId?: PhysicalVaultId
}

export interface VaultMoveResponse {
  vaultId: VaultId
  fromPath: string
  toPath: string
  size: number
  mtime: string
  encrypted: boolean
  originVaultId?: PhysicalVaultId
}

export interface VaultDeleteResponse {
  vaultId: VaultId
  path: string
  mode: VaultDeleteMode
  deletedPath: string | null
  originVaultId?: PhysicalVaultId
}

export interface VaultSearchResult {
  vaultId: VaultId
  path: string
  title: string
  excerpt: string
  originVaultId?: PhysicalVaultId
  score?: number
  scopeType?: VaultRagScopeType
  shipDeploymentId?: string | null
  citations?: Array<{
    id: string
    path: string
    title: string
    excerpt: string
    scopeType: VaultRagScopeType
    shipDeploymentId: string | null
    score: number
    lexicalScore: number
    semanticScore: number
  }>
}

export interface VaultSearchResponse {
  vaultId: VaultId
  exists: boolean
  mode?: VaultRagMode
  fallbackUsed?: boolean
  results: VaultSearchResult[]
}

export interface VaultGraphNode {
  id: string
  nodeType: "note" | "ghost"
  vaultId: VaultId
  path: string
  label: string
  originVaultId?: PhysicalVaultId
  unresolvedTarget?: string
}

export interface VaultGraphEdge {
  id: string
  edgeType: "resolved" | "unresolved"
  kind: "wiki" | "markdown"
  source: string
  target: string
  sourcePath: string
  targetPath: string
}

export interface VaultGraphStats {
  noteCount: number
  ghostCount: number
  edgeCount: number
  unresolvedEdgeCount: number
  truncated: boolean
}

export interface VaultGraphResponse {
  vaultId: VaultId
  focusPath: string | null
  filters: {
    depth: number
    includeUnresolved: boolean
    includeTrash: boolean
    query: string
  }
  nodes: VaultGraphNode[]
  edges: VaultGraphEdge[]
  stats: VaultGraphStats
}
