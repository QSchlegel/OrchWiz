import { sanitizeRelativeVaultPath } from "./path"

export type ShipKnowledgeScope = "ship" | "fleet" | "all"

export interface ShipKnowledgeTreeNode {
  id: string
  name: string
  path: string
  nodeType: "folder" | "file"
  children?: ShipKnowledgeTreeNode[]
}

const SHIP_KB_ROOT = "kb/ships"
const FLEET_KB_ROOT = "kb/fleet"

export function parseShipKnowledgeScope(value: string | null | undefined): ShipKnowledgeScope {
  if (value === "ship" || value === "fleet") {
    return value
  }
  return "all"
}

export function shipKnowledgePrefix(scope: Exclude<ShipKnowledgeScope, "all">, shipDeploymentId: string): string {
  if (scope === "ship") {
    return `${SHIP_KB_ROOT}/${shipDeploymentId}/`
  }
  return `${FLEET_KB_ROOT}/`
}

export function shipKnowledgeAllowedPrefixes(shipDeploymentId: string): string[] {
  return [
    shipKnowledgePrefix("ship", shipDeploymentId),
    shipKnowledgePrefix("fleet", shipDeploymentId),
  ]
}

export function isShipKnowledgePath(path: string, shipDeploymentId: string): boolean {
  const normalized = path.replaceAll("\\", "/").toLowerCase()
  const shipPrefix = shipKnowledgePrefix("ship", shipDeploymentId).toLowerCase()
  const fleetPrefix = shipKnowledgePrefix("fleet", shipDeploymentId).toLowerCase()
  return normalized.startsWith(shipPrefix) || normalized.startsWith(fleetPrefix)
}

export function normalizeShipKnowledgePath(pathInput: string, shipDeploymentId: string): string {
  const normalized = sanitizeRelativeVaultPath(pathInput, { requireMarkdown: true })
  if (!isShipKnowledgePath(normalized, shipDeploymentId)) {
    throw new Error(
      `Knowledge path must be under ${shipKnowledgePrefix("ship", shipDeploymentId)} or ${shipKnowledgePrefix("fleet", shipDeploymentId)}.`,
    )
  }
  return normalized
}

export function composeShipKnowledgePath(args: {
  scope: Exclude<ShipKnowledgeScope, "all">
  shipDeploymentId: string
  relativePath: string
}): string {
  const relative = args.relativePath.trim().replaceAll("\\", "/").replace(/^\/+/u, "")
  if (!relative) {
    throw new Error("relativePath is required")
  }

  const withExtension = relative.toLowerCase().endsWith(".md") ? relative : `${relative}.md`
  return normalizeShipKnowledgePath(`${shipKnowledgePrefix(args.scope, args.shipDeploymentId)}${withExtension}`, args.shipDeploymentId)
}

export function filterShipKnowledgePaths(args: {
  paths: string[]
  scope: ShipKnowledgeScope
  shipDeploymentId: string
}): string[] {
  const shipPrefix = shipKnowledgePrefix("ship", args.shipDeploymentId)
  const fleetPrefix = shipKnowledgePrefix("fleet", args.shipDeploymentId)

  return args.paths
    .filter((path) => {
      if (args.scope === "ship") {
        return path.startsWith(shipPrefix)
      }
      if (args.scope === "fleet") {
        return path.startsWith(fleetPrefix)
      }
      return path.startsWith(shipPrefix) || path.startsWith(fleetPrefix)
    })
    .sort((left, right) => left.localeCompare(right))
}

export function buildShipKnowledgeTree(paths: string[]): ShipKnowledgeTreeNode[] {
  interface MutableNode {
    id: string
    name: string
    path: string
    nodeType: "folder" | "file"
    children?: Map<string, MutableNode>
  }

  const root = new Map<string, MutableNode>()

  const ensureNode = (collection: Map<string, MutableNode>, segment: string, path: string, nodeType: "folder" | "file"): MutableNode => {
    const existing = collection.get(segment)
    if (existing) {
      if (nodeType === "folder" && !existing.children) {
        existing.children = new Map()
      }
      return existing
    }

    const created: MutableNode = {
      id: path,
      name: segment,
      path,
      nodeType,
      ...(nodeType === "folder" ? { children: new Map<string, MutableNode>() } : {}),
    }
    collection.set(segment, created)
    return created
  }

  for (const path of paths) {
    const segments = path.split("/").filter(Boolean)
    let current = root
    let builtPath = ""

    for (let idx = 0; idx < segments.length; idx += 1) {
      const segment = segments[idx]
      builtPath = builtPath ? `${builtPath}/${segment}` : segment
      const isLeaf = idx === segments.length - 1
      const node = ensureNode(current, segment, builtPath, isLeaf ? "file" : "folder")
      if (!isLeaf) {
        current = node.children as Map<string, MutableNode>
      }
    }
  }

  const serialize = (collection: Map<string, MutableNode>): ShipKnowledgeTreeNode[] =>
    [...collection.values()]
      .sort((left, right) => {
        if (left.nodeType !== right.nodeType) {
          return left.nodeType === "folder" ? -1 : 1
        }
        return left.name.localeCompare(right.name)
      })
      .map((node) => ({
        id: node.id,
        name: node.name,
        path: node.path,
        nodeType: node.nodeType,
        ...(node.children && node.children.size > 0 ? { children: serialize(node.children) } : {}),
      }))

  return serialize(root)
}
