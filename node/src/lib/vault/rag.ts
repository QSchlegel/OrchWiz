import { createHash } from "node:crypto"
import { basename } from "node:path"
import type {
  Prisma,
  VaultRagScopeType,
  VaultRagSyncScope,
  VaultRagSyncStatus,
  VaultRagSyncTrigger,
} from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { PhysicalVaultId, VaultSearchResponse } from "@/lib/vault/types"
import { listPhysicalVaultDefinitions, parseJoinedVaultPath, resolveVaultAbsolutePath, toJoinedVaultPath } from "./config"
import { collectMarkdownFilePaths, directoryExists, readMarkdownFile } from "./fs"

export type VaultRagQueryMode = "hybrid" | "lexical"
export type VaultKnowledgeScope = "ship" | "fleet" | "all"

export interface VaultRagScopeMeta {
  scopeType: VaultRagScopeType
  shipDeploymentId: string | null
}

export interface VaultRagChunkDraft {
  chunkIndex: number
  heading: string | null
  content: string
  normalizedContent: string
  tokenCount: number
}

export interface VaultRagCitation {
  id: string
  path: string
  title: string
  excerpt: string
  scopeType: VaultRagScopeType
  shipDeploymentId: string | null
  score: number
  lexicalScore: number
  semanticScore: number
}

export interface VaultRagQueryResult {
  mode: VaultRagQueryMode
  fallbackUsed: boolean
  results: VaultRagCitation[]
}

export type VaultRagSearchResult = VaultSearchResponse["results"][number] & {
  score: number
  scopeType: VaultRagScopeType
  shipDeploymentId: string | null
  citations: VaultRagCitation[]
}

export interface VaultRagSearchResponse {
  mode: VaultRagQueryMode
  fallbackUsed: boolean
  results: VaultRagSearchResult[]
}

export interface VaultRagSyncSummary {
  runId: string
  status: VaultRagSyncStatus
  trigger: VaultRagSyncTrigger
  scope: VaultRagSyncScope
  shipDeploymentId: string | null
  documentsScanned: number
  documentsUpserted: number
  documentsRemoved: number
  chunksUpserted: number
  error: string | null
}

interface SyncStats {
  documentsScanned: number
  documentsUpserted: number
  documentsRemoved: number
  chunksUpserted: number
}

interface ScannedDocument {
  joinedPath: string
  physicalVaultId: string
  physicalPath: string
  title: string
  scopeType: VaultRagScopeType
  shipDeploymentId: string | null
  content: string
  contentHash: string
  byteSize: number
  mtime: Date
  chunks: VaultRagChunkDraft[]
}

interface RankedChunk {
  chunkId: string
  path: string
  title: string
  scopeType: VaultRagScopeType
  shipDeploymentId: string | null
  content: string
  score: number
  lexicalScore: number
  semanticScore: number
}

const SHIP_SCOPE_PREFIX = "ship/kb/ships/"
const FLEET_SCOPE_PREFIX = "ship/kb/fleet/"

function asBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  const normalized = value.trim().toLowerCase()
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false
  }
  return fallback
}

function asPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }
  return parsed
}

function vaultRagEnabled(): boolean {
  return asBoolean(process.env.VAULT_RAG_ENABLED, true)
}

function vaultRagSyncOnWrite(): boolean {
  return asBoolean(process.env.VAULT_RAG_SYNC_ON_WRITE, true)
}

function embeddingModel(): string {
  const raw = process.env.VAULT_RAG_EMBEDDING_MODEL?.trim()
  if (raw) return raw
  return "text-embedding-3-small"
}

function ragTopKDefault(): number {
  return asPositiveInt(process.env.VAULT_RAG_TOP_K, 12)
}

function ragChunkCharLimit(): number {
  return asPositiveInt(process.env.VAULT_RAG_CHUNK_CHARS, 900)
}

function ragMaxChunksPerDoc(): number {
  return asPositiveInt(process.env.VAULT_RAG_MAX_CHUNKS_PER_DOC, 120)
}

function ragEmbeddingBatchSize(): number {
  return asPositiveInt(process.env.VAULT_RAG_EMBED_BATCH_SIZE, 24)
}

