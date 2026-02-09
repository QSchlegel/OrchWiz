import { basename, dirname, extname, posix } from "node:path"
import {
  JOINED_VAULT_ID,
  listPhysicalVaultDefinitions,
  parseJoinedVaultPath,
  resolveVaultAbsolutePath,
  resolveVaultIdByNamespace,
  toJoinedVaultPath,
} from "./config"
import {
  buildVaultTree,
  collectMarkdownFilePaths,
  countMarkdownFiles,
  directoryExists,
  readMarkdownFileWithLimit,
} from "./fs"
import { sanitizeRelativeVaultPath } from "./path"
import type {
  PhysicalVaultId,
  VaultFileResponse,
  VaultId,
  VaultLinkRef,
  VaultSearchResponse,
  VaultSummary,
  VaultTreeNode,
  VaultTreeResponse,
} from "./types"

const PREVIEW_MAX_BYTES = Number.isFinite(Number(process.env.VAULT_MAX_PREVIEW_BYTES))
  ? Number(process.env.VAULT_MAX_PREVIEW_BYTES)
  : 256 * 1024
const SEARCH_MAX_BYTES = Number.isFinite(Number(process.env.VAULT_SEARCH_MAX_BYTES))
  ? Number(process.env.VAULT_SEARCH_MAX_BYTES)
  : 128 * 1024

interface RawVaultLink {
  kind: "wiki" | "markdown"
  target: string
  label: string
}

interface ResolvedVaultLinkTarget {
  physicalVaultId: PhysicalVaultId
  physicalPath: string
}

interface NoteCatalog {
  entriesByVault: Map<PhysicalVaultId, string[]>
  lookupByVault: Map<PhysicalVaultId, Set<string>>
  basenameByVault: Map<PhysicalVaultId, Map<string, string[]>>
}

interface RequestedNoteTarget {
  requestedVaultId: VaultId
  requestedPath: string
  physicalVaultId: PhysicalVaultId
  physicalPath: string
}

export class VaultRequestError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

function normalizeLookupKey(path: string): string {
  return path.toLowerCase()
}

function toScopedPath(vaultId: VaultId, physicalVaultId: PhysicalVaultId, physicalPath: string): string {
  if (vaultId === JOINED_VAULT_ID) {
    return toJoinedVaultPath(physicalVaultId, physicalPath)
  }
  return physicalPath
}

function createExcerpt(content: string, query: string): string {
  if (!content.trim()) return ""
  const compact = content.replace(/\s+/g, " ").trim()
  const lowerContent = compact.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const matchIndex = lowerContent.indexOf(lowerQuery)

  if (matchIndex === -1) {
    return compact.slice(0, 180)
  }

  const start = Math.max(0, matchIndex - 80)
  const end = Math.min(compact.length, matchIndex + lowerQuery.length + 100)
  return compact.slice(start, end)
}

function isExternalTarget(target: string): boolean {
  if (!target) return true
  if (target.startsWith("#")) return true
  if (target.startsWith("//")) return true
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/u.test(target)) return true
  return false
}

function normalizeLinkTarget(rawTarget: string): string {
  const trimmed = rawTarget.trim().replace(/^<|>$/gu, "")
  const noFragment = trimmed.split("#")[0] || ""
  const noQuery = noFragment.split("?")[0] || ""
  return noQuery.replaceAll("\\", "/").trim()
}

function buildCatalogFromMap(pathsByVault: Map<PhysicalVaultId, string[]>): NoteCatalog {
  const lookupByVault = new Map<PhysicalVaultId, Set<string>>()
  const basenameByVault = new Map<PhysicalVaultId, Map<string, string[]>>()

  for (const [vaultId, paths] of pathsByVault.entries()) {
    lookupByVault.set(
      vaultId,
      new Set(paths.map((path) => normalizeLookupKey(path))),
    )

    const byBasename = new Map<string, string[]>()
    for (const path of paths) {
      const key = basename(path, ".md").toLowerCase()
      const existing = byBasename.get(key) || []
      existing.push(path)
      byBasename.set(key, existing)
    }

    basenameByVault.set(vaultId, byBasename)
  }

  return {
    entriesByVault: pathsByVault,
    lookupByVault,
    basenameByVault,
  }
}

