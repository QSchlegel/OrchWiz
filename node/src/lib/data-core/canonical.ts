import type { PhysicalVaultId, VaultId } from "@/lib/vault/types"
import { parseJoinedVaultPath } from "@/lib/vault/config"
import type { DataCoreDomain } from "./types"

export interface CanonicalMappingContext {
  userId?: string
  shipDeploymentId?: string | null
  clusterId: string
}

export function isDataCoreBackedPhysicalVault(vaultId: PhysicalVaultId): boolean {
  return vaultId === "orchwiz" || vaultId === "ship" || vaultId === "agent-public"
}

export function isDataCoreBackedVault(vaultId: VaultId): boolean {
  return vaultId === "orchwiz" || vaultId === "ship" || vaultId === "agent-public" || vaultId === "joined"
}

export function domainFromPhysicalVault(vaultId: PhysicalVaultId): DataCoreDomain | null {
  if (vaultId === "orchwiz") return "orchwiz"
  if (vaultId === "ship") return "ship"
  if (vaultId === "agent-public") return "agent-public"
  return null
}

export function domainFromCanonicalPath(canonicalPath: string): DataCoreDomain {
  if (canonicalPath.startsWith("orchwiz/")) return "orchwiz"
  if (canonicalPath.startsWith("ship/")) return "ship"
  if (canonicalPath.startsWith("agent-public/")) return "agent-public"
  throw new Error(`Unsupported canonical path domain: ${canonicalPath}`)
}

function normalizePath(pathInput: string): string {
  const normalized = pathInput.trim().replaceAll("\\", "/").replace(/^\/+/, "")
  if (!normalized) {
    throw new Error("Path cannot be empty")
  }

  const parts = normalized.split("/").filter(Boolean)
  if (parts.some((part) => part === "." || part === "..")) {
    throw new Error("Path traversal is not allowed")
  }

  let joined = parts.join("/")
  if (!joined.toLowerCase().endsWith(".md")) {
    joined = `${joined}.md`
  }

  return joined
}

export function toCanonicalPath(args: {
  physicalVaultId: PhysicalVaultId
  physicalPath: string
  context: CanonicalMappingContext
}): { domain: DataCoreDomain; canonicalPath: string } {
  const domain = domainFromPhysicalVault(args.physicalVaultId)
  if (!domain) {
    throw new Error(`Vault ${args.physicalVaultId} is not data-core backed`)
  }

  const normalized = normalizePath(args.physicalPath)

  if (domain === "orchwiz") {
    return {
      domain,
      canonicalPath: `${domain}/${args.context.clusterId}/${normalized}`,
    }
  }

  if (domain === "ship") {
    const shipScopedMatch = normalized.match(/^kb\/ships\/([^/]+)\/(.+)$/u)
    if (shipScopedMatch) {
      return {
        domain,
        canonicalPath: `${domain}/${shipScopedMatch[1]}/${normalizePath(shipScopedMatch[2])}`,
      }
    }

    const fleetMatch = normalized.match(/^kb\/fleet\/(.+)$/u)
    if (fleetMatch) {
      return {
        domain,
        canonicalPath: `${domain}/fleet/${normalizePath(fleetMatch[1])}`,
      }
    }

    const fallbackShipId = args.context.shipDeploymentId || "fleet"
    return {
      domain,
      canonicalPath: `${domain}/${fallbackShipId}/${normalized}`,
    }
  }

  const namespace = args.context.userId || "anonymous"
  return {
    domain,
    canonicalPath: `${domain}/${namespace}/${normalized}`,
  }
}

export function fromCanonicalPath(args: {
  domain: DataCoreDomain
  canonicalPath: string
  context: CanonicalMappingContext
}): string {
  const normalized = args.canonicalPath.trim().replaceAll("\\", "/")
  if (!normalized.startsWith(`${args.domain}/`)) {
    throw new Error(`Canonical path ${normalized} is outside domain ${args.domain}`)
  }

  const rest = normalized.slice(args.domain.length + 1)
  const segments = rest.split("/").filter(Boolean)
  if (segments.length < 2) {
    throw new Error("Canonical path is missing namespace and inner path")
  }

  const namespace = segments[0]
  const inner = segments.slice(1).join("/")

  if (args.domain === "orchwiz") {
    return normalizePath(inner)
  }

  if (args.domain === "ship") {
    if (namespace === "fleet") {
      return normalizePath(`kb/fleet/${inner}`)
    }

    return normalizePath(`kb/ships/${namespace}/${inner}`)
  }

  if (namespace === args.context.userId) {
    return normalizePath(inner)
  }

  return normalizePath(`${namespace}/${inner}`)
}

export function resolvePhysicalTargetFromVaultRequest(args: {
  vaultId: VaultId
  notePath: string
}): { physicalVaultId: PhysicalVaultId; physicalPath: string } {
  if (args.vaultId === "joined") {
    const parsed = parseJoinedVaultPath(args.notePath)
    if (!parsed) {
      throw new Error("Joined vault path must include namespace")
    }

    return {
      physicalVaultId: parsed.vaultId,
      physicalPath: normalizePath(parsed.innerPath),
    }
  }

  return {
    physicalVaultId: args.vaultId,
    physicalPath: normalizePath(args.notePath),
  }
}
