export type VaultId = "orchwiz" | "ship" | "agent-public" | "agent-private" | "joined"

export type PhysicalVaultId = Exclude<VaultId, "joined">

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

export interface VaultSearchResult {
  vaultId: VaultId
  path: string
  title: string
  excerpt: string
  originVaultId?: PhysicalVaultId
}

export interface VaultSearchResponse {
  vaultId: VaultId
  exists: boolean
  results: VaultSearchResult[]
}