async function buildCatalogForScope(scopeVaultId: VaultId): Promise<NoteCatalog> {
  const physicalVaultIds: PhysicalVaultId[] = []
  if (scopeVaultId === JOINED_VAULT_ID) {
    for (const definition of listPhysicalVaultDefinitions()) {
      physicalVaultIds.push(definition.id)
    }
  } else {
    physicalVaultIds.push(scopeVaultId as PhysicalVaultId)
  }

  const pathsByVault = new Map<PhysicalVaultId, string[]>()
  for (const physicalVaultId of physicalVaultIds) {
    const rootPath = resolveVaultAbsolutePath(physicalVaultId)
    if (!(await directoryExists(rootPath))) {
      continue
    }

    const paths = await collectMarkdownFilePaths(rootPath)
    pathsByVault.set(physicalVaultId, paths)
  }

  return buildCatalogFromMap(pathsByVault)
}

function resolveRequestedNoteTarget(vaultId: VaultId, notePathInput: string): RequestedNoteTarget {
  if (vaultId === JOINED_VAULT_ID) {
    const joinedPath = sanitizeRelativeVaultPath(notePathInput, { requireMarkdown: true })
    const parsed = parseJoinedVaultPath(joinedPath)
    if (!parsed) {
      throw new VaultRequestError("Joined vault note paths must start with a vault namespace.", 400)
    }

    const innerPath = sanitizeRelativeVaultPath(parsed.innerPath, { requireMarkdown: true })
    return {
      requestedVaultId: vaultId,
      requestedPath: joinedPath,
      physicalVaultId: parsed.vaultId,
      physicalPath: innerPath,
    }
  }

  const path = sanitizeRelativeVaultPath(notePathInput, { requireMarkdown: true })
  return {
    requestedVaultId: vaultId,
    requestedPath: path,
    physicalVaultId: vaultId as PhysicalVaultId,
    physicalPath: path,
  }
}

export function extractVaultLinks(markdown: string): RawVaultLink[] {
  const links: RawVaultLink[] = []

  const wikiRegex = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/gu
  let wikiMatch = wikiRegex.exec(markdown)
  while (wikiMatch) {
    const target = (wikiMatch[1] || "").trim()
    const fallbackLabel = target.split("/").at(-1) || target
    const label = (wikiMatch[2] || fallbackLabel).trim()

    if (target) {
      links.push({
        kind: "wiki",
        target,
        label: label || target,
      })
    }

    wikiMatch = wikiRegex.exec(markdown)
  }

  const markdownRegex = /\[([^\]]+)\]\(([^)]+)\)/gu
  let markdownMatch = markdownRegex.exec(markdown)
  while (markdownMatch) {
    const previousChar = markdownMatch.index > 0 ? markdown[markdownMatch.index - 1] : ""
    if (previousChar === "!") {
      markdownMatch = markdownRegex.exec(markdown)
      continue
    }

    const label = (markdownMatch[1] || "").trim()
    const target = (markdownMatch[2] || "").trim()
    if (target) {
      links.push({
        kind: "markdown",
        target,
        label: label || target,
      })
    }

    markdownMatch = markdownRegex.exec(markdown)
  }

  return links
}

