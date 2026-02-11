import crypto from "node:crypto"
import type { DataCoreConfig } from "../config.js"
import type { DataCoreDb } from "../db.js"
import { canonicalTitleFromPath } from "../util.js"
import type {
  DataCoreHybridQueryResponse,
  DataCorePlugin,
  DataCorePluginDrainResult,
  DataCorePluginWriteSyncInput,
  DataCoreQueryResult,
} from "./types.js"

const EDGEQUAKE_DOMAIN_SET = new Set(["orchwiz", "ship", "agent-public"])
const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000002"

interface EdgeQuakeSyncJobRow {
  id: string
  event_id: string
  operation: "upsert" | "delete" | "move" | "merge"
  domain: string
  canonical_path: string
  from_canonical_path: string | null
  content_markdown: string | null
  attempt_count: number
}

interface EdgeQuakeWorkspaceRow {
  workspace_id: string
  workspace_slug: string
}

interface EdgeQuakeDocumentRow {
  domain: string
  canonical_path: string
  document_id: string
}

interface EdgeQuakeSource {
  source_type?: unknown
  id?: unknown
  score?: unknown
  rerank_score?: unknown
  snippet?: unknown
  document_id?: unknown
  file_path?: unknown
}

interface EdgeQuakeDocumentMapping {
  domain: string
  canonicalPath: string
  documentId: string
}

interface EdgeQuakeWorkspace {
  id: string
  slug: string
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed || null
}

function asNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  return value
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)))
}

function normalizeSlugSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+/u, "")
    .replace(/-+$/u, "")
    .replace(/-{2,}/gu, "-")
}

export function edgeQuakeWorkspaceSlug(args: { clusterId: string; domain: string }): string {
  const cluster = normalizeSlugSegment(args.clusterId) || "cluster"
  const domain = normalizeSlugSegment(args.domain) || "domain"
  return `data-core-${cluster}-${domain}`.slice(0, 120)
}

export function computeRetryBackoffMs(attempt: number): number {
  const exp = Math.max(1, Math.min(10, attempt))
  return Math.min(60 * 60 * 1000, 1000 * (2 ** exp))
}

export function isStaleSyncJob(args: {
  operation: "upsert" | "delete" | "move" | "merge"
  eventId: string
  latestEventId: string | null
}): boolean {
  if (args.latestEventId) {
    return args.latestEventId !== args.eventId
  }
  return args.operation !== "delete"
}

function edgeQuakeScore(source: EdgeQuakeSource): number {
  const rerank = asNumber(source.rerank_score)
  if (rerank !== null) return rerank
  const score = asNumber(source.score)
  return score !== null ? score : 0
}

export function mapEdgeQuakeSources(args: {
  sources: EdgeQuakeSource[]
  mappings: EdgeQuakeDocumentMapping[]
  query: string
  prefix?: string
  k: number
}): DataCoreQueryResult[] {
  const byDocumentId = new Map<string, EdgeQuakeDocumentMapping>()
  for (const mapping of args.mappings) {
    byDocumentId.set(mapping.documentId, mapping)
  }

  const grouped = new Map<string, DataCoreQueryResult>()

  for (const source of args.sources) {
    const documentId = asString(source.document_id)
    if (!documentId) continue
    const mapping = byDocumentId.get(documentId)
    if (!mapping) continue

    if (args.prefix && !mapping.canonicalPath.startsWith(args.prefix)) {
      continue
    }

    const score = edgeQuakeScore(source)
    if (score <= 0) {
      continue
    }

    const key = `${mapping.domain}:${mapping.canonicalPath}`
    const existing = grouped.get(key)
    const snippet = asString(source.snippet) || args.query
    const citation = {
      id: "S1",
      canonicalPath: mapping.canonicalPath,
      excerpt: snippet,
      score: Number(score.toFixed(4)),
      lexicalScore: Number(score.toFixed(4)),
      semanticScore: Number(score.toFixed(4)),
    }

    if (!existing) {
      grouped.set(key, {
        domain: mapping.domain,
        canonicalPath: mapping.canonicalPath,
        title: canonicalTitleFromPath(mapping.canonicalPath),
        excerpt: citation.excerpt,
        score: citation.score,
        citations: [citation],
      })
      continue
    }

    existing.citations.push({
      ...citation,
      id: `S${existing.citations.length + 1}`,
    })
    if (citation.score > existing.score) {
      existing.score = citation.score
      existing.excerpt = citation.excerpt
    }
  }

  const k = clampInt(args.k || 12, 1, 100)
  const results = [...grouped.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, k)
    .map((result) => ({
      ...result,
      citations: [...result.citations]
        .sort((left, right) => right.score - left.score)
        .map((citation, index) => ({
          ...citation,
          id: `S${index + 1}`,
        })),
    }))

  return results
}

