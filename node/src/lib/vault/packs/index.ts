import { posix } from "node:path"
import type { VaultSeedPackSummary } from "@/lib/vault/types"
import { POPEBOT_VAULT_SEED_PACK } from "./popebot"
import type { BuiltVaultSeedPack, VaultSeedPackDefinition } from "./types"
import { VAULT_SEED_PACK_CREATED_DATE_TOKEN } from "./types"

const VAULT_SEED_PACKS: VaultSeedPackDefinition[] = [POPEBOT_VAULT_SEED_PACK]

function localDateIso(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function resolveCreatedDate(createdDate?: string): string {
  if (!createdDate) {
    return localDateIso(new Date())
  }

  const normalized = createdDate.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(normalized)) {
    throw new Error("createdDate must use YYYY-MM-DD format.")
  }

  return normalized
}

function toSeedPackSummary(definition: VaultSeedPackDefinition): VaultSeedPackSummary {
  return {
    id: definition.id,
    label: definition.label,
    description: definition.description,
    vaultId: definition.vaultId,
    targetRoot: definition.targetRoot,
    tags: [...definition.tags],
    noteCount: definition.files.length,
  }
}

export function listVaultSeedPacks(): VaultSeedPackSummary[] {
  return VAULT_SEED_PACKS.map((definition) => toSeedPackSummary(definition))
}

export function getVaultSeedPack(packId: string): VaultSeedPackSummary | null {
  const definition = VAULT_SEED_PACKS.find((entry) => entry.id === packId) || null
  return definition ? toSeedPackSummary(definition) : null
}

export function buildVaultSeedPackFiles(
  packId: string,
  options: {
    createdDate?: string
  } = {},
): BuiltVaultSeedPack {
  const definition = VAULT_SEED_PACKS.find((entry) => entry.id === packId)
  if (!definition) {
    throw new Error(`Unknown vault seed pack: ${packId}`)
  }

  const createdDate = resolveCreatedDate(options.createdDate)
  const files = definition.files.map((file) => ({
    path: posix.join(definition.targetRoot, file.fileName),
    content: file.content.replaceAll(VAULT_SEED_PACK_CREATED_DATE_TOKEN, createdDate).trim(),
  }))

  return {
    pack: toSeedPackSummary(definition),
    createdDate,
    files,
  }
}