export function resolveVaultLinkTarget(input: {
  scopeVaultId: VaultId
  sourcePhysicalVaultId: PhysicalVaultId
  sourcePhysicalPath: string
  target: string
  catalogPathsByVault: Partial<Record<PhysicalVaultId, string[]>>
}): ResolvedVaultLinkTarget | null {
  const pathsByVault = new Map<PhysicalVaultId, string[]>()
  for (const definition of listPhysicalVaultDefinitions()) {
    const entries = input.catalogPathsByVault[definition.id]
    if (entries && entries.length > 0) {
      pathsByVault.set(definition.id, entries)
    }
  }

  const catalog = buildCatalogFromMap(pathsByVault)
  return resolveVaultLinkTargetWithCatalog({
    scopeVaultId: input.scopeVaultId,
    sourcePhysicalVaultId: input.sourcePhysicalVaultId,
    sourcePhysicalPath: input.sourcePhysicalPath,
    target: input.target,
    catalog,
  })
}

function resolveVaultLinkTargetWithCatalog(input: {
  scopeVaultId: VaultId
  sourcePhysicalVaultId: PhysicalVaultId
  sourcePhysicalPath: string
  target: string
  catalog: NoteCatalog
}): ResolvedVaultLinkTarget | null {
  let normalizedTarget = normalizeLinkTarget(input.target)
  if (!normalizedTarget || isExternalTarget(normalizedTarget)) {
    return null
  }

  let targetVaultId = input.sourcePhysicalVaultId

  if (input.scopeVaultId === JOINED_VAULT_ID) {
    const targetSegments = normalizedTarget.split("/")
    const namespace = targetSegments[0]
    const namespaceVaultId = namespace ? resolveVaultIdByNamespace(namespace) : null
    if (namespaceVaultId && targetSegments.length > 1) {
      targetVaultId = namespaceVaultId
      normalizedTarget = targetSegments.slice(1).join("/")
    }
  }

  const sourceDir = dirname(input.sourcePhysicalPath)
  let candidatePath = normalizedTarget
  if (normalizedTarget.startsWith("/")) {
    candidatePath = normalizedTarget.slice(1)
  } else {
    const baseDir = sourceDir === "." ? "" : sourceDir
    candidatePath = posix.join(baseDir, normalizedTarget)
  }

  candidatePath = posix.normalize(candidatePath)
  if (!candidatePath || candidatePath === "." || candidatePath === ".." || candidatePath.startsWith("../")) {
    return null
  }

  if (!extname(candidatePath)) {
    candidatePath = `${candidatePath}.md`
  }

  if (extname(candidatePath).toLowerCase() !== ".md") {
    return null
  }

  let sanitizedPath: string
  try {
    sanitizedPath = sanitizeRelativeVaultPath(candidatePath, { requireMarkdown: true })
  } catch {
    return null
  }

  const lookup = input.catalog.lookupByVault.get(targetVaultId)
  if (lookup?.has(normalizeLookupKey(sanitizedPath))) {
    return {
      physicalVaultId: targetVaultId,
      physicalPath: sanitizedPath,
    }
  }

  const basenameKey = basename(sanitizedPath, ".md").toLowerCase()
  const basenameCandidates = input.catalog.basenameByVault.get(targetVaultId)?.get(basenameKey) || []
  if (basenameCandidates.length === 1) {
    return {
      physicalVaultId: targetVaultId,
      physicalPath: basenameCandidates[0],
    }
  }

  return null
}

function mapTreeNodeToJoined(node: VaultTreeNode, physicalVaultId: PhysicalVaultId): VaultTreeNode {
  const joinedPath = toJoinedVaultPath(physicalVaultId, node.path)
  return {
    id: `${JOINED_VAULT_ID}:${joinedPath}`,
    name: node.name,
    path: joinedPath,
    nodeType: node.nodeType,
    vaultId: JOINED_VAULT_ID,
    originVaultId: physicalVaultId,
    children: node.children?.map((childNode) => mapTreeNodeToJoined(childNode, physicalVaultId)),
  }
}

