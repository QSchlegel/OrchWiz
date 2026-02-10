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
  deleteMarkdownFile,
  directoryExists,
  moveMarkdownFile,
  readMarkdownFile,
  readMarkdownFileWithLimit,
  writeMarkdownFile,
} from "./fs"
import {
  searchVaultRagNotes,
  syncVaultRagMutation,
  type VaultRagQueryMode,
} from "./rag"
import { syncLocalPrivateRagMutation } from "@/lib/data-core/local-private-rag"
import { sanitizeRelativeVaultPath } from "./path"
import {
  parsePrivateVaultEncryptedEnvelope,
  serializePrivateVaultEncryptedEnvelope,
} from "./private-encryption"
import {
  decryptPrivateVaultContent,
  encryptPrivateVaultContent,
  privateMemoryEncryptionRequired,
  PrivateVaultEncryptionError,
} from "./private-enclave-client"
import type {
  PhysicalVaultId,
  VaultDeleteMode,
  VaultDeleteResponse,
  VaultFileReadMode,
  VaultFileResponse,
  VaultGraphEdge,
  VaultGraphNode,
  VaultGraphResponse,
  VaultId,
  VaultLinkRef,
  VaultMoveResponse,
  VaultSaveResponse,
  VaultSearchResponse,
  VaultSummary,
  VaultTreeNode,
  VaultTreeResponse,
} from "./types"

