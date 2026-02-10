import { toJoinedVaultPath } from "@/lib/vault/config"
import type { PhysicalVaultId } from "@/lib/vault/types"
import type { VaultKnowledgeScope, VaultRagCitation, VaultRagQueryMode, VaultRagQueryResult } from "@/lib/vault/rag"
import { dataCoreClusterId } from "./config"
import { domainFromCanonicalPath, fromCanonicalPath, type CanonicalMappingContext } from "./canonical"
import { getDataCoreClient } from "./client"
import type { DataCoreDomain } from "./types"
import { queryLocalPrivateRag } from "./local-private-rag"

function physicalVaultForDomain(domain: DataCoreDomain): PhysicalVaultId {
  if (domain === "orchwiz") return "orchwiz"
  if (domain === "ship") return "ship"
  return "agent-public"
}

function toPositiveTopK(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return 12
  return Math.max(1, Math.min(100, Math.floor(value)))
}

function knowledgeScopeFromCanonicalPath(canonicalPath: string): {
  scopeType: "ship" | "fleet" | "global"
  shipDeploymentId: string | null
} {
  if (!canonicalPath.startsWith("ship/")) {
    return {
      scopeType: "global",
      shipDeploymentId: null,
    }
  }

  const segments = canonicalPath.split("/").filter(Boolean)
  const namespace = segments[1] || ""
  if (namespace === "fleet") {
    return {
      scopeType: "fleet",
      shipDeploymentId: null,
    }
  }

  if (namespace) {
    return {
      scopeType: "ship",
      shipDeploymentId: namespace,
    }
  }

  return {
    scopeType: "global",
    shipDeploymentId: null,
  }
}

function matchesKnowledgeScope(args: {
  scope: VaultKnowledgeScope
  scopeType: "ship" | "fleet" | "global"
  shipDeploymentId: string | null
  requestedShipDeploymentId?: string
}): boolean {
  if (args.scope === "all") {
    return true
  }

  if (args.scope === "fleet") {
    return args.scopeType === "fleet"
  }

  if (!args.requestedShipDeploymentId) {
    return false
  }

  return args.scopeType === "ship" && args.shipDeploymentId === args.requestedShipDeploymentId
}

function queryTargetsForScope(args: {
  scope: VaultKnowledgeScope
  shipDeploymentId?: string
}): Array<{
  domain?: DataCoreDomain
  prefix?: string
}> {
  if (args.scope === "ship") {
    if (!args.shipDeploymentId) {
      return []
    }
    return [
      {
        domain: "ship",
        prefix: `ship/${args.shipDeploymentId}/`,
      },
    ]
  }

  if (args.scope === "fleet") {
    return [
      {
        domain: "ship",
        prefix: "ship/fleet/",
      },
    ]
  }

  return [{}]
}

function toJoinedPath(args: {
  canonicalPath: string
  context: CanonicalMappingContext
}): string {
  const domain = domainFromCanonicalPath(args.canonicalPath)
  const physicalVaultId = physicalVaultForDomain(domain)
  const physicalPath = fromCanonicalPath({
    domain,
    canonicalPath: args.canonicalPath,
    context: args.context,
  })
  return toJoinedVaultPath(physicalVaultId, physicalPath)
}

export interface MergedMemoryRetriever {
  query(args: {
    query: string
    mode?: VaultRagQueryMode
    k?: number
    scope?: VaultKnowledgeScope
    shipDeploymentId?: string
    userId?: string
    includePrivate?: boolean
  }): Promise<VaultRagQueryResult>
}

export class DataCoreMergedMemoryRetriever implements MergedMemoryRetriever {
  async query(args: {
    query: string
    mode?: VaultRagQueryMode
    k?: number
    scope?: VaultKnowledgeScope
    shipDeploymentId?: string
    userId?: string
    includePrivate?: boolean
  }): Promise<VaultRagQueryResult> {
    const query = args.query.trim()
    const mode = args.mode || "hybrid"
    const k = toPositiveTopK(args.k)
    const scope = args.scope || "all"

    if (!query) {
      return {
        mode,
        fallbackUsed: mode !== "lexical",
        results: [],
      }
    }

    const context: CanonicalMappingContext = {
      clusterId: dataCoreClusterId(),
      userId: args.userId,
      shipDeploymentId: args.shipDeploymentId,
    }

    const publicTargets = queryTargetsForScope({
      scope,
      shipDeploymentId: args.shipDeploymentId,
    })

    const publicResponses = await Promise.all(
      publicTargets.map((target) =>
        getDataCoreClient().queryMemory({
          query,
          mode,
          domain: target.domain,
          prefix: target.prefix,
          k: Math.max(20, k * 3),
        }),
      ),
    )

    const publicCitations: VaultRagCitation[] = []
    for (const response of publicResponses) {
      for (const result of response.results) {
        for (const citation of result.citations) {
          const joinedPath = toJoinedPath({
            canonicalPath: citation.canonicalPath,
            context,
          })
          const scopeMeta = knowledgeScopeFromCanonicalPath(citation.canonicalPath)
          if (
            !matchesKnowledgeScope({
              scope,
              scopeType: scopeMeta.scopeType,
              shipDeploymentId: scopeMeta.shipDeploymentId,
              requestedShipDeploymentId: args.shipDeploymentId,
            })
          ) {
            continue
          }

          publicCitations.push({
            id: citation.id,
            path: joinedPath,
            title: result.title,
            excerpt: citation.excerpt,
            scopeType: scopeMeta.scopeType,
            shipDeploymentId: scopeMeta.shipDeploymentId,
            score: citation.score,
            lexicalScore: citation.lexicalScore,
            semanticScore: citation.semanticScore,
          })
        }
      }
    }

    let privateMode: VaultRagQueryMode = mode
    let privateFallbackUsed = false
    let privateCitations: VaultRagCitation[] = []
    const includePrivate = args.includePrivate !== false
    if (includePrivate && scope === "all") {
      const privateQuery = await queryLocalPrivateRag({
        query,
        mode,
        k: Math.max(20, k * 2),
      })
      privateMode = privateQuery.mode
      privateFallbackUsed = privateQuery.fallbackUsed
      privateCitations = privateQuery.results.map((citation) => ({
        ...citation,
        score: Number((citation.score + 0.15).toFixed(4)),
      }))
    }

    const combined = [...publicCitations, ...privateCitations]
      .sort((left, right) => right.score - left.score)
      .slice(0, k)
      .map((citation, idx) => ({
        ...citation,
        id: `S${idx + 1}`,
      }))

    const publicFallback = publicResponses.some((response) => response.fallbackUsed)

    return {
      mode: mode === "lexical" ? "lexical" : (publicResponses[0]?.mode || privateMode || mode),
      fallbackUsed: publicFallback || privateFallbackUsed,
      results: combined,
    }
  }
}

let singleton: MergedMemoryRetriever | null = null

export function getMergedMemoryRetriever(): MergedMemoryRetriever {
  singleton ||= new DataCoreMergedMemoryRetriever()
  return singleton
}

