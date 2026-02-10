import crypto from "node:crypto"
import type { PoolClient } from "pg"
import type { DataCoreConfig } from "./config.js"
import type { DataCoreDb } from "./db.js"
import { chunkMarkdownForRag, cosineSimilarity, embedTextsWithOpenAi, normalizeRagText, parseEmbedding, tokenizeRagText } from "./chunking.js"
import { extractLinks, resolveLinkPath } from "./links.js"
import type { MemoryWriteEnvelope } from "./schema.js"
import { canonicalPayloadHash, verifyWriteSignature } from "./signature.js"
import { canonicalTitleFromPath } from "./util.js"

interface DocumentRow {
  domain: string
  canonical_path: string
  title: string
  content_markdown: string
  metadata: Record<string, unknown>
  latest_event_id: string
  updated_at: string
  deleted_at: string | null
}

interface ChunkRow {
  id: string
  domain: string
  canonical_path: string
  chunk_index: number
  heading: string | null
  content: string
  normalized_content: string
  embedding: unknown
}

interface EventRow {
  id: string
  cursor: number
  source_core_id: string
  source_seq: number
  idempotency_key: string
  operation: string
  domain: string
  canonical_path: string
  content_markdown: string | null
  metadata: Record<string, unknown>
  writer_type: string
  writer_id: string
  signature: Record<string, unknown>
  payload_hash: string
  occurred_at: string
  ingested_at: string
  deleted: boolean
  supersedes_event_id: string | null
  status: string
}

function ensureCanonicalPath(domain: string, canonicalPath: string): void {
  if (!canonicalPath.startsWith(`${domain}/`)) {
    throw new Error(`canonicalPath must start with ${domain}/`)
  }
}

function asDate(value: string): Date {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return new Date()
  }
  return parsed
}

