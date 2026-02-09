import { resolve } from "node:path"
import type { PhysicalVaultId, VaultId } from "./types"

export interface VaultDefinition {
  id: PhysicalVaultId
  label: string
  namespace: string
  relativePath: string
  isPrivate: boolean
  encryptedLabel?: string
}

export const JOINED_VAULT_ID: VaultId = "joined"

const VAULT_DEFINITIONS: VaultDefinition[] = [
  {
    id: "orchwiz",
    label: "OrchWiz Vault",
    namespace: "orchwiz",
    relativePath: "OWZ-Vault",
    isPrivate: false,
  },
  {
    id: "ship",
    label: "Ship Vault",
    namespace: "ship",
    relativePath: "Ship-Vault",
    isPrivate: false,
  },
  {
    id: "agent-public",
    label: "Agent Vault Public",
    namespace: "agent-public",
    relativePath: "Agent-Vault/public",
    isPrivate: false,
  },
  {
    id: "agent-private",
    label: "Agent Vault Private",
    namespace: "agent-private",
    relativePath: "Agent-Vault/private",
    isPrivate: true,
    encryptedLabel: "Encrypted-managed externally",
  },
]

const vaultById = new Map(VAULT_DEFINITIONS.map((vault) => [vault.id, vault]))
const vaultByNamespace = new Map(VAULT_DEFINITIONS.map((vault) => [vault.namespace, vault.id]))

export function parseVaultId(value: string | null): VaultId | null {
  if (!value) return null
  if (value === JOINED_VAULT_ID) return JOINED_VAULT_ID
  return vaultById.has(value as PhysicalVaultId) ? (value as PhysicalVaultId) : null
}

export function listPhysicalVaultDefinitions(): VaultDefinition[] {
  return VAULT_DEFINITIONS
}

export function getVaultDefinition(vaultId: PhysicalVaultId): VaultDefinition {
  const definition = vaultById.get(vaultId)
  if (!definition) {
    throw new Error(`Unknown vault id: ${vaultId}`)
  }
  return definition
}

export function getRepoRootPath(): string {
  return resolve(process.cwd(), "..")
}

export function resolveVaultAbsolutePath(vaultId: PhysicalVaultId): string {
  const definition = getVaultDefinition(vaultId)
  return resolve(getRepoRootPath(), definition.relativePath)
}

export function resolveVaultIdByNamespace(namespace: string): PhysicalVaultId | null {
  return vaultByNamespace.get(namespace) || null
}

export function toJoinedVaultPath(vaultId: PhysicalVaultId, relativePath: string): string {
  const definition = getVaultDefinition(vaultId)
  return `${definition.namespace}/${relativePath}`
}

export function parseJoinedVaultPath(joinedPath: string): { vaultId: PhysicalVaultId; innerPath: string } | null {
  const segments = joinedPath.split("/")
  const namespace = segments[0]
  if (!namespace || segments.length < 2) {
    return null
  }

  const vaultId = resolveVaultIdByNamespace(namespace)
  if (!vaultId) {
    return null
  }

  return {
    vaultId,
    innerPath: segments.slice(1).join("/"),
  }
}