function ragCandidateLimit(): number {
  return asPositiveInt(process.env.VAULT_RAG_QUERY_CANDIDATE_LIMIT, 1800)
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

export function normalizeRagText(value: string): string {
  return normalizeWhitespace(value).toLowerCase()
}

export function tokenizeRagText(value: string): string[] {
  return normalizeRagText(value)
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length >= 2)
}

function contentHashFor(text: string): string {
  return createHash("sha256").update(text).digest("hex")
}

function isPrivateVaultId(vaultId: string): boolean {
  return vaultId === "agent-private"
}

function isPhysicalVaultId(vaultId: string): vaultId is PhysicalVaultId {
  return vaultId === "orchwiz" || vaultId === "ship" || vaultId === "agent-public" || vaultId === "agent-private"
}

export function resolveVaultRagMode(raw: string | null | undefined): VaultRagQueryMode {
  return raw === "lexical" ? "lexical" : "hybrid"
}

export function resolveVaultKnowledgeScope(raw: string | null | undefined): VaultKnowledgeScope {
  if (raw === "ship" || raw === "fleet") {
    return raw
  }
  return "all"
}

export function classifyVaultRagScope(joinedPath: string): VaultRagScopeMeta {
  const normalized = joinedPath.replaceAll("\\", "/")
  const lower = normalized.toLowerCase()

  if (lower.startsWith(SHIP_SCOPE_PREFIX)) {
    const match = normalized.match(/^ship\/kb\/ships\/([^/]+)\//u)
    if (match?.[1]) {
      return {
        scopeType: "ship",
        shipDeploymentId: match[1],
      }
    }
  }

  if (lower.startsWith(FLEET_SCOPE_PREFIX)) {
    return {
      scopeType: "fleet",
      shipDeploymentId: null,
    }
  }

  return {
    scopeType: "global",
    shipDeploymentId: null,
  }
}

function splitLongBlock(block: string, maxChars: number): string[] {
  if (block.length <= maxChars) {
    return [block]
  }

  const parts: string[] = []
  let remaining = block

  while (remaining.length > maxChars) {
    const softFloor = Math.floor(maxChars * 0.6)
    let splitIndex = Math.max(
      remaining.lastIndexOf("\n", maxChars),
      remaining.lastIndexOf(". ", maxChars),
      remaining.lastIndexOf("; ", maxChars),
      remaining.lastIndexOf(", ", maxChars),
    )

    if (splitIndex < softFloor) {
      splitIndex = maxChars
    }

    const head = normalizeWhitespace(remaining.slice(0, splitIndex))
    if (head) {
      parts.push(head)
    }

    remaining = remaining.slice(splitIndex).trim()
  }

  const tail = normalizeWhitespace(remaining)
  if (tail) {
    parts.push(tail)
  }

  return parts
}

export function chunkMarkdownForRag(markdown: string): VaultRagChunkDraft[] {
  const maxChars = ragChunkCharLimit()
  const maxChunks = ragMaxChunksPerDoc()
  const lines = markdown.replace(/\r\n/g, "\n").split("\n")

  const chunks: VaultRagChunkDraft[] = []
  let currentHeading: string | null = null
  let paragraphLines: string[] = []

  const flushParagraph = () => {
    const paragraph = normalizeWhitespace(paragraphLines.join(" "))
    paragraphLines = []

    if (!paragraph) {
      return
    }

    const blockPrefix = currentHeading ? `${currentHeading}\n` : ""
    const block = `${blockPrefix}${paragraph}`.trim()
    const splitBlocks = splitLongBlock(block, maxChars)

    for (const splitBlock of splitBlocks) {
      if (chunks.length >= maxChunks) {
        break
      }

      const normalizedContent = normalizeRagText(splitBlock)
      chunks.push({
        chunkIndex: chunks.length,
        heading: currentHeading,
        content: splitBlock,
        normalizedContent,
        tokenCount: tokenizeRagText(splitBlock).length,
      })
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()

    const headingMatch = line.match(/^#{1,6}\s+(.+)$/u)
    if (headingMatch) {
      flushParagraph()
      currentHeading = normalizeWhitespace(headingMatch[1]) || null
      continue
    }

    if (!line) {
      flushParagraph()
      continue
    }

    paragraphLines.push(line)
  }

  flushParagraph()

  if (chunks.length === 0) {
    const compact = normalizeWhitespace(markdown)
    if (!compact) {
      return []
    }

    const splitBlocks = splitLongBlock(compact, maxChars)
    return splitBlocks.slice(0, maxChunks).map((block, idx) => ({
      chunkIndex: idx,
      heading: null,
      content: block,
      normalizedContent: normalizeRagText(block),
      tokenCount: tokenizeRagText(block).length,
    }))
  }

  return chunks
}

function parseEmbedding(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  const parsed: number[] = []
  for (const entry of value) {
    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      return null
    }
    parsed.push(entry)
  }

  return parsed.length > 0 ? parsed : null
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return 0
  }

  let dot = 0
  let leftNorm = 0
  let rightNorm = 0

  for (let i = 0; i < left.length; i += 1) {
    dot += left[i] * right[i]
    leftNorm += left[i] * left[i]
    rightNorm += right[i] * right[i]
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))
}