export class EdgeQuakePlugin implements DataCorePlugin {
  constructor(
    private readonly db: DataCoreDb,
    private readonly config: DataCoreConfig,
  ) {
    if (!config.edgequake.enabled) {
      throw new Error("EdgeQuake plugin cannot be initialized when disabled")
    }
    if (!config.edgequake.baseUrl) {
      throw new Error("EdgeQuake plugin requires a base URL")
    }
  }

  private get baseUrl(): string {
    if (!this.config.edgequake.baseUrl) {
      throw new Error("EdgeQuake base URL is not configured")
    }
    return this.config.edgequake.baseUrl
  }

  private get tenantId(): string {
    return this.config.edgequake.tenantId || DEFAULT_TENANT_ID
  }

  private buildHeaders(args: { workspaceId?: string; includeJsonContentType?: boolean } = {}): Record<string, string> {
    const headers: Record<string, string> = {}
    if (args.includeJsonContentType !== false) {
      headers["Content-Type"] = "application/json"
    }

    headers["X-Tenant-ID"] = this.tenantId
    if (args.workspaceId) {
      headers["X-Workspace-ID"] = args.workspaceId
    }

    if (this.config.edgequake.apiKey) {
      headers["X-API-Key"] = this.config.edgequake.apiKey
    }
    if (this.config.edgequake.bearerToken) {
      headers.Authorization = `Bearer ${this.config.edgequake.bearerToken}`
    }

    return headers
  }