export async function getVaultSummaries(): Promise<VaultSummary[]> {
  const physicalSummaries: VaultSummary[] = []
  for (const definition of listPhysicalVaultDefinitions()) {
    const absolutePath = resolveVaultAbsolutePath(definition.id)
    const exists = await directoryExists(absolutePath)
    const noteCount = exists ? await countMarkdownFiles(absolutePath) : 0

    physicalSummaries.push({
      id: definition.id,
      label: definition.label,
      exists,
      isPrivate: definition.isPrivate,
      isJoined: false,
      encryptedLabel: definition.encryptedLabel,
      noteCount,
    })
  }

  const joinedSummary: VaultSummary = {
    id: JOINED_VAULT_ID,
    label: "Joined Vault",
    exists: physicalSummaries.some((summary) => summary.exists),
    isPrivate: false,
    isJoined: true,
    noteCount: physicalSummaries.reduce((total, summary) => total + summary.noteCount, 0),
  }

  return [...physicalSummaries, joinedSummary]
}

export async function getVaultTree(vaultId: VaultId): Promise<VaultTreeResponse> {
  if (vaultId === JOINED_VAULT_ID) {
    const joinedTree: VaultTreeNode[] = []

    for (const definition of listPhysicalVaultDefinitions()) {
      const rootPath = resolveVaultAbsolutePath(definition.id)
      if (!(await directoryExists(rootPath))) {
        continue
      }

      const physicalTree = await buildVaultTree(rootPath, definition.id)
      joinedTree.push({
        id: `${JOINED_VAULT_ID}:${definition.namespace}`,
        name: definition.namespace,
        path: definition.namespace,
        nodeType: "folder",
        vaultId: JOINED_VAULT_ID,
        originVaultId: definition.id,
        children: physicalTree.map((node) => mapTreeNodeToJoined(node, definition.id)),
      })
    }

    return {
      vaultId,
      exists: joinedTree.length > 0,
      tree: joinedTree,
    }
  }

  const physicalVaultId = vaultId as PhysicalVaultId
  const rootPath = resolveVaultAbsolutePath(physicalVaultId)
  if (!(await directoryExists(rootPath))) {
    return {
      vaultId,
      exists: false,
      tree: [],
    }
  }

  const tree = await buildVaultTree(rootPath, physicalVaultId)
  return {
    vaultId,
    exists: true,
    tree,
  }
}

