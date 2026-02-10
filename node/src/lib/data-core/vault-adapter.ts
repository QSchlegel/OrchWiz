import type {
  VaultDeleteMode,
  VaultDeleteResponse,
  VaultFileReadMode,
  VaultFileResponse,
  VaultGraphResponse,
  VaultId,
  VaultMoveResponse,
  VaultSaveResponse,
  VaultSearchResponse,
  VaultSummary,
  VaultTreeNode,
  VaultTreeResponse,
  PhysicalVaultId,
  VaultRagMode,
} from "@/lib/vault/types"
import type { VaultKnowledgeScope } from "@/lib/vault/rag"
import { getDataCoreClient } from "./client"
import { dataCoreClusterId } from "./config"
import { domainFromCanonicalPath, fromCanonicalPath, isDataCoreBackedPhysicalVault, resolvePhysicalTargetFromVaultRequest, toCanonicalPath, type CanonicalMappingContext } from "./canonical"
import { getVaultFile, getVaultGraph, getVaultSummaries, getVaultTree, saveVaultFile, moveVaultFile, deleteVaultFile } from "@/lib/vault"
import type { DataCoreDomain } from "./types"
import { toJoinedVaultPath } from "@/lib/vault/config"
import { searchLocalPrivateRagNotes } from "./local-private-rag"

function domainForPhysicalVault(vaultId: PhysicalVaultId): DataCoreDomain {
  if (vaultId === "orchwiz") return "orchwiz"
  if (vaultId === "ship") return "ship"
  return "agent-public"
}

function physicalVaultForDomain(domain: DataCoreDomain): PhysicalVaultId {
  if (domain === "orchwiz") return "orchwiz"
  if (domain === "ship") return "ship"
  return "agent-public"
}

function contextForAdapter(args: {
  userId?: string
  shipDeploymentId?: string
}): CanonicalMappingContext {
  return {
    userId: args.userId,
    shipDeploymentId: args.shipDeploymentId,
    clusterId: dataCoreClusterId(),
  }
}

function mapDataCoreTreeToVaultTree(args: {
  domain: DataCoreDomain
  nodes: Array<Record<string, unknown>>
  requestedVaultId: VaultId
  context: CanonicalMappingContext
}): VaultTreeNode[] {
  const physicalVaultId = physicalVaultForDomain(args.domain)

  const visit = (node: Record<string, unknown>): VaultTreeNode => {
    const nodePathRaw = typeof node.path === "string" ? node.path : ""
    const nodeType = node.nodeType === "folder" ? "folder" : "file"

    let mappedPath = nodePathRaw
    if (nodeType === "file") {
      mappedPath = fromCanonicalPath({
        domain: args.domain,
        canonicalPath: nodePathRaw,
        context: args.context,
      })
    }

    if (args.requestedVaultId === "joined") {
      mappedPath = toJoinedVaultPath(physicalVaultId, mappedPath)
    }

    const childrenRaw = Array.isArray(node.children) ? node.children : []

    return {
      id: `${args.requestedVaultId}:${mappedPath}`,
      name: typeof node.name === "string" ? node.name : mappedPath.split("/").at(-1) || mappedPath,
      path: mappedPath,
      nodeType,
      vaultId: args.requestedVaultId,
      originVaultId: physicalVaultId,
      ...(childrenRaw.length > 0
        ? {
            children: childrenRaw.map((entry) => visit(entry as Record<string, unknown>)),
          }
        : {}),
    }
  }

  return args.nodes.map((node) => visit(node))
}

function mapCanonicalPathToRequested(args: {
  canonicalPath: string
  requestedVaultId: VaultId
  context: CanonicalMappingContext
}): { physicalVaultId: PhysicalVaultId; path: string } {
  const domain = domainFromCanonicalPath(args.canonicalPath)
  const physicalVaultId = physicalVaultForDomain(domain)
  const physicalPath = fromCanonicalPath({
    domain,
    canonicalPath: args.canonicalPath,
    context: args.context,
  })

  return {
    physicalVaultId,
    path: args.requestedVaultId === "joined" ? toJoinedVaultPath(physicalVaultId, physicalPath) : physicalPath,
  }
}