function scopeMatchesSelection(args: {
  scopeType: VaultRagScopeType
  shipDeploymentId: string | null
  scope: VaultKnowledgeScope
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

function scopeBoost(args: {
  scopeType: VaultRagScopeType
  shipDeploymentId: string | null
  requestedShipDeploymentId?: string
}): number {
  if (!args.requestedShipDeploymentId) {
    return 0
  }

  if (args.scopeType === "ship" && args.shipDeploymentId === args.requestedShipDeploymentId) {
    return 0.2
  }

  if (args.scopeType === "fleet") {
    return 0.08
  }

  return 0
}

function lexicalScore(queryTokens: string[], haystackNormalized: string): number {
  if (queryTokens.length === 0 || !haystackNormalized) {
    return 0
  }

  let matches = 0
  for (const token of queryTokens) {
    if (haystackNormalized.includes(token)) {
      matches += 1
    }
  }

  return matches / queryTokens.length
}

function pathTitleBonus(queryLower: string, path: string, title: string): number {
  if (!queryLower) return 0
  const pathLower = path.toLowerCase()
  const titleLower = title.toLowerCase()

  if (pathLower.includes(queryLower)) {
    return 0.12
  }

  if (titleLower.includes(queryLower)) {
    return 0.1
  }

  return 0
}

export function rankVaultRagCandidate(args: {
  queryTokens: string[]
  queryLower: string
  queryEmbedding: number[] | null
  mode: VaultRagQueryMode
  chunkPath: string
  chunkTitle: string
  chunkNormalizedContent: string
  chunkEmbedding: number[] | null
  chunkScopeType: VaultRagScopeType
  chunkShipDeploymentId: string | null
  requestedShipDeploymentId?: string
}): {
  score: number
  lexical: number
  semantic: number
} {
  const lexical = lexicalScore(args.queryTokens, args.chunkNormalizedContent)
  const semantic =
    args.mode === "hybrid" && args.queryEmbedding && args.chunkEmbedding
      ? Math.max(0, cosineSimilarity(args.queryEmbedding, args.chunkEmbedding))
      : 0

  const boost = scopeBoost({
    scopeType: args.chunkScopeType,
    shipDeploymentId: args.chunkShipDeploymentId,
    requestedShipDeploymentId: args.requestedShipDeploymentId,
  })
  const titlePath = pathTitleBonus(args.queryLower, args.chunkPath, args.chunkTitle)

  if (args.mode === "lexical" || !args.queryEmbedding) {
    return {
      score: lexical * 0.92 + titlePath + boost,
      lexical,
      semantic,
    }
  }

  return {
    score: lexical * 0.44 + semantic * 0.44 + titlePath + boost,
    lexical,
    semantic,
  }
}

function excerptAround(content: string, query: string): string {
  const compact = normalizeWhitespace(content)
  if (!compact) return ""

  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) {
    return compact.slice(0, 220)
  }

  const index = compact.toLowerCase().indexOf(normalizedQuery)
  if (index === -1) {
    return compact.slice(0, 220)
  }

  const start = Math.max(0, index - 90)
  const end = Math.min(compact.length, index + normalizedQuery.length + 120)
  return compact.slice(start, end)
}

async function embedTextsWithOpenAi(texts: string[]): Promise<number[][] | null> {
  if (texts.length === 0) {
    return []
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    return null
  }

  const model = embeddingModel()
  const batchSize = ragEmbeddingBatchSize()
  const vectors: number[][] = []

  for (let start = 0; start < texts.length; start += batchSize) {
    const batch = texts.slice(start, start + batchSize)

    let response: Response
    try {
      response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          input: batch,
        }),
      })
    } catch (error) {
      console.error("Vault RAG embedding request failed:", error)
      return null
    }

    if (!response.ok) {
      console.error("Vault RAG embedding request returned non-2xx:", response.status)
      return null
    }

    const payload = (await response.json().catch(() => null)) as
      | { data?: Array<{ embedding?: unknown; index?: number }> }
      | null
    if (!payload?.data || !Array.isArray(payload.data)) {
      return null
    }

    const ordered = [...payload.data].sort((a, b) => (a.index || 0) - (b.index || 0))
    for (const entry of ordered) {
      const embedding = parseEmbedding(entry.embedding)
      if (!embedding) {
        return null
      }
      vectors.push(embedding)
    }
  }

  return vectors
}