export async function getVaultFile(vaultId: VaultId, notePathInput: string): Promise<VaultFileResponse> {
  const requested = resolveRequestedNoteTarget(vaultId, notePathInput)
  const vaultRootPath = resolveVaultAbsolutePath(requested.physicalVaultId)
  if (!(await directoryExists(vaultRootPath))) {
    throw new VaultRequestError("Vault directory does not exist.", 404)
  }

  let fileData: Awaited<ReturnType<typeof readMarkdownFileWithLimit>>
  try {
    fileData = await readMarkdownFileWithLimit(vaultRootPath, requested.physicalPath, PREVIEW_MAX_BYTES)
  } catch {
    throw new VaultRequestError("Vault note not found.", 404)
  }

  const catalog = await buildCatalogForScope(vaultId)
  const sourcePathForResponse = requested.requestedPath
  const sourceVaultIdForResponse = requested.requestedVaultId

  const outgoingLinks = extractVaultLinks(fileData.content).map((rawLink): VaultLinkRef => {
    const resolved = resolveVaultLinkTargetWithCatalog({
      scopeVaultId: vaultId,
      sourcePhysicalVaultId: requested.physicalVaultId,
      sourcePhysicalPath: requested.physicalPath,
      target: rawLink.target,
      catalog,
    })

    return {
      kind: rawLink.kind,
      sourceVaultId: sourceVaultIdForResponse,
      sourcePath: sourcePathForResponse,
      target: rawLink.target,
      label: rawLink.label,
      resolvedVaultId: resolved ? sourceVaultIdForResponse : null,
      resolvedPath: resolved ? toScopedPath(vaultId, resolved.physicalVaultId, resolved.physicalPath) : null,
      exists: Boolean(resolved),
      originVaultId: resolved?.physicalVaultId,
    }
  })

  const backlinks: VaultLinkRef[] = []
  const requestedLookupPath = normalizeLookupKey(requested.physicalPath)

  for (const [sourcePhysicalVaultId, sourcePaths] of catalog.entriesByVault.entries()) {
    const sourceVaultRootPath = resolveVaultAbsolutePath(sourcePhysicalVaultId)

    for (const sourcePhysicalPath of sourcePaths) {
      if (
        sourcePhysicalVaultId === requested.physicalVaultId &&
        normalizeLookupKey(sourcePhysicalPath) === requestedLookupPath
      ) {
        continue
      }

      let sourceContent = ""
      try {
        const sourceFile = await readMarkdownFileWithLimit(sourceVaultRootPath, sourcePhysicalPath, SEARCH_MAX_BYTES)
        sourceContent = sourceFile.content
      } catch {
        continue
      }

      const sourceLinks = extractVaultLinks(sourceContent)
      for (const sourceLink of sourceLinks) {
        const resolved = resolveVaultLinkTargetWithCatalog({
          scopeVaultId: vaultId,
          sourcePhysicalVaultId,
          sourcePhysicalPath,
          target: sourceLink.target,
          catalog,
        })

        if (!resolved) continue
        if (resolved.physicalVaultId !== requested.physicalVaultId) continue
        if (normalizeLookupKey(resolved.physicalPath) !== requestedLookupPath) continue

        backlinks.push({
          kind: sourceLink.kind,
          sourceVaultId: sourceVaultIdForResponse,
          sourcePath: toScopedPath(vaultId, sourcePhysicalVaultId, sourcePhysicalPath),
          target: sourceLink.target,
          label: sourceLink.label,
          resolvedVaultId: sourceVaultIdForResponse,
          resolvedPath: sourcePathForResponse,
          exists: true,
          originVaultId: sourcePhysicalVaultId,
        })
      }
    }
  }

  return {
    vaultId,
    path: sourcePathForResponse,
    content: fileData.content,
    truncated: fileData.truncated,
    size: fileData.size,
    mtime: fileData.mtime.toISOString(),
    outgoingLinks,
    backlinks,
    originVaultId: requested.physicalVaultId,
  }
}

export async function searchVaultNotes(vaultId: VaultId, queryInput: string): Promise<VaultSearchResponse> {
  const query = queryInput.trim()
  const catalog = await buildCatalogForScope(vaultId)

  if (catalog.entriesByVault.size === 0) {
    return {
      vaultId,
      exists: false,
      results: [],
    }
  }

  if (!query) {
    return {
      vaultId,
      exists: true,
      results: [],
    }
  }

  const lowerQuery = query.toLowerCase()
  const results: VaultSearchResponse["results"] = []

  for (const [physicalVaultId, paths] of catalog.entriesByVault.entries()) {
    const rootPath = resolveVaultAbsolutePath(physicalVaultId)

    for (const physicalPath of paths) {
      let content = ""
      try {
        const fileData = await readMarkdownFileWithLimit(rootPath, physicalPath, SEARCH_MAX_BYTES)
        content = fileData.content
      } catch {
        continue
      }

      const title = basename(physicalPath, ".md")
      const searchablePath = physicalPath.toLowerCase()
      const searchableTitle = title.toLowerCase()
      const searchableContent = content.toLowerCase()

      if (
        !searchablePath.includes(lowerQuery) &&
        !searchableTitle.includes(lowerQuery) &&
        !searchableContent.includes(lowerQuery)
      ) {
        continue
      }

      results.push({
        vaultId,
        path: toScopedPath(vaultId, physicalVaultId, physicalPath),
        title,
        excerpt: createExcerpt(content, query),
        originVaultId: physicalVaultId,
      })
    }
  }

  results.sort((a, b) => a.path.localeCompare(b.path))

  return {
    vaultId,
    exists: true,
    results: results.slice(0, 100),
  }
}