function scopeForCanonicalPath(canonicalPath: string): {
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

function joinedPublicQueryTargets(args: {
  scope?: VaultKnowledgeScope
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

function mergeByPath(results: VaultSearchResponse["results"]): VaultSearchResponse["results"] {
  const seen = new Set<string>()
  const deduped: VaultSearchResponse["results"] = []
  for (const result of results) {
    if (seen.has(result.path)) continue
    seen.add(result.path)
    deduped.push(result)
  }
  return deduped
}

export async function getVaultSummariesFromDataCore(): Promise<VaultSummary[]> {
  const client = getDataCoreClient()
  const orchwizTree = await client.getTree({ domain: "orchwiz" })
  const shipTree = await client.getTree({ domain: "ship" })
  const agentPublicTree = await client.getTree({ domain: "agent-public" })

  const local = await getVaultSummaries()
  const privateSummary = local.find((entry) => entry.id === "agent-private")

  const summaries: VaultSummary[] = [
    {
      id: "orchwiz",
      label: "OrchWiz Vault",
      exists: orchwizTree.noteCount > 0,
      isPrivate: false,
      isJoined: false,
      noteCount: orchwizTree.noteCount,
    },
    {
      id: "ship",
      label: "Ship Vault",
      exists: shipTree.noteCount > 0,
      isPrivate: false,
      isJoined: false,
      noteCount: shipTree.noteCount,
    },
    {
      id: "agent-public",
      label: "Agent Vault Public",
      exists: agentPublicTree.noteCount > 0,
      isPrivate: false,
      isJoined: false,
      noteCount: agentPublicTree.noteCount,
    },
    privateSummary || {
      id: "agent-private",
      label: "Agent Vault Private",
      exists: false,
      isPrivate: true,
      isJoined: false,
      encryptedLabel: "Encrypted via wallet-enclave",
      noteCount: 0,
    },
  ]

  summaries.push({
    id: "joined",
    label: "Joined Vault",
    exists: summaries.some((entry) => entry.id !== "joined" && entry.exists),
    isPrivate: false,
    isJoined: true,
    noteCount: summaries.reduce((sum, entry) => sum + entry.noteCount, 0),
  })

  return summaries
}

export async function getVaultTreeFromDataCore(args: {
  vaultId: VaultId
  userId?: string
  shipDeploymentId?: string
}): Promise<VaultTreeResponse> {
  if (args.vaultId === "agent-private") {
    return getVaultTree("agent-private")
  }

  const client = getDataCoreClient()
  const context = contextForAdapter({ userId: args.userId, shipDeploymentId: args.shipDeploymentId })

  if (args.vaultId === "joined") {
    const [orchwizTree, shipTree, agentPublicTree, privateTree] = await Promise.all([
      client.getTree({ domain: "orchwiz" }),
      client.getTree({ domain: "ship" }),
      client.getTree({ domain: "agent-public" }),
      getVaultTree("agent-private"),
    ])

    const tree: VaultTreeNode[] = [
      ...mapDataCoreTreeToVaultTree({
        domain: "orchwiz",
        nodes: orchwizTree.tree,
        requestedVaultId: "joined",
        context,
      }),
      ...mapDataCoreTreeToVaultTree({
        domain: "ship",
        nodes: shipTree.tree,
        requestedVaultId: "joined",
        context,
      }),
      ...mapDataCoreTreeToVaultTree({
        domain: "agent-public",
        nodes: agentPublicTree.tree,
        requestedVaultId: "joined",
        context,
      }),
      ...privateTree.tree.map((node) => ({
        ...node,
        id: `joined:${toJoinedVaultPath("agent-private", node.path)}`,
        path: toJoinedVaultPath("agent-private", node.path),
        vaultId: "joined" as const,
        originVaultId: "agent-private" as const,
      })),
    ]

    return {
      vaultId: "joined",
      exists: tree.length > 0,
      tree,
    }
  }

  const physicalVaultId = args.vaultId as PhysicalVaultId
  if (!isDataCoreBackedPhysicalVault(physicalVaultId)) {
    return getVaultTree(args.vaultId)
  }

  const domain = domainForPhysicalVault(physicalVaultId)
  const tree = await client.getTree({ domain })

  return {
    vaultId: args.vaultId,
    exists: tree.noteCount > 0,
    tree: mapDataCoreTreeToVaultTree({
      domain,
      nodes: tree.tree,
      requestedVaultId: args.vaultId,
      context,
    }),
  }
}

export async function getVaultFileFromDataCore(args: {
  vaultId: VaultId
  notePath: string
  mode?: VaultFileReadMode
  userId?: string
  shipDeploymentId?: string
}): Promise<VaultFileResponse> {
  const target = resolvePhysicalTargetFromVaultRequest({
    vaultId: args.vaultId,
    notePath: args.notePath,
  })

  if (target.physicalVaultId === "agent-private") {
    return getVaultFile(args.vaultId, args.notePath, { mode: args.mode })
  }

  const context = contextForAdapter({ userId: args.userId, shipDeploymentId: args.shipDeploymentId })
  const mapping = toCanonicalPath({
    physicalVaultId: target.physicalVaultId,
    physicalPath: target.physicalPath,
    context,
  })

  const response = await getDataCoreClient().getFile({
    domain: mapping.domain,
    canonicalPath: mapping.canonicalPath,
  })

  const mapLinkPath = (canonicalPath: string | null): { path: string | null; originVaultId?: PhysicalVaultId } => {
    if (!canonicalPath) {
      return { path: null }
    }

    const mapped = mapCanonicalPathToRequested({
      canonicalPath,
      requestedVaultId: args.vaultId,
      context,
    })

    return {
      path: mapped.path,
      originVaultId: mapped.physicalVaultId,
    }
  }

  return {
    vaultId: args.vaultId,
    path: args.notePath,
    content: response.contentMarkdown,
    truncated: false,
    size: response.size,
    mtime: response.mtime,
    outgoingLinks: response.outgoingLinks.map((link) => {
      const mapped = mapLinkPath(link.resolvedCanonicalPath)
      return {
        kind: link.kind,
        sourceVaultId: args.vaultId,
        sourcePath: args.notePath,
        target: link.target,
        label: link.label,
        resolvedVaultId: mapped.path ? args.vaultId : null,
        resolvedPath: mapped.path,
        exists: link.exists,
        originVaultId: mapped.originVaultId,
      }
    }),
    backlinks: response.backlinks.map((link) => {
      const source = mapLinkPath(link.sourceCanonicalPath)
      return {
        kind: link.kind,
        sourceVaultId: args.vaultId,
        sourcePath: source.path || link.sourceCanonicalPath,
        target: link.target,
        label: link.label,
        resolvedVaultId: args.vaultId,
        resolvedPath: args.notePath,
        exists: true,
        originVaultId: source.originVaultId,
      }
    }),
    originVaultId: target.physicalVaultId,
  }
}

export async function saveVaultFileToDataCore(args: {
  vaultId: VaultId
  notePath: string
  content: string
  userId?: string
  shipDeploymentId?: string
}): Promise<VaultSaveResponse> {
  const target = resolvePhysicalTargetFromVaultRequest({
    vaultId: args.vaultId,
    notePath: args.notePath,
  })

  if (target.physicalVaultId === "agent-private") {
    return saveVaultFile(args.vaultId, args.notePath, args.content)
  }

  const context = contextForAdapter({ userId: args.userId, shipDeploymentId: args.shipDeploymentId })
  const mapping = toCanonicalPath({
    physicalVaultId: target.physicalVaultId,
    physicalPath: target.physicalPath,
    context,
  })

  await getDataCoreClient().upsertMemory({
    domain: mapping.domain,
    canonicalPath: mapping.canonicalPath,
    contentMarkdown: args.content,
    userId: args.userId,
  })

  return {
    vaultId: args.vaultId,
    path: args.notePath,
    size: Buffer.byteLength(args.content, "utf8"),
    mtime: new Date().toISOString(),
    encrypted: false,
    originVaultId: target.physicalVaultId,
  }
}

export async function moveVaultFileToDataCore(args: {
  vaultId: VaultId
  fromPath: string
  toPath: string
  userId?: string
  shipDeploymentId?: string
}): Promise<VaultMoveResponse> {
  const fromTarget = resolvePhysicalTargetFromVaultRequest({ vaultId: args.vaultId, notePath: args.fromPath })
  const toTarget = resolvePhysicalTargetFromVaultRequest({ vaultId: args.vaultId, notePath: args.toPath })

  if (fromTarget.physicalVaultId !== toTarget.physicalVaultId) {
    throw new Error("Cross-vault move is not allowed")
  }

  if (fromTarget.physicalVaultId === "agent-private") {
    return moveVaultFile(args.vaultId, args.fromPath, args.toPath)
  }

  const context = contextForAdapter({ userId: args.userId, shipDeploymentId: args.shipDeploymentId })
  const fromMapping = toCanonicalPath({
    physicalVaultId: fromTarget.physicalVaultId,
    physicalPath: fromTarget.physicalPath,
    context,
  })
  const toMapping = toCanonicalPath({
    physicalVaultId: toTarget.physicalVaultId,
    physicalPath: toTarget.physicalPath,
    context,
  })

  const existing = await getDataCoreClient().getFile({
    domain: fromMapping.domain,
    canonicalPath: fromMapping.canonicalPath,
  })

  await getDataCoreClient().moveMemory({
    domain: toMapping.domain,
    fromCanonicalPath: fromMapping.canonicalPath,
    canonicalPath: toMapping.canonicalPath,
    contentMarkdown: existing.contentMarkdown,
    userId: args.userId,
  })

  return {
    vaultId: args.vaultId,
    fromPath: args.fromPath,
    toPath: args.toPath,
    size: Buffer.byteLength(existing.contentMarkdown, "utf8"),
    mtime: new Date().toISOString(),
    encrypted: false,
    originVaultId: fromTarget.physicalVaultId,
  }
}

export async function deleteVaultFileToDataCore(args: {
  vaultId: VaultId
  notePath: string
  mode?: VaultDeleteMode
  userId?: string
  shipDeploymentId?: string
}): Promise<VaultDeleteResponse> {
  const target = resolvePhysicalTargetFromVaultRequest({
    vaultId: args.vaultId,
    notePath: args.notePath,
  })

  if (target.physicalVaultId === "agent-private") {
    return deleteVaultFile(args.vaultId, args.notePath, args.mode)
  }

  const mode = args.mode || "soft"

  const context = contextForAdapter({ userId: args.userId, shipDeploymentId: args.shipDeploymentId })
  const mapping = toCanonicalPath({
    physicalVaultId: target.physicalVaultId,
    physicalPath: target.physicalPath,
    context,
  })

  if (mode === "soft") {
    const trashPath = `_trash/${new Date().toISOString()}/${target.physicalPath}`
    const trashMapping = toCanonicalPath({
      physicalVaultId: target.physicalVaultId,
      physicalPath: trashPath,
      context,
    })

    const existing = await getDataCoreClient().getFile({
      domain: mapping.domain,
      canonicalPath: mapping.canonicalPath,
    })

    await getDataCoreClient().moveMemory({
      domain: mapping.domain,
      fromCanonicalPath: mapping.canonicalPath,
      canonicalPath: trashMapping.canonicalPath,
      contentMarkdown: existing.contentMarkdown,
      userId: args.userId,
    })

    return {
      vaultId: args.vaultId,
      path: args.notePath,
      mode,
      deletedPath: args.vaultId === "joined" ? toJoinedVaultPath(target.physicalVaultId, trashPath) : trashPath,
      originVaultId: target.physicalVaultId,
    }
  }

  await getDataCoreClient().deleteMemory({
    domain: mapping.domain,
    canonicalPath: mapping.canonicalPath,
    userId: args.userId,
  })

  return {
    vaultId: args.vaultId,
    path: args.notePath,
    mode,
    deletedPath: null,
    originVaultId: target.physicalVaultId,
  }
}

export async function searchVaultNotesFromDataCore(args: {
  vaultId: VaultId
  query: string
  mode?: VaultRagMode
  k?: number
  userId?: string
  shipDeploymentId?: string
  scope?: VaultKnowledgeScope
}): Promise<VaultSearchResponse> {
  if (args.vaultId === "agent-private") {
    return searchLocalPrivateRagNotes({
      query: args.query,
      mode: args.mode,
      k: args.k,
      vaultId: "agent-private",
    })
  }

  const context = contextForAdapter({ userId: args.userId, shipDeploymentId: args.shipDeploymentId })

  const queryPublic = async (domain?: DataCoreDomain, prefix?: string) => {
    return getDataCoreClient().queryMemory({
      query: args.query,
      mode: args.mode,
      domain,
      prefix,
      k: args.k,
    })
  }

  if (args.vaultId !== "joined") {
    const domain = domainForPhysicalVault(args.vaultId as PhysicalVaultId)
    const response = await queryPublic(domain)

    return {
      vaultId: args.vaultId,
      exists: true,
      mode: response.mode,
      fallbackUsed: response.fallbackUsed,
      results: response.results.map((result) => {
        const mapped = mapCanonicalPathToRequested({
          canonicalPath: result.canonicalPath,
          requestedVaultId: args.vaultId,
          context,
        })

        return {
          vaultId: args.vaultId,
          path: mapped.path,
          title: result.title,
          excerpt: result.excerpt,
          originVaultId: mapped.physicalVaultId,
          score: result.score,
          citations: result.citations.map((citation) => {
            const mappedCitation = mapCanonicalPathToRequested({
              canonicalPath: citation.canonicalPath,
              requestedVaultId: args.vaultId,
              context,
            })
            const scopeMeta = scopeForCanonicalPath(citation.canonicalPath)

            return {
              ...citation,
              path: mappedCitation.path,
              title: result.title,
              scopeType: scopeMeta.scopeType,
              shipDeploymentId: scopeMeta.shipDeploymentId,
            }
          }),
        }
      }),
    }
  }

  const publicTargets = joinedPublicQueryTargets({
    scope: args.scope,
    shipDeploymentId: args.shipDeploymentId,
  })
  const includePrivate = !args.scope || args.scope === "all"

  const [publicResponses, privateResponse] = await Promise.all([
    Promise.all(publicTargets.map((target) => queryPublic(target.domain, target.prefix))),
    includePrivate
      ? searchLocalPrivateRagNotes({
          query: args.query,
          mode: args.mode,
          k: args.k,
          vaultId: "joined",
        })
      : Promise.resolve({
          vaultId: "joined" as const,
          exists: true,
          mode: args.mode || "hybrid",
          fallbackUsed: false,
          results: [],
        }),
  ])

  const publicRows = publicResponses.flatMap((response) => response.results)

  const publicResults = publicRows.map((result) => {
    const mapped = mapCanonicalPathToRequested({
      canonicalPath: result.canonicalPath,
      requestedVaultId: "joined",
      context,
    })

    return {
      vaultId: "joined" as const,
      path: mapped.path,
      title: result.title,
      excerpt: result.excerpt,
      originVaultId: mapped.physicalVaultId,
      score: result.score,
      citations: result.citations.map((citation) => {
        const mappedCitation = mapCanonicalPathToRequested({
          canonicalPath: citation.canonicalPath,
          requestedVaultId: "joined",
          context,
        })
        const scopeMeta = scopeForCanonicalPath(citation.canonicalPath)

        return {
          ...citation,
          path: mappedCitation.path,
          title: result.title,
          scopeType: scopeMeta.scopeType,
          shipDeploymentId: scopeMeta.shipDeploymentId,
        }
      }),
    }
  })

  const privateResults: VaultSearchResponse["results"] = privateResponse.results.map((result) => ({
    ...result,
    vaultId: "joined" as const,
    originVaultId: "agent-private" as const,
    score: (result.score || 0.1) + 0.15,
  }))

  const merged = mergeByPath([...publicResults, ...privateResults])
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, Math.max(1, Math.min(100, args.k || 100)))

  return {
    vaultId: "joined",
    exists: merged.length > 0,
    mode: publicResponses[0]?.mode || privateResponse.mode,
    fallbackUsed: publicResponses.some((response) => response.fallbackUsed) || privateResponse.fallbackUsed,
    results: merged,
  }
}

export async function getVaultGraphFromDataCore(args: {
  vaultId: VaultId
  includeUnresolved?: boolean
  userId?: string
  shipDeploymentId?: string
}): Promise<VaultGraphResponse> {
  if (args.vaultId === "agent-private") {
    return getVaultGraph("agent-private", {
      includeUnresolved: args.includeUnresolved,
    })
  }

  const context = contextForAdapter({ userId: args.userId, shipDeploymentId: args.shipDeploymentId })

  const mapGraph = async (domain?: DataCoreDomain, requestedVaultId: VaultId = args.vaultId) => {
    const graph = await getDataCoreClient().getGraph({
      domain,
      includeUnresolved: args.includeUnresolved,
    })

    return {
      nodes: graph.nodes.map((node) => {
        if (node.nodeType === "ghost") {
          return {
            id: node.id,
            nodeType: "ghost" as const,
            vaultId: requestedVaultId,
            path: node.canonicalPath,
            label: node.label,
            unresolvedTarget: node.canonicalPath,
          }
        }

        const mapped = mapCanonicalPathToRequested({
          canonicalPath: node.canonicalPath,
          requestedVaultId,
          context,
        })

        return {
          id: `note:${mapped.path}`,
          nodeType: "note" as const,
          vaultId: requestedVaultId,
          path: mapped.path,
          label: node.label,
          originVaultId: mapped.physicalVaultId,
        }
      }),
      edges: graph.edges.map((edge) => {
        const source = edge.edgeType === "resolved"
          ? mapCanonicalPathToRequested({ canonicalPath: edge.sourceCanonicalPath, requestedVaultId, context }).path
          : edge.sourceCanonicalPath
        const target = edge.edgeType === "resolved"
          ? mapCanonicalPathToRequested({ canonicalPath: edge.targetCanonicalPath, requestedVaultId, context }).path
          : edge.targetCanonicalPath

        return {
          id: edge.id,
          edgeType: edge.edgeType,
          kind: edge.kind,
          source: edge.edgeType === "resolved" ? `note:${source}` : edge.source,
          target: edge.edgeType === "resolved" ? `note:${target}` : edge.target,
          sourcePath: source,
          targetPath: target,
        }
      }),
      stats: graph.stats,
    }
  }

  if (args.vaultId !== "joined") {
    const domain = domainForPhysicalVault(args.vaultId as PhysicalVaultId)
    const mapped = await mapGraph(domain, args.vaultId)
    return {
      vaultId: args.vaultId,
      focusPath: null,
      filters: {
        depth: 2,
        includeUnresolved: args.includeUnresolved ?? true,
        includeTrash: false,
        query: "",
      },
      nodes: mapped.nodes,
      edges: mapped.edges,
      stats: {
        noteCount: mapped.stats.noteCount,
        ghostCount: mapped.stats.ghostCount,
        edgeCount: mapped.stats.edgeCount,
        unresolvedEdgeCount: mapped.stats.unresolvedEdgeCount,
        truncated: false,
      },
    }
  }

  const [publicGraph, privateGraph] = await Promise.all([
    mapGraph(undefined, "joined"),
    getVaultGraph("agent-private", {
      includeUnresolved: args.includeUnresolved,
    }),
  ])

  const privateNodes = privateGraph.nodes.map((node) => ({
    ...node,
    id: node.nodeType === "note" ? `note:${toJoinedVaultPath("agent-private", node.path)}` : node.id,
    vaultId: "joined" as const,
    path: node.nodeType === "note" ? toJoinedVaultPath("agent-private", node.path) : node.path,
    ...(node.nodeType === "note"
      ? {
          originVaultId: "agent-private" as const,
        }
      : {}),
  }))

  const privateEdges = privateGraph.edges.map((edge) => ({
    ...edge,
    sourcePath: edge.sourcePath.startsWith("agent-private/") ? edge.sourcePath : toJoinedVaultPath("agent-private", edge.sourcePath),
    targetPath: edge.targetPath.startsWith("agent-private/") ? edge.targetPath : toJoinedVaultPath("agent-private", edge.targetPath),
    source: edge.edgeType === "resolved"
      ? `note:${edge.sourcePath.startsWith("agent-private/") ? edge.sourcePath : toJoinedVaultPath("agent-private", edge.sourcePath)}`
      : edge.source,
    target: edge.edgeType === "resolved"
      ? `note:${edge.targetPath.startsWith("agent-private/") ? edge.targetPath : toJoinedVaultPath("agent-private", edge.targetPath)}`
      : edge.target,
  }))

  const nodes = [...publicGraph.nodes, ...privateNodes]
  const edges = [...publicGraph.edges, ...privateEdges]

  return {
    vaultId: "joined",
    focusPath: null,
    filters: {
      depth: 2,
      includeUnresolved: args.includeUnresolved ?? true,
      includeTrash: false,
      query: "",
    },
    nodes,
    edges,
    stats: {
      noteCount: nodes.filter((node) => node.nodeType === "note").length,
      ghostCount: nodes.filter((node) => node.nodeType === "ghost").length,
      edgeCount: edges.length,
      unresolvedEdgeCount: edges.filter((edge) => edge.edgeType === "unresolved").length,
      truncated: false,
    },
  }
}
