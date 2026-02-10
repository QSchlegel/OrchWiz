import { createHash } from "node:crypto"
import { basename } from "node:path"
import { prisma } from "@/lib/prisma"
import { parseJoinedVaultPath, resolveVaultAbsolutePath } from "@/lib/vault/config"
import { readMarkdownFile } from "@/lib/vault/fs"
import { decryptPrivateVaultContent, privateMemoryEncryptionRequired } from "@/lib/vault/private-enclave-client"
import { parsePrivateVaultEncryptedEnvelope } from "@/lib/vault/private-encryption"
import {
  chunkMarkdownForRag,
  cosineSimilarity,
  tokenizeRagText,
  type VaultRagCitation,
  type VaultRagQueryMode,
} from "@/lib/vault/rag"
import type { VaultSearchResponse } from "@/lib/vault/types"

interface LocalPrivateChunkCandidate {
  id: string
  joinedPath: string
  content: string
  normalizedContent: string
  embedding: unknown
  document: {
    title: string
  }
}

function asPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }
  return parsed
}

function queryTopKDefault(): number {
  return asPositiveInt(process.env.LOCAL_PRIVATE_RAG_TOP_K, 12)
}

function queryCandidateLimit(): number {
  return asPositiveInt(process.env.LOCAL_PRIVATE_RAG_QUERY_CANDIDATE_LIMIT, 1200)
}

function embeddingModel(): string {
  return process.env.VAULT_RAG_EMBEDDING_MODEL?.trim() || "text-embedding-3-small"
}

function contentHashFor(text: string): string {
  return createHash("sha256").update(text).digest("hex")
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

async function embedTextsWithOpenAi(texts: string[]): Promise<number[][] | null> {
  if (texts.length === 0) {
    return []
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    return null
  }

  let response: Response
  try {
    response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: embeddingModel(),
        input: texts,
      }),
    })
  } catch (error) {
    console.error("Local private RAG embedding request failed:", error)
    return null
  }

  if (!response.ok) {
    console.error("Local private RAG embedding request returned non-2xx:", response.status)
    return null
  }

  const payload = (await response.json().catch(() => null)) as
    | { data?: Array<{ embedding?: unknown; index?: number }> }
    | null
  if (!payload?.data || !Array.isArray(payload.data)) {
    return null
  }

  const ordered = [...payload.data].sort((a, b) => (a.index || 0) - (b.index || 0))
  const vectors: number[][] = []
  for (const entry of ordered) {
    const embedding = parseEmbedding(entry.embedding)
    if (!embedding) {
      return null
    }
    vectors.push(embedding)
  }

  return vectors
}