function lexicalScore(queryTokens: string[], haystack: string): number {
  if (queryTokens.length === 0 || !haystack) {
    return 0
  }

  let matches = 0
  for (const token of queryTokens) {
    if (haystack.includes(token)) {
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

function titlePathBonus(queryLower: string, canonicalPath: string, title: string): number {
  if (!queryLower) return 0
  const pathLower = canonicalPath.toLowerCase()
  const titleLower = title.toLowerCase()

  if (pathLower.includes(queryLower)) {
    return 0.12
  }

  if (titleLower.includes(queryLower)) {
    return 0.1
  }

  return 0
}

function deterministicMerge(args: {
  canonicalPath: string
  currentContent: string
  incomingContent: string
}): string {
  if (!args.currentContent.trim()) {
    return args.incomingContent
  }
  if (!args.incomingContent.trim()) {
    return args.currentContent
  }

  const currentLines = args.currentContent.trim().split("\n")
  const incomingLines = args.incomingContent.trim().split("\n")
  const seen = new Set<string>()
  const mergedBody: string[] = []

  for (const line of [...currentLines, ...incomingLines]) {
    const normalized = line.trim()
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    mergedBody.push(normalized)
  }

  return [
    `# Merge Resolution`,
    "",
    `Resolved path: ${args.canonicalPath}`,
    "",
    ...mergedBody,
    "",
  ].join("\n")
}

export class MemoryStore {
  constructor(
    private readonly db: DataCoreDb,
    private readonly config: DataCoreConfig,
  ) {}

  async upsertSigner(input: {
    writerType: string
    writerId: string
    keyRef: string
    address: string
    key?: string
    metadata?: Record<string, unknown>
  }): Promise<{ writerType: string; writerId: string; keyRef: string; address: string }> {
    const id = crypto.randomUUID()
    const metadata = input.metadata || {}

    await this.db.query(
      `
        INSERT INTO signer_registry (id, writer_type, writer_id, key_ref, address, key, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        ON CONFLICT (writer_type, writer_id)
        DO UPDATE SET
          key_ref = EXCLUDED.key_ref,
          address = EXCLUDED.address,
          key = EXCLUDED.key,
          metadata = EXCLUDED.metadata,
          updated_at = now()
      `,
      [id, input.writerType, input.writerId, input.keyRef, input.address, input.key || null, JSON.stringify(metadata)],
    )

    return {
      writerType: input.writerType,
      writerId: input.writerId,
      keyRef: input.keyRef,
      address: input.address,
    }
  }

  async getSigner(writerType: string, writerId: string): Promise<{
    writerType: string
    writerId: string
    keyRef: string
    address: string
    key: string | null
    metadata: Record<string, unknown>
  } | null> {
    const result = await this.db.query<{
      writer_type: string
      writer_id: string
      key_ref: string
      address: string
      key: string | null
      metadata: Record<string, unknown>
    }>(
      `
        SELECT writer_type, writer_id, key_ref, address, key, metadata
        FROM signer_registry
        WHERE writer_type = $1 AND writer_id = $2
        LIMIT 1
      `,
      [writerType, writerId],
    )

    const row = result.rows[0]
    if (!row) {
      return null
    }

    return {
      writerType: row.writer_type,
      writerId: row.writer_id,
      keyRef: row.key_ref,
      address: row.address,
      key: row.key,
      metadata: row.metadata || {},
    }
  }

  private async replaceChunks(args: {
    client: PoolClient
    domain: string
    canonicalPath: string
    contentMarkdown: string
  }): Promise<void> {
    await args.client.query(
      `DELETE FROM memory_chunk_index WHERE domain = $1 AND canonical_path = $2`,
      [args.domain, args.canonicalPath],
    )

    const chunks = chunkMarkdownForRag(args.contentMarkdown)
    if (chunks.length === 0) {
      return
    }

    const embeddingModel = process.env.DATA_CORE_EMBEDDING_MODEL?.trim() || "text-embedding-3-small"
    const embeddings = await embedTextsWithOpenAi(chunks.map((chunk) => chunk.content), embeddingModel)

    for (let idx = 0; idx < chunks.length; idx += 1) {
      const chunk = chunks[idx]
      await args.client.query(
        `
          INSERT INTO memory_chunk_index (
            id,
            domain,
            canonical_path,
            chunk_index,
            heading,
            content,
            normalized_content,
            embedding,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now())
        `,
        [
          crypto.randomUUID(),
          args.domain,
          args.canonicalPath,
          chunk.chunkIndex,
          chunk.heading,
          chunk.content,
          chunk.normalizedContent,
          embeddings?.[idx] ? JSON.stringify(embeddings[idx]) : null,
        ],
      )
    }
  }

  private async insertEvent(args: {
    client: PoolClient
    envelope: MemoryWriteEnvelope
    deleted: boolean
    supersedesEventId?: string | null
  }): Promise<{ eventId: string; duplicate: boolean }> {
    const { envelope } = args

    const duplicate = await args.client.query<{ id: string }>(
      `
        SELECT id
        FROM memory_event_log
        WHERE idempotency_key = $1
        LIMIT 1
      `,
      [envelope.event.idempotencyKey],
    )

    if (duplicate.rows[0]) {
      return {
        eventId: duplicate.rows[0].id,
        duplicate: true,
      }
    }

    const eventId = crypto.randomUUID()

    await args.client.query(
      `
        INSERT INTO memory_event_log (
          id,
          source_core_id,
          source_seq,
          idempotency_key,
          operation,
          domain,
          canonical_path,
          content_markdown,
          metadata,
          writer_type,
          writer_id,
          signature,
          payload_hash,
          occurred_at,
          deleted,
          supersedes_event_id
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9::jsonb,
          $10,
          $11,
          $12::jsonb,
          $13,
          $14::timestamptz,
          $15,
          $16
        )
      `,
      [
        eventId,
        envelope.event.sourceCoreId,
        envelope.event.sourceSeq,
        envelope.event.idempotencyKey,
        envelope.operation,
        envelope.domain,
        envelope.canonicalPath,
        envelope.contentMarkdown || null,
        JSON.stringify(envelope.metadata),
        envelope.metadata.writerType,
        envelope.metadata.writerId,
        JSON.stringify(envelope.signature),
        envelope.signature.payloadHash,
        envelope.event.occurredAt,
        args.deleted,
        args.supersedesEventId || null,
      ],
    )

    return {
      eventId,
      duplicate: false,
    }
  }

  async applyWriteEnvelope(args: {
    envelope: MemoryWriteEnvelope
    skipSignatureCheck?: boolean
  }): Promise<{
    eventId: string
    duplicate: boolean
    domain: string
    canonicalPath: string
    mergeQueued: boolean
  }> {
    const { envelope } = args
    ensureCanonicalPath(envelope.domain, envelope.canonicalPath)

    return this.db.transaction(async (client) => {
      if (!args.skipSignatureCheck) {
        const verified = await verifyWriteSignature({
          db: this.db,
          client,
          envelope,
        })
        if (!verified.ok) {
          throw new Error(verified.reason || "Signature verification failed")
        }
      } else {
        const computedHash = canonicalPayloadHash(envelope)
        if (computedHash !== envelope.signature.payloadHash) {
          throw new Error("Payload hash mismatch")
        }
      }

      const existingDoc = await client.query<DocumentRow>(
        `
          SELECT domain, canonical_path, title, content_markdown, metadata, latest_event_id, updated_at, deleted_at
          FROM memory_document_current
          WHERE domain = $1 AND canonical_path = $2
          LIMIT 1
        `,
        [envelope.domain, envelope.canonicalPath],
      )

      const latest = existingDoc.rows[0]
      const previousUpdatedAt = latest ? asDate(latest.updated_at) : null
      const incomingOccurredAt = asDate(envelope.event.occurredAt)

      let mergeQueued = false
      if (
        latest
        && !latest.deleted_at
        && previousUpdatedAt
        && previousUpdatedAt.getTime() > incomingOccurredAt.getTime()
        && latest.metadata?.writerId
        && String(latest.metadata.writerId) !== envelope.metadata.writerId
      ) {
        const mergeJobId = crypto.randomUUID()
        await client.query(
          `
            INSERT INTO memory_merge_job (id, domain, canonical_path, base_event_id, incoming_event_id, status)
            VALUES ($1, $2, $3, $4, $5, 'pending')
          `,
          [mergeJobId, envelope.domain, envelope.canonicalPath, latest.latest_event_id, "pending"],
        ).catch(() => {})
        mergeQueued = true
      }

      const deleted = envelope.operation === "delete"
      const inserted = await this.insertEvent({
        client,
        envelope,
        deleted,
        supersedesEventId: latest?.latest_event_id || null,
      })

      if (inserted.duplicate) {
        return {
          eventId: inserted.eventId,
          duplicate: true,
          domain: envelope.domain,
          canonicalPath: envelope.canonicalPath,
          mergeQueued,
        }
      }

      if (envelope.operation === "delete") {
        await client.query(
          `
            INSERT INTO memory_document_current (
              domain,
              canonical_path,
              title,
              content_markdown,
              metadata,
              latest_event_id,
              updated_at,
              deleted_at
            )
            VALUES ($1, $2, $3, COALESCE($4, ''), $5::jsonb, $6, now(), now())
            ON CONFLICT (domain, canonical_path)
            DO UPDATE SET
              latest_event_id = EXCLUDED.latest_event_id,
              metadata = EXCLUDED.metadata,
              updated_at = now(),
              deleted_at = now()
          `,
          [
            envelope.domain,
            envelope.canonicalPath,
            canonicalTitleFromPath(envelope.canonicalPath),
            latest?.content_markdown || "",
            JSON.stringify(envelope.metadata),
            inserted.eventId,
          ],
        )

        await client.query(
          `DELETE FROM memory_chunk_index WHERE domain = $1 AND canonical_path = $2`,
          [envelope.domain, envelope.canonicalPath],
        )
      } else if (envelope.operation === "move") {
        const fromCanonicalPath = envelope.metadata.fromCanonicalPath
        if (!fromCanonicalPath || !fromCanonicalPath.trim()) {
          throw new Error("Move operation requires metadata.fromCanonicalPath")
        }
        ensureCanonicalPath(envelope.domain, fromCanonicalPath)

        const sourceDocResult = await client.query<DocumentRow>(
          `
            SELECT domain, canonical_path, title, content_markdown, metadata, latest_event_id, updated_at, deleted_at
            FROM memory_document_current
            WHERE domain = $1 AND canonical_path = $2
            LIMIT 1
          `,
          [envelope.domain, fromCanonicalPath],
        )
        const sourceDoc = sourceDocResult.rows[0]
        if (!sourceDoc || sourceDoc.deleted_at) {
          throw new Error("Source memory path not found for move")
        }

        const movedContent = envelope.contentMarkdown || sourceDoc.content_markdown
        await client.query(
          `
            INSERT INTO memory_document_current (
              domain,
              canonical_path,
              title,
              content_markdown,
              metadata,
              latest_event_id,
              updated_at,
              deleted_at
            )
            VALUES ($1, $2, $3, $4, $5::jsonb, $6, now(), NULL)
            ON CONFLICT (domain, canonical_path)
            DO UPDATE SET
              title = EXCLUDED.title,
              content_markdown = EXCLUDED.content_markdown,
              metadata = EXCLUDED.metadata,
              latest_event_id = EXCLUDED.latest_event_id,
              updated_at = now(),
              deleted_at = NULL
          `,
          [
            envelope.domain,
            envelope.canonicalPath,
            canonicalTitleFromPath(envelope.canonicalPath),
            movedContent,
            JSON.stringify(envelope.metadata),
            inserted.eventId,
          ],
        )

        await client.query(
          `
            UPDATE memory_document_current
            SET latest_event_id = $1, deleted_at = now(), updated_at = now()
            WHERE domain = $2 AND canonical_path = $3
          `,
          [inserted.eventId, envelope.domain, fromCanonicalPath],
        )

        await client.query(
          `DELETE FROM memory_chunk_index WHERE domain = $1 AND canonical_path = $2`,
          [envelope.domain, fromCanonicalPath],
        )

        await this.replaceChunks({
          client,
          domain: envelope.domain,
          canonicalPath: envelope.canonicalPath,
          contentMarkdown: movedContent,
        })
      } else {
        const content = envelope.contentMarkdown || ""
        await client.query(
          `
            INSERT INTO memory_document_current (
              domain,
              canonical_path,
              title,
              content_markdown,
              metadata,
              latest_event_id,
              updated_at,
              deleted_at
            )
            VALUES ($1, $2, $3, $4, $5::jsonb, $6, now(), NULL)
            ON CONFLICT (domain, canonical_path)
            DO UPDATE SET
              title = EXCLUDED.title,
              content_markdown = EXCLUDED.content_markdown,
              metadata = EXCLUDED.metadata,
              latest_event_id = EXCLUDED.latest_event_id,
              updated_at = now(),
              deleted_at = NULL
          `,
          [
            envelope.domain,
            envelope.canonicalPath,
            canonicalTitleFromPath(envelope.canonicalPath),
            content,
            JSON.stringify(envelope.metadata),
            inserted.eventId,
          ],
        )

        await this.replaceChunks({
          client,
          domain: envelope.domain,
          canonicalPath: envelope.canonicalPath,
          contentMarkdown: content,
        })
      }

      if (mergeQueued) {
        await client.query(
          `
            INSERT INTO memory_merge_job (id, domain, canonical_path, base_event_id, incoming_event_id, status)
            VALUES ($1, $2, $3, $4, $5, 'pending')
          `,
          [crypto.randomUUID(), envelope.domain, envelope.canonicalPath, latest?.latest_event_id || null, inserted.eventId],
        ).catch(() => {})
      }

      return {
        eventId: inserted.eventId,
        duplicate: false,
        domain: envelope.domain,
        canonicalPath: envelope.canonicalPath,
        mergeQueued,
      }
    })
  }

  async getFile(args: { domain: string; canonicalPath: string }): Promise<{
    domain: string
    canonicalPath: string
    title: string
    contentMarkdown: string
    metadata: Record<string, unknown>
    mtime: string
    size: number
    outgoingLinks: Array<{
      kind: "wiki" | "markdown"
      target: string
      label: string
      exists: boolean
      resolvedCanonicalPath: string | null
    }>
    backlinks: Array<{
      kind: "wiki" | "markdown"
      sourceCanonicalPath: string
      target: string
      label: string
      resolvedCanonicalPath: string
    }>
  } | null> {
    const fileResult = await this.db.query<DocumentRow>(
      `
        SELECT domain, canonical_path, title, content_markdown, metadata, latest_event_id, updated_at, deleted_at
        FROM memory_document_current
        WHERE domain = $1 AND canonical_path = $2
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [args.domain, args.canonicalPath],
    )

    const file = fileResult.rows[0]
    if (!file) {
      return null
    }

    const allPathsResult = await this.db.query<{ canonical_path: string }>(
      `
        SELECT canonical_path
        FROM memory_document_current
        WHERE domain = $1 AND deleted_at IS NULL
      `,
      [args.domain],
    )

    const allPaths = new Set(allPathsResult.rows.map((row) => row.canonical_path))

    const outgoingLinks = extractLinks(file.content_markdown).map((link) => {
      const resolved = resolveLinkPath({
        sourceCanonicalPath: file.canonical_path,
        target: link.target,
        allCanonicalPaths: allPaths,
      })

      return {
        kind: link.kind,
        target: link.target,
        label: link.label,
        exists: Boolean(resolved),
        resolvedCanonicalPath: resolved,
      }
    })

    const backlinkDocs = await this.db.query<{ canonical_path: string; content_markdown: string }>(
      `
        SELECT canonical_path, content_markdown
        FROM memory_document_current
        WHERE domain = $1 AND deleted_at IS NULL
          AND canonical_path <> $2
      `,
      [args.domain, args.canonicalPath],
    )

    const backlinks: Array<{
      kind: "wiki" | "markdown"
      sourceCanonicalPath: string
      target: string
      label: string
      resolvedCanonicalPath: string
    }> = []

    for (const source of backlinkDocs.rows) {
      const links = extractLinks(source.content_markdown)
      for (const link of links) {
        const resolved = resolveLinkPath({
          sourceCanonicalPath: source.canonical_path,
          target: link.target,
          allCanonicalPaths: allPaths,
        })
        if (resolved !== args.canonicalPath) {
          continue
        }

        backlinks.push({
          kind: link.kind,
          sourceCanonicalPath: source.canonical_path,
          target: link.target,
          label: link.label,
          resolvedCanonicalPath: resolved,
        })
      }
    }

    return {
      domain: file.domain,
      canonicalPath: file.canonical_path,
      title: file.title,
      contentMarkdown: file.content_markdown,
      metadata: file.metadata || {},
      mtime: new Date(file.updated_at).toISOString(),
      size: Buffer.byteLength(file.content_markdown, "utf8"),
      outgoingLinks,
      backlinks,
    }
  }

  async listTree(args: {
    domain: string
    prefix?: string
  }): Promise<{
    domain: string
    prefix: string | null
    noteCount: number
    tree: Array<Record<string, unknown>>
  }> {
    const prefix = args.prefix?.trim() || null
    const where = prefix ? `AND canonical_path LIKE $2 || '%'` : ""
    const params = prefix ? [args.domain, prefix] : [args.domain]

    const rows = await this.db.query<{ canonical_path: string }>(
      `
        SELECT canonical_path
        FROM memory_document_current
        WHERE domain = $1
          AND deleted_at IS NULL
          ${where}
        ORDER BY canonical_path ASC
      `,
      params,
    )

    interface MutableNode {
      id: string
      name: string
      path: string
      nodeType: "folder" | "file"
      children?: Map<string, MutableNode>
    }

    const root = new Map<string, MutableNode>()

    const ensureNode = (
      collection: Map<string, MutableNode>,
      segment: string,
      path: string,
      nodeType: "folder" | "file",
    ): MutableNode => {
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

    for (const row of rows.rows) {
      const segments = row.canonical_path.split("/").filter(Boolean)
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

    const serialize = (collection: Map<string, MutableNode>): Array<Record<string, unknown>> =>
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

    return {
      domain: args.domain,
      prefix,
      noteCount: rows.rows.length,
      tree: serialize(root),
    }
  }

  async query(args: {
    query: string
    mode?: "hybrid" | "lexical"
    domain?: string
    prefix?: string
    k?: number
  }): Promise<{
    mode: "hybrid" | "lexical"
    fallbackUsed: boolean
    results: Array<{
      domain: string
      canonicalPath: string
      title: string
      excerpt: string
      score: number
      citations: Array<{
        id: string
        canonicalPath: string
        excerpt: string
        score: number
        lexicalScore: number
        semanticScore: number
      }>
    }>
  }> {
    const mode = args.mode || "hybrid"
    const k = Math.max(1, Math.min(100, args.k || this.config.queryTopKDefault))
    const query = args.query.trim()
    if (!query) {
      return {
        mode,
        fallbackUsed: mode !== "lexical",
        results: [],
      }
    }

    const whereClauses: string[] = ["d.deleted_at IS NULL"]
    const params: unknown[] = []

    if (args.domain) {
      params.push(args.domain)
      whereClauses.push(`c.domain = $${params.length}`)
    }

    if (args.prefix) {
      params.push(`${args.prefix}%`)
      whereClauses.push(`c.canonical_path LIKE $${params.length}`)
    }

    params.push(this.config.queryCandidateLimit)

    const candidates = await this.db.query<ChunkRow & { title: string }>(
      `
        SELECT
          c.id,
          c.domain,
          c.canonical_path,
          c.chunk_index,
          c.heading,
          c.content,
          c.normalized_content,
          c.embedding,
          d.title
        FROM memory_chunk_index c
        JOIN memory_document_current d
          ON d.domain = c.domain
         AND d.canonical_path = c.canonical_path
        WHERE ${whereClauses.join(" AND ")}
        ORDER BY c.updated_at DESC
        LIMIT $${params.length}
      `,
      params,
    )

    if (candidates.rows.length === 0) {
      return {
        mode,
        fallbackUsed: mode !== "lexical",
        results: [],
      }
    }

    const queryTokens = tokenizeRagText(query)
    const queryLower = query.toLowerCase()
    let queryEmbedding: number[] | null = null
    let fallbackUsed = false

    if (mode === "hybrid") {
      const embeddingModel = process.env.DATA_CORE_EMBEDDING_MODEL?.trim() || "text-embedding-3-small"
      const embedded = await embedTextsWithOpenAi([query], embeddingModel)
      if (embedded && embedded.length > 0) {
        queryEmbedding = embedded[0]
      } else {
        fallbackUsed = true
      }
    }

    const ranked = candidates.rows
      .map((row) => {
        const lexical = lexicalScore(queryTokens, row.normalized_content)
        const semantic = queryEmbedding
          ? Math.max(0, cosineSimilarity(queryEmbedding, parseEmbedding(row.embedding) || []))
          : 0
        const titlePath = titlePathBonus(queryLower, row.canonical_path, row.title)

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

    const grouped = new Map<string, {
      domain: string
      canonicalPath: string
      title: string
      excerpt: string
      score: number
      citations: Array<{
        id: string
        canonicalPath: string
        excerpt: string
        score: number
        lexicalScore: number
        semanticScore: number
      }>
    }>()

    for (const entry of ranked.slice(0, k * 3)) {
      const key = `${entry.row.domain}:${entry.row.canonical_path}`
      const citation = {
        id: `S${(grouped.get(key)?.citations.length || 0) + 1}`,
        canonicalPath: entry.row.canonical_path,
        excerpt: excerptAround(entry.row.content, query),
        score: Number(entry.score.toFixed(4)),
        lexicalScore: Number(entry.lexical.toFixed(4)),
        semanticScore: Number(entry.semantic.toFixed(4)),
      }

      const existing = grouped.get(key)
      if (!existing) {
        grouped.set(key, {
          domain: entry.row.domain,
          canonicalPath: entry.row.canonical_path,
          title: entry.row.title,
          excerpt: citation.excerpt,
          score: citation.score,
          citations: [citation],
        })
        continue
      }

      existing.citations.push(citation)
      if (citation.score > existing.score) {
        existing.score = citation.score
        existing.excerpt = citation.excerpt
      }
    }

    const results = [...grouped.values()].sort((a, b) => b.score - a.score).slice(0, k)

    return {
      mode: queryEmbedding ? "hybrid" : "lexical",
      fallbackUsed,
      results,
    }
  }

  async graph(args: {
    domain?: string
    prefix?: string
    includeUnresolved?: boolean
  }): Promise<{
    nodes: Array<{
      id: string
      nodeType: "note" | "ghost"
      canonicalPath: string
      label: string
    }>
    edges: Array<{
      id: string
      edgeType: "resolved" | "unresolved"
      kind: "wiki" | "markdown"
      source: string
      target: string
      sourceCanonicalPath: string
      targetCanonicalPath: string
    }>
    stats: {
      noteCount: number
      ghostCount: number
      edgeCount: number
      unresolvedEdgeCount: number
    }
  }> {
    const includeUnresolved = args.includeUnresolved ?? true
    const where: string[] = ["deleted_at IS NULL"]
    const params: unknown[] = []

    if (args.domain) {
      params.push(args.domain)
      where.push(`domain = $${params.length}`)
    }
    if (args.prefix) {
      params.push(`${args.prefix}%`)
      where.push(`canonical_path LIKE $${params.length}`)
    }

    const docs = await this.db.query<{ domain: string; canonical_path: string; title: string; content_markdown: string }>(
      `
        SELECT domain, canonical_path, title, content_markdown
        FROM memory_document_current
        WHERE ${where.join(" AND ")}
        ORDER BY canonical_path ASC
      `,
      params,
    )

    const paths = new Set(docs.rows.map((doc) => doc.canonical_path))

    const nodes: Array<{
      id: string
      nodeType: "note" | "ghost"
      canonicalPath: string
      label: string
    }> = docs.rows.map((doc) => ({
      id: `note:${doc.canonical_path}`,
      nodeType: "note",
      canonicalPath: doc.canonical_path,
      label: doc.title,
    }))

    const edges: Array<{
      id: string
      edgeType: "resolved" | "unresolved"
      kind: "wiki" | "markdown"
      source: string
      target: string
      sourceCanonicalPath: string
      targetCanonicalPath: string
    }> = []
    const ghostNodes = new Map<string, { id: string; nodeType: "ghost"; canonicalPath: string; label: string }>()
    const dedupe = new Set<string>()

    for (const doc of docs.rows) {
      const sourceId = `note:${doc.canonical_path}`
      for (const link of extractLinks(doc.content_markdown)) {
        const resolved = resolveLinkPath({
          sourceCanonicalPath: doc.canonical_path,
          target: link.target,
          allCanonicalPaths: paths,
        })

        if (resolved) {
          const edgeKey = `resolved:${link.kind}:${doc.canonical_path}->${resolved}`
          if (dedupe.has(edgeKey)) continue
          dedupe.add(edgeKey)

          edges.push({
            id: `resolved:${Buffer.from(edgeKey).toString("base64url")}`,
            edgeType: "resolved",
            kind: link.kind,
            source: sourceId,
            target: `note:${resolved}`,
            sourceCanonicalPath: doc.canonical_path,
            targetCanonicalPath: resolved,
          })
          continue
        }

        if (!includeUnresolved) {
          continue
        }

        const normalizedTarget = link.target.trim().replaceAll("\\", "/")
        if (!normalizedTarget) continue

        const ghostId = `ghost:${Buffer.from(normalizedTarget.toLowerCase()).toString("base64url")}`
        if (!ghostNodes.has(ghostId)) {
          ghostNodes.set(ghostId, {
            id: ghostId,
            nodeType: "ghost",
            canonicalPath: normalizedTarget,
            label: normalizedTarget.split("/").at(-1)?.replace(/\.md$/iu, "") || normalizedTarget,
          })
        }

        const edgeKey = `unresolved:${link.kind}:${doc.canonical_path}->${normalizedTarget}`
        if (dedupe.has(edgeKey)) continue
        dedupe.add(edgeKey)

        edges.push({
          id: `unresolved:${Buffer.from(edgeKey).toString("base64url")}`,
          edgeType: "unresolved",
          kind: link.kind,
          source: sourceId,
          target: ghostId,
          sourceCanonicalPath: doc.canonical_path,
          targetCanonicalPath: normalizedTarget,
        })
      }
    }

    const finalNodes = [...nodes, ...ghostNodes.values()]

    return {
      nodes: finalNodes,
      edges,
      stats: {
        noteCount: nodes.length,
        ghostCount: ghostNodes.size,
        edgeCount: edges.length,
        unresolvedEdgeCount: edges.filter((edge) => edge.edgeType === "unresolved").length,
      },
    }
  }

  async listSyncEvents(args: {
    afterCursor: number
    limit: number
  }): Promise<{
    events: EventRow[]
    nextCursor: number
  }> {
    const limit = Math.max(1, Math.min(this.config.maxSyncBatch, args.limit))

    const rows = await this.db.query<EventRow>(
      `
        SELECT
          id,
          cursor,
          source_core_id,
          source_seq,
          idempotency_key,
          operation,
          domain,
          canonical_path,
          content_markdown,
          metadata,
          writer_type,
          writer_id,
          signature,
          payload_hash,
          occurred_at,
          ingested_at,
          deleted,
          supersedes_event_id,
          status
        FROM memory_event_log
        WHERE cursor > $1
        ORDER BY cursor ASC
        LIMIT $2
      `,
      [args.afterCursor, limit],
    )

    const nextCursor = rows.rows.length > 0 ? rows.rows.at(-1)?.cursor || args.afterCursor : args.afterCursor

    return {
      events: rows.rows,
      nextCursor,
    }
  }

  async processPendingMergeJobs(maxJobs = 10): Promise<{ processed: number; completed: number; failed: number }> {
    const jobs = await this.db.query<{
      id: string
      domain: string
      canonical_path: string
      base_event_id: string | null
      incoming_event_id: string
      status: string
    }>(
      `
        SELECT id, domain, canonical_path, base_event_id, incoming_event_id, status
        FROM memory_merge_job
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT $1
      `,
      [Math.max(1, Math.min(100, maxJobs))],
    )

    let completed = 0
    let failed = 0

    for (const job of jobs.rows) {
      try {
        const doc = await this.db.query<DocumentRow>(
          `
            SELECT domain, canonical_path, title, content_markdown, metadata, latest_event_id, updated_at, deleted_at
            FROM memory_document_current
            WHERE domain = $1 AND canonical_path = $2
            LIMIT 1
          `,
          [job.domain, job.canonical_path],
        )

        const incomingEventResult = await this.db.query<EventRow>(
          `
            SELECT
              id,
              cursor,
              source_core_id,
              source_seq,
              idempotency_key,
              operation,
              domain,
              canonical_path,
              content_markdown,
              metadata,
              writer_type,
              writer_id,
              signature,
              payload_hash,
              occurred_at,
              ingested_at,
              deleted,
              supersedes_event_id,
              status
            FROM memory_event_log
            WHERE id = $1
            LIMIT 1
          `,
          [job.incoming_event_id],
        )

        const incomingEvent = incomingEventResult.rows[0]
        const current = doc.rows[0]
        if (!incomingEvent || !current) {
          throw new Error("Missing merge context")
        }

        const mergedContent = deterministicMerge({
          canonicalPath: job.canonical_path,
          currentContent: current.content_markdown,
          incomingContent: incomingEvent.content_markdown || "",
        })

        const mergeEnvelope: MemoryWriteEnvelope = {
          operation: "merge",
          domain: job.domain as MemoryWriteEnvelope["domain"],
          canonicalPath: job.canonical_path,
          contentMarkdown: mergedContent,
          metadata: {
            tags: ["merge", "quartermaster"],
            citations: [],
            source: "system",
            writerType: "system",
            writerId: "QTM-LGR:fleet",
          },
          event: {
            sourceCoreId: this.config.coreId,
            sourceSeq: Date.now() * 1000 + Math.floor(Math.random() * 1000),
            occurredAt: new Date().toISOString(),
            idempotencyKey: `merge:${job.id}`,
          },
          signature: {
            chain: "cardano",
            alg: "cip8-ed25519",
            keyRef: "system:qtm-lgr-fleet",
            address: "system:qtm-lgr-fleet",
            signature: "internal-merge-signature",
            payloadHash: "",
            signedAt: new Date().toISOString(),
          },
        }

        mergeEnvelope.signature.payloadHash = canonicalPayloadHash(mergeEnvelope)

        const applied = await this.applyWriteEnvelope({
          envelope: mergeEnvelope,
          skipSignatureCheck: true,
        })

        await this.db.query(
          `
            UPDATE memory_merge_job
            SET status = 'completed', merged_event_id = $2, updated_at = now()
            WHERE id = $1
          `,
          [job.id, applied.eventId],
        )

        completed += 1
      } catch (error) {
        await this.db.query(
          `
            UPDATE memory_merge_job
            SET status = 'failed', error = $2, updated_at = now()
            WHERE id = $1
          `,
          [job.id, error instanceof Error ? error.message : "Merge failure"],
        ).catch(() => {})
        failed += 1
      }
    }

    return {
      processed: jobs.rows.length,
      completed,
      failed,
    }
  }
}