function buildDocumentScopeWhere(scope: VaultRagSyncScope, shipDeploymentId?: string): Prisma.VaultRagDocumentWhereInput {
  if (scope === "fleet") {
    return {
      scopeType: "fleet",
    }
  }

  if (scope === "ship") {
    return {
      scopeType: "ship",
      shipDeploymentId: shipDeploymentId || "__missing_ship_scope__",
    }
  }

  return {}
}

function shouldIncludeDocumentInSync(args: {
  scopeType: VaultRagScopeType
  shipDeploymentId: string | null
  scope: VaultRagSyncScope
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

async function scanVaultCorpus(args: {
  scope: VaultRagSyncScope
  shipDeploymentId?: string
}): Promise<ScannedDocument[]> {
  const scanned: ScannedDocument[] = []

  for (const definition of listPhysicalVaultDefinitions()) {
    if (definition.isPrivate) {
      continue
    }

    const rootPath = resolveVaultAbsolutePath(definition.id)
    if (!(await directoryExists(rootPath))) {
      continue
    }

    const paths = await collectMarkdownFilePaths(rootPath)
    for (const physicalPath of paths) {
      const file = await readMarkdownFile(rootPath, physicalPath).catch(() => null)
      if (!file) {
        continue
      }

      const joinedPath = toJoinedVaultPath(definition.id, physicalPath)
      const scopeMeta = classifyVaultRagScope(joinedPath)
      if (
        !shouldIncludeDocumentInSync({
          scopeType: scopeMeta.scopeType,
          shipDeploymentId: scopeMeta.shipDeploymentId,
          scope: args.scope,
          requestedShipDeploymentId: args.shipDeploymentId,
        })
      ) {
        continue
      }

      const chunks = chunkMarkdownForRag(file.content)
      scanned.push({
        joinedPath,
        physicalVaultId: definition.id,
        physicalPath,
        title: basename(physicalPath, ".md"),
        scopeType: scopeMeta.scopeType,
        shipDeploymentId: scopeMeta.shipDeploymentId,
        content: file.content,
        contentHash: contentHashFor(file.content),
        byteSize: Buffer.byteLength(file.content, "utf8"),
        mtime: file.mtime,
        chunks,
      })
    }
  }

  scanned.sort((left, right) => left.joinedPath.localeCompare(right.joinedPath))
  return scanned
}

async function upsertScannedDocument(doc: ScannedDocument): Promise<{ upserted: boolean; chunkCount: number }> {
  const existing = await prisma.vaultRagDocument.findUnique({
    where: {
      joinedPath: doc.joinedPath,
    },
    select: {
      id: true,
      contentHash: true,
      chunkCount: true,
    },
  })

  if (existing && existing.contentHash === doc.contentHash && existing.chunkCount === doc.chunks.length) {
    await prisma.vaultRagDocument.update({
      where: { id: existing.id },
      data: {
        physicalVaultId: doc.physicalVaultId,
        physicalPath: doc.physicalPath,
        title: doc.title,
        scopeType: doc.scopeType,
        shipDeploymentId: doc.shipDeploymentId,
        byteSize: doc.byteSize,
        mtime: doc.mtime,
        lastIndexedAt: new Date(),
      },
    })

    return {
      upserted: false,
      chunkCount: 0,
    }
  }

  const embeddings = await embedTextsWithOpenAi(doc.chunks.map((chunk) => chunk.content))
  const chunksData = doc.chunks.map((chunk, index) => ({
    joinedPath: doc.joinedPath,
    scopeType: doc.scopeType,
    shipDeploymentId: doc.shipDeploymentId,
    chunkIndex: chunk.chunkIndex,
    heading: chunk.heading,
    content: chunk.content,
    normalizedContent: chunk.normalizedContent,
    embedding: embeddings?.[index] ? (embeddings[index] as Prisma.InputJsonValue) : undefined,
    tokenCount: chunk.tokenCount,
  }))

  await prisma.vaultRagDocument.upsert({
    where: {
      joinedPath: doc.joinedPath,
    },
    create: {
      joinedPath: doc.joinedPath,
      physicalVaultId: doc.physicalVaultId,
      physicalPath: doc.physicalPath,
      title: doc.title,
      scopeType: doc.scopeType,
      shipDeploymentId: doc.shipDeploymentId,
      contentHash: doc.contentHash,
      byteSize: doc.byteSize,
      mtime: doc.mtime,
      chunkCount: chunksData.length,
      lastIndexedAt: new Date(),
      chunks: {
        create: chunksData,
      },
    },
    update: {
      physicalVaultId: doc.physicalVaultId,
      physicalPath: doc.physicalPath,
      title: doc.title,
      scopeType: doc.scopeType,
      shipDeploymentId: doc.shipDeploymentId,
      contentHash: doc.contentHash,
      byteSize: doc.byteSize,
      mtime: doc.mtime,
      chunkCount: chunksData.length,
      lastIndexedAt: new Date(),
      chunks: {
        deleteMany: {},
        create: chunksData,
      },
    },
  })

  return {
    upserted: true,
    chunkCount: chunksData.length,
  }
}

function toSyncSummary(args: {
  runId: string
  status: VaultRagSyncStatus
  trigger: VaultRagSyncTrigger
  scope: VaultRagSyncScope
  shipDeploymentId: string | null
  stats: SyncStats
  error: string | null
}): VaultRagSyncSummary {
  return {
    runId: args.runId,
    status: args.status,
    trigger: args.trigger,
    scope: args.scope,
    shipDeploymentId: args.shipDeploymentId,
    documentsScanned: args.stats.documentsScanned,
    documentsUpserted: args.stats.documentsUpserted,
    documentsRemoved: args.stats.documentsRemoved,
    chunksUpserted: args.stats.chunksUpserted,
    error: args.error,
  }
}

async function updateSyncRun(args: {
  runId: string
  status: VaultRagSyncStatus
  stats: SyncStats
  error?: string
}): Promise<void> {
  await prisma.vaultRagSyncRun.update({
    where: {
      id: args.runId,
    },
    data: {
      status: args.status,
      documentsScanned: args.stats.documentsScanned,
      documentsUpserted: args.stats.documentsUpserted,
      documentsRemoved: args.stats.documentsRemoved,
      chunksUpserted: args.stats.chunksUpserted,
      error: args.error || null,
      completedAt: new Date(),
    },
  })
}

export async function runVaultRagResync(args: {
  scope: VaultRagSyncScope
  shipDeploymentId?: string
  trigger?: VaultRagSyncTrigger
  initiatedByUserId?: string
  mode?: VaultRagQueryMode
}): Promise<VaultRagSyncSummary> {
  if (!vaultRagEnabled()) {
    return {
      runId: "disabled",
      status: "completed",
      trigger: args.trigger || "manual",
      scope: args.scope,
      shipDeploymentId: args.shipDeploymentId || null,
      documentsScanned: 0,
      documentsUpserted: 0,
      documentsRemoved: 0,
      chunksUpserted: 0,
      error: null,
    }
  }

  const trigger = args.trigger || "manual"
  const run = await prisma.vaultRagSyncRun.create({
    data: {
      trigger,
      scope: args.scope,
      status: "running",
      shipDeploymentId: args.shipDeploymentId || null,
      initiatedByUserId: args.initiatedByUserId || null,
      mode: args.mode || "hybrid",
    },
    select: {
      id: true,
    },
  })

  const stats: SyncStats = {
    documentsScanned: 0,
    documentsUpserted: 0,
    documentsRemoved: 0,
    chunksUpserted: 0,
  }

  try {
    const scannedDocs = await scanVaultCorpus({
      scope: args.scope,
      shipDeploymentId: args.shipDeploymentId,
    })

    stats.documentsScanned = scannedDocs.length

    for (const scanned of scannedDocs) {
      const result = await upsertScannedDocument(scanned)
      if (result.upserted) {
        stats.documentsUpserted += 1
        stats.chunksUpserted += result.chunkCount
      }
    }

    const whereScope = buildDocumentScopeWhere(args.scope, args.shipDeploymentId)
    const joinedPaths = scannedDocs.map((doc) => doc.joinedPath)

    const staleDeleteResult = await prisma.vaultRagDocument.deleteMany({
      where: {
        ...whereScope,
        ...(joinedPaths.length > 0
          ? {
              joinedPath: {
                notIn: joinedPaths,
              },
            }
          : {}),
      },
    })

    stats.documentsRemoved = staleDeleteResult.count

    await updateSyncRun({
      runId: run.id,
      status: "completed",
      stats,
    })

    return toSyncSummary({
      runId: run.id,
      status: "completed",
      trigger,
      scope: args.scope,
      shipDeploymentId: args.shipDeploymentId || null,
      stats,
      error: null,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Vault RAG sync failed"
    await updateSyncRun({
      runId: run.id,
      status: "failed",
      stats,
      error: errorMessage,
    }).catch(() => {})

    return toSyncSummary({
      runId: run.id,
      status: "failed",
      trigger,
      scope: args.scope,
      shipDeploymentId: args.shipDeploymentId || null,
      stats,
      error: errorMessage,
    })
  }
}

function scopeFromJoinedPathForMutation(joinedPath: string): {
  scope: VaultRagSyncScope
  shipDeploymentId: string | null
} {
  const scopeMeta = classifyVaultRagScope(joinedPath)
  if (scopeMeta.scopeType === "ship") {
    return {
      scope: "ship",
      shipDeploymentId: scopeMeta.shipDeploymentId,
    }
  }

  if (scopeMeta.scopeType === "fleet") {
    return {
      scope: "fleet",
      shipDeploymentId: null,
    }
  }

  return {
    scope: "all",
    shipDeploymentId: null,
  }
}

async function upsertJoinedPathFromFilesystem(joinedPath: string): Promise<boolean> {
  const parsed = parseJoinedVaultPath(joinedPath)
  if (!parsed) {
    return false
  }

  if (isPrivateVaultId(parsed.vaultId)) {
    await prisma.vaultRagDocument.deleteMany({
      where: {
        joinedPath,
      },
    })
    return false
  }

  const rootPath = resolveVaultAbsolutePath(parsed.vaultId)
  const file = await readMarkdownFile(rootPath, parsed.innerPath).catch(() => null)
  if (!file) {
    await prisma.vaultRagDocument.deleteMany({
      where: {
        joinedPath,
      },
    })
    return false
  }

  const scopeMeta = classifyVaultRagScope(joinedPath)
  const scanned: ScannedDocument = {
    joinedPath,
    physicalVaultId: parsed.vaultId,
    physicalPath: parsed.innerPath,
    title: basename(parsed.innerPath, ".md"),
    scopeType: scopeMeta.scopeType,
    shipDeploymentId: scopeMeta.shipDeploymentId,
    content: file.content,
    contentHash: contentHashFor(file.content),
    byteSize: Buffer.byteLength(file.content, "utf8"),
    mtime: file.mtime,
    chunks: chunkMarkdownForRag(file.content),
  }

  const result = await upsertScannedDocument(scanned)
  return result.upserted
}

export async function syncVaultRagMutation(args: {
  upsertJoinedPaths?: string[]
  deleteJoinedPaths?: string[]
  mode?: VaultRagQueryMode
}): Promise<VaultRagSyncSummary | null> {
  if (!vaultRagEnabled() || !vaultRagSyncOnWrite()) {
    return null
  }

  const upsertJoinedPaths = [...new Set((args.upsertJoinedPaths || []).filter(Boolean))]
  const deleteJoinedPaths = [...new Set((args.deleteJoinedPaths || []).filter(Boolean))]

  if (upsertJoinedPaths.length === 0 && deleteJoinedPaths.length === 0) {
    return null
  }

  const scopeSeed = upsertJoinedPaths[0] || deleteJoinedPaths[0]
  const scopeFromSeed = scopeSeed ? scopeFromJoinedPathForMutation(scopeSeed) : { scope: "all" as VaultRagSyncScope, shipDeploymentId: null }

  const run = await prisma.vaultRagSyncRun.create({
    data: {
      trigger: "auto",
      scope: scopeFromSeed.scope,
      status: "running",
      shipDeploymentId: scopeFromSeed.shipDeploymentId,
      mode: args.mode || "hybrid",
    },
    select: {
      id: true,
    },
  })

  const stats: SyncStats = {
    documentsScanned: 0,
    documentsUpserted: 0,
    documentsRemoved: 0,
    chunksUpserted: 0,
  }

  try {
    for (const joinedPath of deleteJoinedPaths) {
      const result = await prisma.vaultRagDocument.deleteMany({
        where: {
          joinedPath,
        },
      })
      stats.documentsRemoved += result.count
    }

    for (const joinedPath of upsertJoinedPaths) {
      stats.documentsScanned += 1
      const upserted = await upsertJoinedPathFromFilesystem(joinedPath)
      if (upserted) {
        stats.documentsUpserted += 1
      }
    }

    await updateSyncRun({
      runId: run.id,
      status: "completed",
      stats,
    })

    return toSyncSummary({
      runId: run.id,
      status: "completed",
      trigger: "auto",
      scope: scopeFromSeed.scope,
      shipDeploymentId: scopeFromSeed.shipDeploymentId,
      stats,
      error: null,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Vault RAG mutation sync failed"
    await updateSyncRun({
      runId: run.id,
      status: "failed",
      stats,
      error: errorMessage,
    }).catch(() => {})

    return toSyncSummary({
      runId: run.id,
      status: "failed",
      trigger: "auto",
      scope: scopeFromSeed.scope,
      shipDeploymentId: scopeFromSeed.shipDeploymentId,
      stats,
      error: errorMessage,
    })
  }
}

export async function getLatestVaultRagSyncRun(args: {
  scope?: VaultRagSyncScope
  shipDeploymentId?: string
} = {}): Promise<VaultRagSyncSummary | null> {
  const run = await prisma.vaultRagSyncRun.findFirst({
    where: {
      ...(args.scope ? { scope: args.scope } : {}),
      ...(args.shipDeploymentId ? { shipDeploymentId: args.shipDeploymentId } : {}),
    },
    orderBy: {
      createdAt: "desc",
    },
  })

  if (!run) {
    return null
  }

  return {
    runId: run.id,
    status: run.status,
    trigger: run.trigger,
    scope: run.scope,
    shipDeploymentId: run.shipDeploymentId,
    documentsScanned: run.documentsScanned,
    documentsUpserted: run.documentsUpserted,
    documentsRemoved: run.documentsRemoved,
    chunksUpserted: run.chunksUpserted,
    error: run.error,
  }
}

async function queryEmbeddingForInput(input: string, mode: VaultRagQueryMode): Promise<{ vector: number[] | null; fallbackUsed: boolean }> {
  if (mode !== "hybrid") {
    return {
      vector: null,
      fallbackUsed: false,
    }
  }

  const vectors = await embedTextsWithOpenAi([input])
  if (!vectors || vectors.length === 0) {
    return {
      vector: null,
      fallbackUsed: true,
    }
  }

  return {
    vector: vectors[0],
    fallbackUsed: false,
  }
}

export async function queryVaultRag(args: {
  query: string
  vaultId: "orchwiz" | "ship" | "agent-public" | "agent-private" | "joined"
  mode?: VaultRagQueryMode
  scope?: VaultKnowledgeScope
  shipDeploymentId?: string
  k?: number
}): Promise<VaultRagQueryResult> {
  const mode = args.mode || "hybrid"
  const scope = args.scope || "all"
  const query = args.query.trim()

  if (!vaultRagEnabled()) {
    return {
      mode,
      fallbackUsed: true,
      results: [],
    }
  }

  if (!query) {
    return {
      mode,
      fallbackUsed: false,
      results: [],
    }
  }

  const queryTokens = tokenizeRagText(query)
  const queryLower = query.toLowerCase()
  const k = Math.max(1, Math.min(100, args.k || ragTopKDefault()))

  const where: Prisma.VaultRagChunkWhereInput = {
    ...(args.vaultId !== "joined"
      ? {
          joinedPath: {
            startsWith: `${args.vaultId}/`,
          },
        }
      : {}),
  }

  const candidateRows = await prisma.vaultRagChunk.findMany({
    where,
    select: {
      id: true,
      joinedPath: true,
      scopeType: true,
      shipDeploymentId: true,
      content: true,
      normalizedContent: true,
      embedding: true,
      document: {
        select: {
          title: true,
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: ragCandidateLimit(),
  })

  if (candidateRows.length === 0) {
    return {
      mode,
      fallbackUsed: true,
      results: [],
    }
  }

  const embeddingResolution = await queryEmbeddingForInput(query, mode)

  const ranked: RankedChunk[] = []
  for (const row of candidateRows) {
    if (
      !scopeMatchesSelection({
        scopeType: row.scopeType,
        shipDeploymentId: row.shipDeploymentId,
        scope,
        requestedShipDeploymentId: args.shipDeploymentId,
      })
    ) {
      continue
    }

    const parsedEmbedding = parseEmbedding(row.embedding)
    const scoring = rankVaultRagCandidate({
      queryTokens,
      queryLower,
      queryEmbedding: embeddingResolution.vector,
      mode,
      chunkPath: row.joinedPath,
      chunkTitle: row.document.title,
      chunkNormalizedContent: row.normalizedContent,
      chunkEmbedding: parsedEmbedding,
      chunkScopeType: row.scopeType,
      chunkShipDeploymentId: row.shipDeploymentId,
      requestedShipDeploymentId: args.shipDeploymentId,
    })

    if (scoring.score <= 0) {
      continue
    }

    ranked.push({
      chunkId: row.id,
      path: row.joinedPath,
      title: row.document.title,
      scopeType: row.scopeType,
      shipDeploymentId: row.shipDeploymentId,
      content: row.content,
      score: scoring.score,
      lexicalScore: scoring.lexical,
      semanticScore: scoring.semantic,
    })
  }

  ranked.sort((left, right) => right.score - left.score)

  const top = ranked.slice(0, k)
  const results: VaultRagCitation[] = top.map((entry, index) => ({
    id: `S${index + 1}`,
    path: entry.path,
    title: entry.title,
    excerpt: excerptAround(entry.content, query),
    scopeType: entry.scopeType,
    shipDeploymentId: entry.shipDeploymentId,
    score: Number(entry.score.toFixed(4)),
    lexicalScore: Number(entry.lexicalScore.toFixed(4)),
    semanticScore: Number(entry.semanticScore.toFixed(4)),
  }))

  return {
    mode,
    fallbackUsed: embeddingResolution.fallbackUsed,
    results,
  }
}

export async function searchVaultRagNotes(args: {
  query: string
  vaultId: "orchwiz" | "ship" | "agent-public" | "agent-private" | "joined"
  mode?: VaultRagQueryMode
  scope?: VaultKnowledgeScope
  shipDeploymentId?: string
  k?: number
}): Promise<VaultRagSearchResponse> {
  const queryResult = await queryVaultRag(args)
  const grouped = new Map<string, VaultRagSearchResult>()

  for (const citation of queryResult.results) {
    const parsed = parseJoinedVaultPath(citation.path)
    if (!parsed) {
      continue
    }

    const scopedPath = args.vaultId === "joined" ? citation.path : parsed.innerPath
    const existing = grouped.get(scopedPath)

    const scopedCitation: VaultRagCitation = {
      ...citation,
      path: scopedPath,
    }

    if (!existing) {
      grouped.set(scopedPath, {
        vaultId: args.vaultId,
        path: scopedPath,
        title: citation.title,
        excerpt: citation.excerpt,
        score: citation.score,
        scopeType: citation.scopeType,
        shipDeploymentId: citation.shipDeploymentId,
        citations: [scopedCitation],
        originVaultId: parsed.vaultId,
      })
      continue
    }

    existing.citations.push(scopedCitation)
    if (scopedCitation.score > existing.score) {
      existing.score = scopedCitation.score
      existing.excerpt = scopedCitation.excerpt
      existing.scopeType = scopedCitation.scopeType
      existing.shipDeploymentId = scopedCitation.shipDeploymentId
    }
  }

  const results = Array.from(grouped.values())
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, Math.min(100, args.k || ragTopKDefault())))

  return {
    mode: queryResult.mode,
    fallbackUsed: queryResult.fallbackUsed,
    results,
  }
}

export function listRagIndexableJoinedPathsForVault(vaultId: string, paths: string[]): string[] {
  if (!isPhysicalVaultId(vaultId) || isPrivateVaultId(vaultId)) {
    return []
  }

  return paths.map((path) => toJoinedVaultPath(vaultId, path))
}