async function readPrivatePlaintext(relativePath: string): Promise<{ content: string; size: number; mtime: Date } | null> {
  const rootPath = resolveVaultAbsolutePath("agent-private")
  const file = await readMarkdownFile(rootPath, relativePath).catch(() => null)
  if (!file) {
    return null
  }

  const envelope = parsePrivateVaultEncryptedEnvelope(file.content)
  if (!envelope) {
    return file
  }

  try {
    const plaintext = await decryptPrivateVaultContent({ envelope })
    return {
      content: plaintext,
      size: file.size,
      mtime: file.mtime,
    }
  } catch (error) {
    if (privateMemoryEncryptionRequired()) {
      throw error
    }
    return file
  }
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

function excerptAround(content: string, query: string): string {
  const compact = content.replace(/\s+/g, " ").trim()
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

function toScopedPath(joinedPath: string, vaultId: "joined" | "agent-private"): string {
  if (vaultId === "joined") {
    return joinedPath
  }

  const parsed = parseJoinedVaultPath(joinedPath)
  return parsed ? parsed.innerPath : joinedPath
}

function isAgentPrivateJoinedPath(joinedPath: string): boolean {
  const parsed = parseJoinedVaultPath(joinedPath)
  return parsed?.vaultId === "agent-private"
}

async function upsertJoinedPath(joinedPath: string): Promise<void> {
  const parsed = parseJoinedVaultPath(joinedPath)
  if (!parsed || parsed.vaultId !== "agent-private") {
    return
  }

  const file = await readPrivatePlaintext(parsed.innerPath)
  if (!file) {
    await prisma.localPrivateRagDocument.deleteMany({
      where: {
        joinedPath,
      },
    })
    return
  }

  const chunks = chunkMarkdownForRag(file.content)
  const embeddings = await embedTextsWithOpenAi(chunks.map((chunk) => chunk.content))

  await prisma.$transaction(async (tx) => {
    const doc = await tx.localPrivateRagDocument.upsert({
      where: {
        joinedPath,
      },
      create: {
        joinedPath,
        physicalPath: parsed.innerPath,
        title: basename(parsed.innerPath, ".md"),
        contentHash: contentHashFor(file.content),
        byteSize: Buffer.byteLength(file.content, "utf8"),
        mtime: file.mtime,
        chunkCount: chunks.length,
        lastIndexedAt: new Date(),
      },
      update: {
        physicalPath: parsed.innerPath,
        title: basename(parsed.innerPath, ".md"),
        contentHash: contentHashFor(file.content),
        byteSize: Buffer.byteLength(file.content, "utf8"),
        mtime: file.mtime,
        chunkCount: chunks.length,
        lastIndexedAt: new Date(),
      },
      select: {
        id: true,
      },
    })

    await tx.localPrivateRagChunk.deleteMany({
      where: {
        documentId: doc.id,
      },
    })

    if (chunks.length > 0) {
      await tx.localPrivateRagChunk.createMany({
        data: chunks.map((chunk, idx) => ({
          documentId: doc.id,
          joinedPath,
          chunkIndex: chunk.chunkIndex,
          heading: chunk.heading,
          content: chunk.content,
          normalizedContent: chunk.normalizedContent,
          embedding: embeddings?.[idx] ?? undefined,
          tokenCount: chunk.tokenCount,
        })),
      })
    }
  })
}

export async function syncLocalPrivateRagMutation(args: {
  upsertJoinedPaths?: string[]
  deleteJoinedPaths?: string[]
}): Promise<void> {
  const upsertJoinedPaths = [...new Set((args.upsertJoinedPaths || []).filter((path) => isAgentPrivateJoinedPath(path)))]
  const deleteJoinedPaths = [...new Set((args.deleteJoinedPaths || []).filter((path) => isAgentPrivateJoinedPath(path)))]

  for (const joinedPath of deleteJoinedPaths) {
    await prisma.localPrivateRagDocument.deleteMany({
      where: {
        joinedPath,
      },
    })
  }

  for (const joinedPath of upsertJoinedPaths) {
    await upsertJoinedPath(joinedPath)
  }
}

export async function queryLocalPrivateRag(args: {
  query: string
  mode?: VaultRagQueryMode
  k?: number
}): Promise<{
  mode: VaultRagQueryMode
  fallbackUsed: boolean
  results: VaultRagCitation[]
}> {
  const query = args.query.trim()
  const mode = args.mode || "hybrid"
  const k = Math.max(1, Math.min(100, args.k || queryTopKDefault()))

  if (!query) {
    return {
      mode,
      fallbackUsed: mode !== "lexical",
      results: [],
    }
  }

  const queryTokens = tokenizeRagText(query)
  const queryLower = query.toLowerCase()
  const candidates = await prisma.localPrivateRagChunk.findMany({
    select: {
      id: true,
      joinedPath: true,
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
    take: queryCandidateLimit(),
  }) as LocalPrivateChunkCandidate[]

  if (candidates.length === 0) {
    return {
      mode,
      fallbackUsed: mode !== "lexical",
      results: [],
    }
  }

  let queryEmbedding: number[] | null = null
  let fallbackUsed = false
  if (mode === "hybrid") {
    const embedded = await embedTextsWithOpenAi([query])
    if (embedded?.[0]) {
      queryEmbedding = embedded[0]
    } else {
      fallbackUsed = true
    }
  }

  const ranked = candidates
    .map((row) => {
      const lexical = lexicalScore(queryTokens, row.normalizedContent)
      const semantic = queryEmbedding
        ? Math.max(0, cosineSimilarity(queryEmbedding, parseEmbedding(row.embedding) || []))
        : 0
      const titlePath = pathTitleBonus(queryLower, row.joinedPath, row.document.title)

      const score = queryEmbedding
        ? lexical * 0.44 + semantic * 0.44 + titlePath
        : lexical * 0.92 + titlePath

      return {
        row,
        lexical,
        semantic,
        score,
      }
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, k)

  const results: VaultRagCitation[] = ranked.map((entry, idx) => ({
    id: `S${idx + 1}`,
    path: entry.row.joinedPath,
    title: entry.row.document.title,
    excerpt: excerptAround(entry.row.content, query),
    scopeType: "global",
    shipDeploymentId: null,
    score: Number(entry.score.toFixed(4)),
    lexicalScore: Number(entry.lexical.toFixed(4)),
    semanticScore: Number(entry.semantic.toFixed(4)),
  }))

  return {
    mode,
    fallbackUsed,
    results,
  }
}

export async function searchLocalPrivateRagNotes(args: {
  query: string
  mode?: VaultRagQueryMode
  k?: number
  vaultId: "agent-private" | "joined"
}): Promise<VaultSearchResponse> {
  const queryResult = await queryLocalPrivateRag({
    query: args.query,
    mode: args.mode,
    k: args.k,
  })

  const grouped = new Map<string, VaultSearchResponse["results"][number]>()

  for (const citation of queryResult.results) {
    const scopedPath = toScopedPath(citation.path, args.vaultId)
    const existing = grouped.get(scopedPath)
    if (!existing) {
      grouped.set(scopedPath, {
        vaultId: args.vaultId,
        path: scopedPath,
        title: citation.title,
        excerpt: citation.excerpt,
        originVaultId: "agent-private",
        score: citation.score,
        scopeType: citation.scopeType,
        shipDeploymentId: citation.shipDeploymentId,
        citations: [
          {
            ...citation,
            path: scopedPath,
          },
        ],
      })
      continue
    }

    existing.citations ||= []
    existing.citations.push({
      ...citation,
      path: scopedPath,
    })
    if ((citation.score || 0) > (existing.score || 0)) {
      existing.score = citation.score
      existing.excerpt = citation.excerpt
    }
  }

  const results = Array.from(grouped.values())
    .sort((left, right) => (right.score || 0) - (left.score || 0))
    .slice(0, Math.max(1, Math.min(100, args.k || queryTopKDefault())))

  return {
    vaultId: args.vaultId,
    exists: true,
    mode: queryResult.mode,
    fallbackUsed: queryResult.fallbackUsed,
    results,
  }
}