  private async request(args: {
    path: string
    method?: "GET" | "POST" | "DELETE"
    workspaceId?: string
    body?: unknown
    allowNotFound?: boolean
  }): Promise<{ status: number; payload: unknown }> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.config.edgequake.timeoutMs)
    const urlPath = args.path.startsWith("/") ? args.path : `/${args.path}`

    try {
      const response = await fetch(`${this.baseUrl}${urlPath}`, {
        method: args.method || "GET",
        headers: this.buildHeaders({
          workspaceId: args.workspaceId,
          includeJsonContentType: args.body !== undefined,
        }),
        ...(args.body === undefined ? {} : { body: JSON.stringify(args.body) }),
        signal: controller.signal,
      })

      const text = await response.text().catch(() => "")
      const payload = text ? JSON.parse(text) as unknown : null

      if (!response.ok) {
        if (args.allowNotFound && response.status === 404) {
          return { status: response.status, payload }
        }
        const details = asString(asRecord(payload).detail) || asString(asRecord(payload).error) || text || "Unknown error"
        throw new Error(`EdgeQuake request failed (${response.status}) ${urlPath}: ${details}`)
      }

      return {
        status: response.status,
        payload,
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`EdgeQuake request timed out after ${this.config.edgequake.timeoutMs}ms: ${urlPath}`)
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }

  private async getWorkspaceForDomain(domain: string): Promise<EdgeQuakeWorkspace> {
    if (!EDGEQUAKE_DOMAIN_SET.has(domain)) {
      throw new Error(`Unsupported domain for EdgeQuake workspace mapping: ${domain}`)
    }

    const local = await this.db.query<EdgeQuakeWorkspaceRow>(
      `
        SELECT workspace_id, workspace_slug
        FROM memory_plugin_edgequake_workspace
        WHERE cluster_id = $1 AND domain = $2
        LIMIT 1
      `,
      [this.config.clusterId, domain],
    )
    if (local.rows[0]) {
      return {
        id: local.rows[0].workspace_id,
        slug: local.rows[0].workspace_slug,
      }
    }

    const workspaceSlug = edgeQuakeWorkspaceSlug({
      clusterId: this.config.clusterId,
      domain,
    })

    const listResponse = await this.request({
      path: `/api/v1/tenants/${encodeURIComponent(this.tenantId)}/workspaces`,
      method: "GET",
    })

    const workspaceItems = asArray(asRecord(listResponse.payload).items)
    let workspaceId: string | null = null
    for (const raw of workspaceItems) {
      const record = asRecord(raw)
      if (asString(record.slug) !== workspaceSlug) {
        continue
      }
      workspaceId = asString(record.id)
      if (workspaceId) {
        break
      }
    }

    if (!workspaceId) {
      const createResponse = await this.request({
        path: `/api/v1/tenants/${encodeURIComponent(this.tenantId)}/workspaces`,
        method: "POST",
        body: {
          name: `Data Core ${this.config.clusterId} ${domain}`,
          slug: workspaceSlug,
          description: `Data-core plugin workspace for ${domain} (${this.config.clusterId})`,
        },
      })

      const created = asRecord(createResponse.payload)
      workspaceId = asString(created.id)
      if (!workspaceId) {
        throw new Error(`EdgeQuake workspace creation did not return an id for domain ${domain}`)
      }
    }

    await this.db.query(
      `
        INSERT INTO memory_plugin_edgequake_workspace (
          id,
          cluster_id,
          domain,
          workspace_id,
          workspace_slug,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, now(), now())
        ON CONFLICT (cluster_id, domain)
        DO UPDATE SET
          workspace_id = EXCLUDED.workspace_id,
          workspace_slug = EXCLUDED.workspace_slug,
          updated_at = now()
      `,
      [crypto.randomUUID(), this.config.clusterId, domain, workspaceId, workspaceSlug],
    )

    return {
      id: workspaceId,
      slug: workspaceSlug,
    }
  }

  private async loadDocumentMappings(workspaceId: string, documentIds: string[]): Promise<EdgeQuakeDocumentMapping[]> {
    if (documentIds.length === 0) return []

    const rows = await this.db.query<EdgeQuakeDocumentRow>(
      `
        SELECT domain, canonical_path, document_id
        FROM memory_plugin_edgequake_document
        WHERE workspace_id = $1
          AND document_id = ANY($2::text[])
      `,
      [workspaceId, documentIds],
    )

    return rows.rows.map((row) => ({
      domain: row.domain,
      canonicalPath: row.canonical_path,
      documentId: row.document_id,
    }))
  }

  private async syncUpsert(args: {
    eventId: string
    domain: string
    canonicalPath: string
    contentMarkdown: string
  }): Promise<void> {
    const workspace = await this.getWorkspaceForDomain(args.domain)
    const response = await this.request({
      path: "/api/v1/documents",
      method: "POST",
      workspaceId: workspace.id,
      body: {
        content: args.contentMarkdown,
        title: canonicalTitleFromPath(args.canonicalPath),
        async_processing: false,
        metadata: {
          source: "data-core-edgequake-plugin",
          cluster_id: this.config.clusterId,
          domain: args.domain,
          canonical_path: args.canonicalPath,
        },
      },
    })

    const payload = asRecord(response.payload)
    const documentId = asString(payload.document_id)
      || asString(payload.id)
      || asString(payload.duplicate_of)

    if (!documentId) {
      throw new Error(`EdgeQuake upsert did not return a document id for ${args.canonicalPath}`)
    }

    await this.db.query(
      `
        DELETE FROM memory_plugin_edgequake_document
        WHERE workspace_id = $1
          AND document_id = $2
          AND NOT (domain = $3 AND canonical_path = $4)
      `,
      [workspace.id, documentId, args.domain, args.canonicalPath],
    )

    await this.db.query(
      `
        INSERT INTO memory_plugin_edgequake_document (
          id,
          domain,
          canonical_path,
          workspace_id,
          document_id,
          last_event_id,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, now(), now())
        ON CONFLICT (domain, canonical_path)
        DO UPDATE SET
          workspace_id = EXCLUDED.workspace_id,
          document_id = EXCLUDED.document_id,
          last_event_id = EXCLUDED.last_event_id,
          updated_at = now()
      `,
      [crypto.randomUUID(), args.domain, args.canonicalPath, workspace.id, documentId, args.eventId],
    )
  }

  private async syncDelete(args: { domain: string; canonicalPath: string }): Promise<void> {
    const mapping = await this.db.query<{ workspace_id: string; document_id: string }>(
      `
        SELECT workspace_id, document_id
        FROM memory_plugin_edgequake_document
        WHERE domain = $1 AND canonical_path = $2
        LIMIT 1
      `,
      [args.domain, args.canonicalPath],
    )

    const row = mapping.rows[0]
    if (row) {
      await this.request({
        path: `/api/v1/documents/${encodeURIComponent(row.document_id)}`,
        method: "DELETE",
        workspaceId: row.workspace_id,
        allowNotFound: true,
      })
    }

    await this.db.query(
      `
        DELETE FROM memory_plugin_edgequake_document
        WHERE domain = $1 AND canonical_path = $2
      `,
      [args.domain, args.canonicalPath],
    )
  }

  private async resolveSyncContent(job: EdgeQuakeSyncJobRow): Promise<string> {
    if (job.content_markdown !== null) {
      return job.content_markdown
    }

    const current = await this.db.query<{ content_markdown: string }>(
      `
        SELECT content_markdown
        FROM memory_document_current
        WHERE domain = $1 AND canonical_path = $2
        LIMIT 1
      `,
      [job.domain, job.canonical_path],
    )

    return current.rows[0]?.content_markdown || ""
  }

  async enqueueWriteSync(input: DataCorePluginWriteSyncInput): Promise<void> {
    await this.db.query(
      `
        INSERT INTO memory_plugin_edgequake_sync_job (
          id,
          event_id,
          operation,
          domain,
          canonical_path,
          from_canonical_path,
          content_markdown,
          status,
          attempt_count,
          next_attempt_at,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', 0, now(), now(), now())
        ON CONFLICT (event_id) DO NOTHING
      `,
      [
        crypto.randomUUID(),
        input.eventId,
        input.operation,
        input.domain,
        input.canonicalPath,
        input.fromCanonicalPath || null,
        input.contentMarkdown ?? null,
      ],
    )
  }

  private async completeJob(jobId: string, attemptCount: number): Promise<void> {
    await this.db.query(
      `
        UPDATE memory_plugin_edgequake_sync_job
        SET status = 'completed',
            attempt_count = $2,
            last_error = NULL,
            updated_at = now()
        WHERE id = $1
      `,
      [jobId, attemptCount],
    )
  }

  private async skipJob(jobId: string, attemptCount: number, reason: string): Promise<void> {
    await this.db.query(
      `
        UPDATE memory_plugin_edgequake_sync_job
        SET status = 'skipped',
            attempt_count = $2,
            last_error = $3,
            updated_at = now()
        WHERE id = $1
      `,
      [jobId, attemptCount, reason],
    )
  }

  private async failOrRetryJob(args: {
    job: EdgeQuakeSyncJobRow
    errorMessage: string
  }): Promise<"retrying" | "failed"> {
    const attemptCount = args.job.attempt_count + 1
    const shouldFail = attemptCount >= this.config.edgequake.maxRetries
    const status = shouldFail ? "failed" : "retrying"
    const backoffMs = computeRetryBackoffMs(attemptCount)
    const nextAttemptAt = shouldFail ? new Date() : new Date(Date.now() + backoffMs)

    await this.db.query(
      `
        UPDATE memory_plugin_edgequake_sync_job
        SET status = $2,
            attempt_count = $3,
            next_attempt_at = $4,
            last_error = $5,
            updated_at = now()
        WHERE id = $1
      `,
      [args.job.id, status, attemptCount, nextAttemptAt.toISOString(), args.errorMessage.slice(0, 900)],
    )

    return status
  }

  private async processSyncJob(job: EdgeQuakeSyncJobRow): Promise<"completed" | "skipped" | "failed"> {
    const latest = await this.db.query<{ latest_event_id: string }>(
      `
        SELECT latest_event_id
        FROM memory_document_current
        WHERE domain = $1 AND canonical_path = $2
        LIMIT 1
      `,
      [job.domain, job.canonical_path],
    )

    const stale = isStaleSyncJob({
      operation: job.operation,
      eventId: job.event_id,
      latestEventId: latest.rows[0]?.latest_event_id || null,
    })
    if (stale) {
      await this.skipJob(job.id, job.attempt_count + 1, "Skipped stale plugin sync job")
      return "skipped"
    }

    try {
      if (job.operation === "delete") {
        await this.syncDelete({
          domain: job.domain,
          canonicalPath: job.canonical_path,
        })
      } else if (job.operation === "move") {
        if (job.from_canonical_path) {
          await this.syncDelete({
            domain: job.domain,
            canonicalPath: job.from_canonical_path,
          })
        }
        await this.syncUpsert({
          eventId: job.event_id,
          domain: job.domain,
          canonicalPath: job.canonical_path,
          contentMarkdown: await this.resolveSyncContent(job),
        })
      } else {
        await this.syncUpsert({
          eventId: job.event_id,
          domain: job.domain,
          canonicalPath: job.canonical_path,
          contentMarkdown: await this.resolveSyncContent(job),
        })
      }

      await this.completeJob(job.id, job.attempt_count + 1)
      return "completed"
    } catch (error) {
      const retryState = await this.failOrRetryJob({
        job,
        errorMessage: error instanceof Error ? error.message : "Unknown EdgeQuake sync error",
      })
      return retryState === "failed" ? "failed" : "failed"
    }
  }

  async drainPending(args?: { limit?: number }): Promise<DataCorePluginDrainResult> {
    const limit = clampInt(args?.limit || this.config.edgequake.drainBatch, 1, Math.max(1, this.config.edgequake.drainBatch))

    const jobs = await this.db.query<EdgeQuakeSyncJobRow>(
      `
        SELECT
          id,
          event_id,
          operation,
          domain,
          canonical_path,
          from_canonical_path,
          content_markdown,
          attempt_count
        FROM memory_plugin_edgequake_sync_job
        WHERE status IN ('pending', 'retrying')
          AND next_attempt_at <= now()
        ORDER BY next_attempt_at ASC, created_at ASC
        LIMIT $1
      `,
      [limit],
    )

    const summary: DataCorePluginDrainResult = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
    }

    for (const job of jobs.rows) {
      summary.processed += 1
      const status = await this.processSyncJob(job)
      if (status === "completed") {
        summary.succeeded += 1
      } else if (status === "skipped") {
        summary.skipped += 1
      } else {
        summary.failed += 1
      }
    }

    return summary
  }

  async queryHybrid(args: {
    query: string
    domain?: string
    prefix?: string
    k: number
  }): Promise<DataCoreHybridQueryResponse> {
    const query = args.query.trim()
    const k = clampInt(args.k || this.config.queryTopKDefault, 1, 100)
    if (!query) {
      return {
        mode: "hybrid",
        fallbackUsed: false,
        results: [],
      }
    }

    const requestedDomains = args.domain
      ? [args.domain]
      : ["orchwiz", "ship", "agent-public"]

    const allResults: DataCoreQueryResult[] = []

    for (const domain of requestedDomains) {
      if (!EDGEQUAKE_DOMAIN_SET.has(domain)) {
        continue
      }

      const workspace = await this.getWorkspaceForDomain(domain)
      const queryResponse = await this.request({
        path: "/api/v1/query",
        method: "POST",
        workspaceId: workspace.id,
        body: {
          query,
          mode: "hybrid",
          context_only: true,
          include_references: true,
          max_results: Math.max(k * 4, 20),
          enable_rerank: true,
        },
      })

      const payload = asRecord(queryResponse.payload)
      const sources = asArray(payload.sources).map((entry) => asRecord(entry)) as EdgeQuakeSource[]
      if (sources.length === 0) {
        continue
      }

      const documentIds = [...new Set(
        sources
          .map((source) => asString(source.document_id))
          .filter((value): value is string => Boolean(value)),
      )]

      const mappings = await this.loadDocumentMappings(workspace.id, documentIds)
      if (mappings.length === 0) {
        continue
      }

      allResults.push(...mapEdgeQuakeSources({
        sources,
        mappings,
        query,
        prefix: args.prefix,
        k: Math.max(k * 3, 20),
      }))
    }

    return {
      mode: "hybrid",
      fallbackUsed: false,
      results: allResults
        .sort((left, right) => right.score - left.score)
        .slice(0, k),
    }
  }
}