function parseEnvByteLimit(name: string, fallback: number): number {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const PREVIEW_MAX_BYTES = parseEnvByteLimit("VAULT_MAX_PREVIEW_BYTES", 256 * 1024)
const EDIT_MAX_BYTES = parseEnvByteLimit("VAULT_MAX_EDIT_BYTES", 2 * 1024 * 1024)
const SEARCH_MAX_BYTES = parseEnvByteLimit("VAULT_SEARCH_MAX_BYTES", 128 * 1024)
const GRAPH_MAX_NOTES = parseEnvByteLimit("VAULT_GRAPH_MAX_NOTES", 2000)
const GRAPH_MAX_EDGES = parseEnvByteLimit("VAULT_GRAPH_MAX_EDGES", 10000)
const PRIVATE_VAULT_ID: PhysicalVaultId = "agent-private"

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

interface ResolvedVaultContent {
  content: string
  size: number
  mtime: Date
  truncated: boolean
}

interface GraphNoteRef {
  physicalVaultId: PhysicalVaultId
  physicalPath: string
  scopedPath: string
}

interface GraphEdgeDraft {
  kind: "wiki" | "markdown"
  sourcePath: string
  sourceNodeId: string
  targetPath: string
  targetNodeId: string
  edgeType: "resolved" | "unresolved"
}

type VaultRagMutationSyncFn = typeof syncVaultRagMutation
let vaultRagMutationSyncImpl: VaultRagMutationSyncFn = syncVaultRagMutation

export function __setVaultRagMutationSyncForTests(nextImpl: VaultRagMutationSyncFn | null): void {
  vaultRagMutationSyncImpl = nextImpl || syncVaultRagMutation
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

function clipContentByByteLimit(content: string, maxBytes: number): { content: string; truncated: boolean } {
  const encoded = Buffer.from(content, "utf8")
  if (encoded.length <= maxBytes) {
    return { content, truncated: false }
  }

  return {
    content: encoded.subarray(0, maxBytes).toString("utf8"),
    truncated: true,
  }
}

function isPrivatePhysicalVault(vaultId: PhysicalVaultId): boolean {
  return vaultId === PRIVATE_VAULT_ID
}

function throwPrivateEncryptionVaultError(error: unknown): never {
  if (error instanceof PrivateVaultEncryptionError) {
    throw new VaultRequestError(error.message, error.status >= 400 ? error.status : 503)
  }
  throw new VaultRequestError("Private vault encryption/decryption failed.", 503)
}

async function readPrivateVaultContent(input: {
  vaultRootPath: string
  physicalPath: string
  maxBytes: number
  allowMigration: boolean
}): Promise<ResolvedVaultContent> {
  const rawFile = await readMarkdownFile(input.vaultRootPath, input.physicalPath)
  const envelope = parsePrivateVaultEncryptedEnvelope(rawFile.content)

  let plaintext: string
  let size = rawFile.size
  let mtime = rawFile.mtime

  if (envelope) {
    try {
      plaintext = await decryptPrivateVaultContent({ envelope })
    } catch (error) {
      if (!privateMemoryEncryptionRequired()) {
        plaintext = rawFile.content
      } else {
        throwPrivateEncryptionVaultError(error)
      }
    }
  } else {
    plaintext = rawFile.content
    if (input.allowMigration) {
      try {
        const encrypted = await encryptPrivateVaultContent({
          relativePath: input.physicalPath,
          plaintext,
        })
        const saved = await writeMarkdownFile(
          input.vaultRootPath,
          input.physicalPath,
          serializePrivateVaultEncryptedEnvelope(encrypted),
        )
        size = saved.size
        mtime = saved.mtime
      } catch (error) {
        if (privateMemoryEncryptionRequired()) {
          throwPrivateEncryptionVaultError(error)
        }
      }
    }
  }

  const clipped = clipContentByByteLimit(plaintext, input.maxBytes)
  return {
    content: clipped.content,
    size,
    mtime,
    truncated: clipped.truncated,
  }
}

async function readPrivateVaultPlaintext(vaultRootPath: string, physicalPath: string): Promise<string> {
  const rawFile = await readMarkdownFile(vaultRootPath, physicalPath)
  const envelope = parsePrivateVaultEncryptedEnvelope(rawFile.content)
  if (!envelope) {
    return rawFile.content
  }

  try {
    return await decryptPrivateVaultContent({ envelope })
  } catch (error) {
    if (!privateMemoryEncryptionRequired()) {
      return rawFile.content
    }
    throwPrivateEncryptionVaultError(error)
  }
}

async function readVaultContent(input: {
  physicalVaultId: PhysicalVaultId
  physicalPath: string
  maxBytes: number
  allowPrivateMigration: boolean
}): Promise<ResolvedVaultContent> {
  const vaultRootPath = resolveVaultAbsolutePath(input.physicalVaultId)
  if (isPrivatePhysicalVault(input.physicalVaultId)) {
    return readPrivateVaultContent({
      vaultRootPath,
      physicalPath: input.physicalPath,
      maxBytes: input.maxBytes,
      allowMigration: input.allowPrivateMigration,
    })
  }

  return readMarkdownFileWithLimit(vaultRootPath, input.physicalPath, input.maxBytes)
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

function isTrashPath(physicalPath: string): boolean {
  return physicalPath.toLowerCase().startsWith("_trash/")
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

function createTrashPath(physicalPath: string): string {
  const timestamp = new Date().toISOString()
  return `_trash/${timestamp}/${physicalPath}`
}

async function syncRagMutationFailOpen(args: {
  upsertJoinedPaths?: string[]
  deleteJoinedPaths?: string[]
}): Promise<void> {
  try {
    await vaultRagMutationSyncImpl({
      upsertJoinedPaths: args.upsertJoinedPaths,
      deleteJoinedPaths: args.deleteJoinedPaths,
    })
  } catch (error) {
    console.error("Vault RAG mutation sync failed (fail-open):", error)
  }

  try {
    await syncLocalPrivateRagMutation({
      upsertJoinedPaths: args.upsertJoinedPaths,
      deleteJoinedPaths: args.deleteJoinedPaths,
    })
  } catch (error) {
    console.error("Local private RAG mutation sync failed (fail-open):", error)
  }
}

function normalizeGhostLabel(target: string): string {
  const normalized = normalizeLinkTarget(target)
  if (!normalized) {
    return target.trim() || "Unresolved"
  }
  const segment = normalized.split("/").at(-1) || normalized
  return segment.replace(/\.md$/iu, "") || normalized
}

function clampGraphDepth(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 2
  }
  const rounded = Math.round(value as number)
  if (rounded < 1) return 1
  if (rounded > 4) return 4
  return rounded
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

function mapGraphNotes(catalog: NoteCatalog, vaultId: VaultId, includeTrash: boolean): GraphNoteRef[] {
  const notes: GraphNoteRef[] = []
  for (const [physicalVaultId, physicalPaths] of catalog.entriesByVault.entries()) {
    for (const physicalPath of physicalPaths) {
      if (!includeTrash && isTrashPath(physicalPath)) {
        continue
      }
      notes.push({
        physicalVaultId,
        physicalPath,
        scopedPath: toScopedPath(vaultId, physicalVaultId, physicalPath),
      })
    }
  }

  notes.sort((a, b) => a.scopedPath.localeCompare(b.scopedPath))
  return notes
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

export async function getVaultFile(
  vaultId: VaultId,
  notePathInput: string,
  options: { mode?: VaultFileReadMode } = {},
): Promise<VaultFileResponse> {
  const mode = options.mode || "preview"
  const requested = resolveRequestedNoteTarget(vaultId, notePathInput)
  const vaultRootPath = resolveVaultAbsolutePath(requested.physicalVaultId)
  if (!(await directoryExists(vaultRootPath))) {
    throw new VaultRequestError("Vault directory does not exist.", 404)
  }

  const maxBytes = mode === "full" ? EDIT_MAX_BYTES : PREVIEW_MAX_BYTES

  let fileData: ResolvedVaultContent
  try {
    fileData = await readVaultContent({
      physicalVaultId: requested.physicalVaultId,
      physicalPath: requested.physicalPath,
      maxBytes,
      allowPrivateMigration: true,
    })
  } catch (error) {
    if (error instanceof VaultRequestError) {
      throw error
    }
    throw new VaultRequestError("Vault note not found.", 404)
  }

  if (mode === "full" && fileData.truncated) {
    throw new VaultRequestError(`Vault note exceeds edit size limit (${EDIT_MAX_BYTES} bytes).`, 413)
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
    for (const sourcePhysicalPath of sourcePaths) {
      if (
        sourcePhysicalVaultId === requested.physicalVaultId
        && normalizeLookupKey(sourcePhysicalPath) === requestedLookupPath
      ) {
        continue
      }

      let sourceContent = ""
      try {
        const sourceFile = await readVaultContent({
          physicalVaultId: sourcePhysicalVaultId,
          physicalPath: sourcePhysicalPath,
          maxBytes: SEARCH_MAX_BYTES,
          allowPrivateMigration: false,
        })
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

export async function saveVaultFile(
  vaultId: VaultId,
  notePathInput: string,
  contentInput: string,
): Promise<VaultSaveResponse> {
  const requested = resolveRequestedNoteTarget(vaultId, notePathInput)
  const vaultRootPath = resolveVaultAbsolutePath(requested.physicalVaultId)

  let persistContent = contentInput
  let encrypted = false

  if (isPrivatePhysicalVault(requested.physicalVaultId)) {
    try {
      const envelope = await encryptPrivateVaultContent({
        relativePath: requested.physicalPath,
        plaintext: contentInput,
      })
      persistContent = serializePrivateVaultEncryptedEnvelope(envelope)
      encrypted = true
    } catch (error) {
      if (privateMemoryEncryptionRequired()) {
        throwPrivateEncryptionVaultError(error)
      }
    }
  }

  try {
    const saved = await writeMarkdownFile(vaultRootPath, requested.physicalPath, persistContent)
    const joinedPath = toJoinedVaultPath(requested.physicalVaultId, requested.physicalPath)
    await syncRagMutationFailOpen({
      upsertJoinedPaths: [joinedPath],
    })
    return {
      vaultId,
      path: requested.requestedPath,
      size: saved.size,
      mtime: saved.mtime.toISOString(),
      encrypted,
      originVaultId: requested.physicalVaultId,
    }
  } catch {
    throw new VaultRequestError("Unable to save vault note.", 500)
  }
}

export async function moveVaultFile(
  vaultId: VaultId,
  fromPathInput: string,
  toPathInput: string,
): Promise<VaultMoveResponse> {
  const fromTarget = resolveRequestedNoteTarget(vaultId, fromPathInput)
  const toTarget = resolveRequestedNoteTarget(vaultId, toPathInput)

  if (fromTarget.physicalVaultId !== toTarget.physicalVaultId) {
    throw new VaultRequestError("Cross-vault move is not allowed.", 400)
  }

  const physicalVaultId = fromTarget.physicalVaultId
  const vaultRootPath = resolveVaultAbsolutePath(physicalVaultId)
  if (!(await directoryExists(vaultRootPath))) {
    throw new VaultRequestError("Vault directory does not exist.", 404)
  }

  if (isPrivatePhysicalVault(physicalVaultId)) {
    const sourceExists = await readMarkdownFile(vaultRootPath, fromTarget.physicalPath).catch(() => null)
    if (!sourceExists) {
      throw new VaultRequestError("Vault note not found.", 404)
    }

    if (fromTarget.physicalPath === toTarget.physicalPath) {
      return {
        vaultId,
        fromPath: fromTarget.requestedPath,
        toPath: toTarget.requestedPath,
        size: sourceExists.size,
        mtime: sourceExists.mtime.toISOString(),
        encrypted: Boolean(parsePrivateVaultEncryptedEnvelope(sourceExists.content)),
        originVaultId: physicalVaultId,
      }
    }

    const targetExists = await readMarkdownFile(vaultRootPath, toTarget.physicalPath)
      .then(() => true)
      .catch(() => false)
    if (targetExists) {
      throw new VaultRequestError("Target note already exists.", 409)
    }

    let plaintext = ""
    try {
      plaintext = await readPrivateVaultPlaintext(vaultRootPath, fromTarget.physicalPath)
    } catch (error) {
      if (error instanceof VaultRequestError) {
        throw error
      }
      throw new VaultRequestError("Vault note not found.", 404)
    }

    let persistContent = plaintext
    let encrypted = false

    try {
      const envelope = await encryptPrivateVaultContent({
        relativePath: toTarget.physicalPath,
        plaintext,
      })
      persistContent = serializePrivateVaultEncryptedEnvelope(envelope)
      encrypted = true
    } catch (error) {
      if (privateMemoryEncryptionRequired()) {
        throwPrivateEncryptionVaultError(error)
      }
    }

    try {
      const saved = await writeMarkdownFile(vaultRootPath, toTarget.physicalPath, persistContent)
      await deleteMarkdownFile(vaultRootPath, fromTarget.physicalPath)
      await syncRagMutationFailOpen({
        upsertJoinedPaths: [toJoinedVaultPath(physicalVaultId, toTarget.physicalPath)],
        deleteJoinedPaths: [toJoinedVaultPath(physicalVaultId, fromTarget.physicalPath)],
      })
      return {
        vaultId,
        fromPath: fromTarget.requestedPath,
        toPath: toTarget.requestedPath,
        size: saved.size,
        mtime: saved.mtime.toISOString(),
        encrypted,
        originVaultId: physicalVaultId,
      }
    } catch (error) {
      if ((error as Error)?.message.includes("already exists")) {
        throw new VaultRequestError("Target note already exists.", 409)
      }
      throw new VaultRequestError("Unable to move vault note.", 500)
    }
  }

  try {
    const saved = await moveMarkdownFile(vaultRootPath, fromTarget.physicalPath, toTarget.physicalPath)
    await syncRagMutationFailOpen({
      upsertJoinedPaths: [toJoinedVaultPath(physicalVaultId, toTarget.physicalPath)],
      deleteJoinedPaths: [toJoinedVaultPath(physicalVaultId, fromTarget.physicalPath)],
    })
    return {
      vaultId,
      fromPath: fromTarget.requestedPath,
      toPath: toTarget.requestedPath,
      size: saved.size,
      mtime: saved.mtime.toISOString(),
      encrypted: false,
      originVaultId: physicalVaultId,
    }
  } catch (error) {
    const message = (error as Error).message || ""
    if (message.includes("already exists")) {
      throw new VaultRequestError("Target note already exists.", 409)
    }
    if (message.includes("does not exist") || message.includes("ENOENT")) {
      throw new VaultRequestError("Vault note not found.", 404)
    }
    throw new VaultRequestError("Unable to move vault note.", 500)
  }
}

export async function deleteVaultFile(
  vaultId: VaultId,
  notePathInput: string,
  mode: VaultDeleteMode = "soft",
): Promise<VaultDeleteResponse> {
  const requested = resolveRequestedNoteTarget(vaultId, notePathInput)
  const vaultRootPath = resolveVaultAbsolutePath(requested.physicalVaultId)

  if (!(await directoryExists(vaultRootPath))) {
    throw new VaultRequestError("Vault directory does not exist.", 404)
  }

  if (mode === "soft") {
    const trashPhysicalPath = createTrashPath(requested.physicalPath)
    const trashScopedPath = toScopedPath(vaultId, requested.physicalVaultId, trashPhysicalPath)
    await moveVaultFile(vaultId, requested.requestedPath, trashScopedPath)

    return {
      vaultId,
      path: requested.requestedPath,
      mode,
      deletedPath: trashScopedPath,
      originVaultId: requested.physicalVaultId,
    }
  }

  try {
    await deleteMarkdownFile(vaultRootPath, requested.physicalPath)
    await syncRagMutationFailOpen({
      deleteJoinedPaths: [toJoinedVaultPath(requested.physicalVaultId, requested.physicalPath)],
    })
    return {
      vaultId,
      path: requested.requestedPath,
      mode,
      deletedPath: null,
      originVaultId: requested.physicalVaultId,
    }
  } catch {
    throw new VaultRequestError("Vault note not found.", 404)
  }
}

async function searchVaultNotesLexical(vaultId: VaultId, queryInput: string): Promise<VaultSearchResponse> {
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
    for (const physicalPath of paths) {
      let content = ""
      try {
        const fileData = await readVaultContent({
          physicalVaultId,
          physicalPath,
          maxBytes: SEARCH_MAX_BYTES,
          allowPrivateMigration: false,
        })
        content = fileData.content
      } catch {
        continue
      }

      const title = basename(physicalPath, ".md")
      const searchablePath = physicalPath.toLowerCase()
      const searchableTitle = title.toLowerCase()
      const searchableContent = content.toLowerCase()

      if (
        !searchablePath.includes(lowerQuery)
        && !searchableTitle.includes(lowerQuery)
        && !searchableContent.includes(lowerQuery)
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

export async function searchVaultNotes(
  vaultId: VaultId,
  queryInput: string,
  options: {
    mode?: VaultRagQueryMode
    k?: number
  } = {},
): Promise<VaultSearchResponse> {
  const mode = options.mode || "hybrid"
  const k = options.k

  if (!queryInput.trim()) {
    const lexicalEmpty = await searchVaultNotesLexical(vaultId, queryInput)
    return {
      ...lexicalEmpty,
      mode,
      fallbackUsed: mode !== "lexical",
    }
  }

  try {
    const rag = await searchVaultRagNotes({
      query: queryInput,
      vaultId,
      mode,
      k,
    })

    if (rag.results.length > 0) {
      return {
        vaultId,
        exists: true,
        mode: rag.mode,
        fallbackUsed: rag.fallbackUsed,
        results: rag.results.map((result) => ({
          vaultId: result.vaultId,
          path: result.path,
          title: result.title,
          excerpt: result.excerpt,
          originVaultId: result.originVaultId,
          score: result.score,
          scopeType: result.scopeType,
          shipDeploymentId: result.shipDeploymentId,
          citations: result.citations,
        })),
      }
    }
  } catch (error) {
    console.error("Vault hybrid search failed, falling back to lexical scan:", error)
  }

  const lexical = await searchVaultNotesLexical(vaultId, queryInput)
  return {
    ...lexical,
    mode: "lexical",
    fallbackUsed: true,
    results: lexical.results.slice(0, Math.max(1, Math.min(100, k || 100))),
  }
}

export async function getVaultGraph(
  vaultId: VaultId,
  options: {
    focusPath?: string | null
    depth?: number
    includeUnresolved?: boolean
    includeTrash?: boolean
    query?: string
  } = {},
): Promise<VaultGraphResponse> {
  const includeUnresolved = options.includeUnresolved ?? true
  const includeTrash = options.includeTrash ?? false
  const query = (options.query || "").trim()
  const depth = clampGraphDepth(options.depth)

  const catalog = await buildCatalogForScope(vaultId)
  const allNotes = mapGraphNotes(catalog, vaultId, includeTrash)

  if (allNotes.length === 0) {
    return {
      vaultId,
      focusPath: null,
      filters: {
        depth,
        includeUnresolved,
        includeTrash,
        query,
      },
      nodes: [],
      edges: [],
      stats: {
        noteCount: 0,
        ghostCount: 0,
        edgeCount: 0,
        unresolvedEdgeCount: 0,
        truncated: false,
      },
    }
  }

  const focusTarget = options.focusPath ? resolveRequestedNoteTarget(vaultId, options.focusPath) : null
  const focusScopedPath = focusTarget
    ? toScopedPath(vaultId, focusTarget.physicalVaultId, focusTarget.physicalPath)
    : null

  let candidateNotes = allNotes
  if (!focusTarget && query) {
    const lowerQuery = query.toLowerCase()
    candidateNotes = candidateNotes.filter((note) => {
      const title = basename(note.scopedPath, ".md").toLowerCase()
      return note.scopedPath.toLowerCase().includes(lowerQuery) || title.includes(lowerQuery)
    })
  }

  const noteByScopedPath = new Map(candidateNotes.map((note) => [note.scopedPath, note]))

  if (focusScopedPath && !noteByScopedPath.has(focusScopedPath)) {
    const focusedFromAll = allNotes.find((note) => note.scopedPath === focusScopedPath)
    if (!focusedFromAll) {
      throw new VaultRequestError("Focus note not found.", 404)
    }
    noteByScopedPath.set(focusScopedPath, focusedFromAll)
  }

  if (noteByScopedPath.size === 0) {
    return {
      vaultId,
      focusPath: focusScopedPath,
      filters: {
        depth,
        includeUnresolved,
        includeTrash,
        query,
      },
      nodes: [],
      edges: [],
      stats: {
        noteCount: 0,
        ghostCount: 0,
        edgeCount: 0,
        unresolvedEdgeCount: 0,
        truncated: false,
      },
    }
  }

  const resolvedEdgeDrafts: GraphEdgeDraft[] = []
  const unresolvedEdgeDrafts: Array<GraphEdgeDraft & { unresolvedTarget: string }> = []

  const contentEntries = Array.from(noteByScopedPath.values())
  for (const entry of contentEntries) {
    let content = ""
    try {
      const fileData = await readVaultContent({
        physicalVaultId: entry.physicalVaultId,
        physicalPath: entry.physicalPath,
        maxBytes: SEARCH_MAX_BYTES,
        allowPrivateMigration: false,
      })
      content = fileData.content
    } catch {
      continue
    }

    const sourceNodeId = `note:${entry.scopedPath}`
    const links = extractVaultLinks(content)
    for (const link of links) {
      const resolved = resolveVaultLinkTargetWithCatalog({
        scopeVaultId: vaultId,
        sourcePhysicalVaultId: entry.physicalVaultId,
        sourcePhysicalPath: entry.physicalPath,
        target: link.target,
        catalog,
      })

      if (resolved) {
        const targetPath = toScopedPath(vaultId, resolved.physicalVaultId, resolved.physicalPath)
        if (!noteByScopedPath.has(targetPath)) {
          continue
        }
        resolvedEdgeDrafts.push({
          kind: link.kind,
          sourcePath: entry.scopedPath,
          sourceNodeId,
          targetPath,
          targetNodeId: `note:${targetPath}`,
          edgeType: "resolved",
        })
      } else {
        const normalizedTarget = normalizeLinkTarget(link.target)
        if (!normalizedTarget || isExternalTarget(normalizedTarget)) {
          continue
        }

        const ghostId = `ghost:${Buffer.from(normalizedTarget.toLowerCase()).toString("base64url")}`
        unresolvedEdgeDrafts.push({
          kind: link.kind,
          sourcePath: entry.scopedPath,
          sourceNodeId,
          targetPath: normalizedTarget,
          targetNodeId: ghostId,
          edgeType: "unresolved",
          unresolvedTarget: link.target,
        })
      }
    }
  }

  const includedNotePaths = new Set<string>()
  if (focusScopedPath) {
    if (!noteByScopedPath.has(focusScopedPath)) {
      throw new VaultRequestError("Focus note not found.", 404)
    }

    const adjacency = new Map<string, Set<string>>()
    for (const edge of resolvedEdgeDrafts) {
      const source = edge.sourcePath
      const target = edge.targetPath
      const sourceSet = adjacency.get(source) || new Set<string>()
      sourceSet.add(target)
      adjacency.set(source, sourceSet)

      const targetSet = adjacency.get(target) || new Set<string>()
      targetSet.add(source)
      adjacency.set(target, targetSet)
    }

    const queue: Array<{ path: string; distance: number }> = [{ path: focusScopedPath, distance: 0 }]
    const visited = new Set<string>([focusScopedPath])

    while (queue.length > 0) {
      const current = queue.shift() as { path: string; distance: number }
      includedNotePaths.add(current.path)
      if (current.distance >= depth) {
        continue
      }

      const neighbors = adjacency.get(current.path)
      if (!neighbors) {
        continue
      }

      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) {
          continue
        }
        visited.add(neighbor)
        queue.push({ path: neighbor, distance: current.distance + 1 })
      }
    }
  } else {
    for (const path of noteByScopedPath.keys()) {
      includedNotePaths.add(path)
    }
  }

  const nodes: VaultGraphNode[] = Array.from(includedNotePaths)
    .sort((a, b) => a.localeCompare(b))
    .map((path) => {
      const entry = noteByScopedPath.get(path) as GraphNoteRef
      return {
        id: `note:${path}`,
        nodeType: "note",
        vaultId,
        path,
        label: basename(path, ".md"),
        originVaultId: entry.physicalVaultId,
      }
    })

  const edges: VaultGraphEdge[] = []
  const edgeDedup = new Set<string>()

  for (const edge of resolvedEdgeDrafts) {
    if (!includedNotePaths.has(edge.sourcePath) || !includedNotePaths.has(edge.targetPath)) {
      continue
    }

    const dedupeKey = `${edge.edgeType}:${edge.kind}:${edge.sourcePath}->${edge.targetPath}`
    if (edgeDedup.has(dedupeKey)) {
      continue
    }
    edgeDedup.add(dedupeKey)

    edges.push({
      id: `resolved:${Buffer.from(dedupeKey).toString("base64url")}`,
      edgeType: "resolved",
      kind: edge.kind,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      sourcePath: edge.sourcePath,
      targetPath: edge.targetPath,
    })
  }

  if (includeUnresolved) {
    const ghostNodeById = new Map<string, VaultGraphNode>()

    for (const edge of unresolvedEdgeDrafts) {
      if (!includedNotePaths.has(edge.sourcePath)) {
        continue
      }

      if (!ghostNodeById.has(edge.targetNodeId)) {
        ghostNodeById.set(edge.targetNodeId, {
          id: edge.targetNodeId,
          nodeType: "ghost",
          vaultId,
          path: edge.targetPath,
          label: normalizeGhostLabel(edge.targetPath),
          unresolvedTarget: edge.unresolvedTarget,
        })
      }

      const dedupeKey = `${edge.edgeType}:${edge.kind}:${edge.sourcePath}->${edge.targetPath}`
      if (edgeDedup.has(dedupeKey)) {
        continue
      }
      edgeDedup.add(dedupeKey)

      edges.push({
        id: `unresolved:${Buffer.from(dedupeKey).toString("base64url")}`,
        edgeType: "unresolved",
        kind: edge.kind,
        source: edge.sourceNodeId,
        target: edge.targetNodeId,
        sourcePath: edge.sourcePath,
        targetPath: edge.targetPath,
      })
    }

    nodes.push(...Array.from(ghostNodeById.values()).sort((a, b) => a.path.localeCompare(b.path)))
  }

  nodes.sort((a, b) => a.path.localeCompare(b.path))
  edges.sort((a, b) => `${a.sourcePath}:${a.targetPath}`.localeCompare(`${b.sourcePath}:${b.targetPath}`))

  let truncated = false
  let finalNodes = nodes
  let finalEdges = edges

  if (finalNodes.length > GRAPH_MAX_NOTES) {
    finalNodes = finalNodes.slice(0, GRAPH_MAX_NOTES)
    const allowedIds = new Set(finalNodes.map((node) => node.id))
    finalEdges = finalEdges.filter((edge) => allowedIds.has(edge.source) && allowedIds.has(edge.target))
    truncated = true
  }

  if (finalEdges.length > GRAPH_MAX_EDGES) {
    finalEdges = finalEdges.slice(0, GRAPH_MAX_EDGES)
    truncated = true
  }

  return {
    vaultId,
    focusPath: focusScopedPath,
    filters: {
      depth,
      includeUnresolved,
      includeTrash,
      query,
    },
    nodes: finalNodes,
    edges: finalEdges,
    stats: {
      noteCount: finalNodes.filter((node) => node.nodeType === "note").length,
      ghostCount: finalNodes.filter((node) => node.nodeType === "ghost").length,
      edgeCount: finalEdges.length,
      unresolvedEdgeCount: finalEdges.filter((edge) => edge.edgeType === "unresolved").length,
      truncated,
    },
  }
}
