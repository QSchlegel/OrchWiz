import type { PhysicalVaultId, VaultSeedPackSummary } from "@/lib/vault/types"

export const VAULT_SEED_PACK_CREATED_DATE_TOKEN = "{{createdDate}}"

export interface VaultSeedPackTemplateFile {
  fileName: string
  content: string
}

export interface VaultSeedPackDefinition {
  id: string
  label: string
  description: string
  vaultId: PhysicalVaultId
  targetRoot: string
  tags: string[]
  files: VaultSeedPackTemplateFile[]
}

export interface BuiltVaultSeedPackFile {
  path: string
  content: string
}

export interface BuiltVaultSeedPack {
  pack: VaultSeedPackSummary
  createdDate: string
  files: BuiltVaultSeedPackFile[]
}

