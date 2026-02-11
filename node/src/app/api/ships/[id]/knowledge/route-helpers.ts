import { resolveVaultRagMode, type VaultRagQueryMode } from "@/lib/vault/rag"
import { parseRagBackend, type RagBackend } from "@/lib/memory/rag-backend"
import {
  composeShipKnowledgePath,
  normalizeShipKnowledgePath,
  parseShipKnowledgeScope,
  type ShipKnowledgeScope,
} from "@/lib/vault/knowledge"

export interface KnowledgeMutationInput {
  path?: unknown
  content?: unknown
  scope?: unknown
  relativePath?: unknown
}

export type KnowledgeResyncScope = "ship" | "fleet" | "all"

export function parseKnowledgeQueryMode(value: string | null | undefined): VaultRagQueryMode {
  return resolveVaultRagMode(value)
}

export function parseKnowledgeBackend(value: string | null | undefined): RagBackend {
  return parseRagBackend(value)
}

export function parseKnowledgeScope(value: string | null | undefined): ShipKnowledgeScope {
  return parseShipKnowledgeScope(value)
}

export function parseKnowledgeResyncScope(value: string | null | undefined): KnowledgeResyncScope {
  if (value === "ship" || value === "fleet") {
    return value
  }
  return "all"
}

export function parseTopK(value: string | null | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) {
    return undefined
  }
  return Math.max(1, Math.min(100, parsed))
}

export function parseKnowledgeContent(value: unknown): string | null {
  if (typeof value !== "string") return null
  return value
}

export function resolveKnowledgeMutationPath(input: KnowledgeMutationInput, shipDeploymentId: string): string {
  if (typeof input.path === "string" && input.path.trim()) {
    return normalizeShipKnowledgePath(input.path, shipDeploymentId)
  }

  if (typeof input.scope === "string" && (input.scope === "ship" || input.scope === "fleet")) {
    if (typeof input.relativePath !== "string" || !input.relativePath.trim()) {
      throw new Error("relativePath is required when scope is provided.")
    }

    return composeShipKnowledgePath({
      scope: input.scope,
      shipDeploymentId,
      relativePath: input.relativePath,
    })
  }

  throw new Error("path is required.")
}
