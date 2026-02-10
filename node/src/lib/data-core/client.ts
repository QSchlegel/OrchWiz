import crypto from "node:crypto"
import { dataCoreApiKey, dataCoreBaseUrl, dataCoreCoreId } from "./config"
import type { DataCoreDomain, DataCoreWriteEnvelope, DataCoreWriteMetadata, DataCoreEventMeta, DataCoreSignatureEnvelope, DataCoreMemoryFileResponse, DataCoreMemoryQueryResult } from "./types"
import { getOrProvisionUserMemorySigner } from "./user-signer"
import { signMessagePayload } from "@/lib/wallet-enclave/client"

interface WriterIdentity {
  writerType: "agent" | "user" | "system"
  writerId: string
  keyRef: string
  address: string
  key?: string
  source: "agent" | "user" | "system"
}

interface RequestOptions {
  method?: string
  body?: unknown
}

let seqBase = 0
let seqCounter = 0

function nextSourceSeq(): number {
  const nowBase = Date.now() * 1000
  if (nowBase === seqBase) {
    seqCounter += 1
  } else {
    seqBase = nowBase
    seqCounter = 0
  }

  return nowBase + seqCounter
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`
  }

  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort((a, b) => a.localeCompare(b))
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`
}

function signingPayloadFromEnvelope(args: {
  operation: DataCoreWriteEnvelope["operation"]
  domain: DataCoreDomain
  canonicalPath: string
  contentMarkdown?: string
  metadata: DataCoreWriteMetadata
  event: DataCoreEventMeta
}): string {
  return stableStringify({
    operation: args.operation,
    domain: args.domain,
    canonicalPath: args.canonicalPath,
    contentMarkdown: args.contentMarkdown || "",
    metadata: args.metadata,
    event: args.event,
  })
}

export class DataCoreClient {
  private readonly baseUrl: string
  private readonly apiKey: string | null
  private readonly sourceCoreId: string

  constructor() {
    this.baseUrl = dataCoreBaseUrl()
    this.apiKey = dataCoreApiKey()
    this.sourceCoreId = dataCoreCoreId()
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }

    if (this.apiKey) {
      headers["x-data-core-api-key"] = this.apiKey
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method || "GET",
      headers,
      ...(options.body === undefined
        ? {}
        : {
            body: JSON.stringify(options.body),
          }),
    })

    const payload = (await response.json().catch(() => null)) as T | { error?: string } | null
    if (!response.ok) {
      const message = payload && typeof payload === "object" && "error" in payload
        ? (payload.error || `Data-core request failed (${response.status})`)
        : `Data-core request failed (${response.status})`
      throw new Error(message)
    }

    return payload as T
  }

  async upsertSigner(input: {
    writerType: "agent" | "user" | "system"
    writerId: string
    keyRef: string
    address: string
    key?: string
    metadata?: Record<string, unknown>
  }): Promise<void> {
    await this.request<{ signer: unknown }>("/v1/signer/upsert", {
      method: "POST",
      body: input,
    })
  }

  async getSigner(writerType: "agent" | "user" | "system", writerId: string): Promise<Record<string, unknown> | null> {
    try {
      const response = await this.request<{ signer: Record<string, unknown> }>(`/v1/signer/${writerType}/${encodeURIComponent(writerId)}`)
      return response.signer
    } catch {
      return null
    }
  }

  private async resolveWriterIdentity(args: {
    userId?: string
    writer?: WriterIdentity
  }): Promise<WriterIdentity> {
    if (args.writer) {
      return args.writer
    }

    if (!args.userId) {
      throw new Error("userId is required for data-core write operations")
    }

    const signer = await getOrProvisionUserMemorySigner(args.userId)
    return {
      writerType: "user",
      writerId: args.userId,
      keyRef: signer.keyRef,
      address: signer.address,
      key: signer.key || undefined,
      source: "user",
    }
  }

  private async signEnvelope(args: {
    operation: DataCoreWriteEnvelope["operation"]
    domain: DataCoreDomain
    canonicalPath: string
    contentMarkdown?: string
    metadata: Omit<DataCoreWriteMetadata, "source" | "writerType" | "writerId"> & {
      fromCanonicalPath?: string
    }
    writer: WriterIdentity
    idempotencyKey?: string
  }): Promise<DataCoreWriteEnvelope> {
    const event: DataCoreEventMeta = {
      sourceCoreId: this.sourceCoreId,
      sourceSeq: nextSourceSeq(),
      occurredAt: new Date().toISOString(),
      idempotencyKey: args.idempotencyKey || crypto.randomUUID(),
    }

    const writeMetadata: DataCoreWriteMetadata = {
      ...args.metadata,
      source: args.writer.source,
      writerType: args.writer.writerType,
      writerId: args.writer.writerId,
    }

    const payload = signingPayloadFromEnvelope({
      operation: args.operation,
      domain: args.domain,
      canonicalPath: args.canonicalPath,
      contentMarkdown: args.contentMarkdown,
      metadata: writeMetadata,
      event,
    })

    const signed = await signMessagePayload({
      keyRef: args.writer.keyRef,
      address: args.writer.address,
      payload,
      idempotencyKey: `${event.idempotencyKey}:sign`,
    })

    const signature: DataCoreSignatureEnvelope = {
      chain: "cardano",
      alg: signed.alg,
      keyRef: signed.keyRef,
      address: signed.address,
      key: signed.key,
      signature: signed.signature,
      payloadHash: signed.payloadHash,
      signedAt: event.occurredAt,
    }

    await this.upsertSigner({
      writerType: args.writer.writerType,
      writerId: args.writer.writerId,
      keyRef: args.writer.keyRef,
      address: args.writer.address,
      key: args.writer.key,
      metadata: {
        source: args.writer.source,
      },
    })

    return {
      operation: args.operation,
      domain: args.domain,
      canonicalPath: args.canonicalPath,
      ...(args.contentMarkdown === undefined ? {} : { contentMarkdown: args.contentMarkdown }),
      metadata: writeMetadata,
      event,
      signature,
    }
  }

  async upsertMemory(args: {
    domain: DataCoreDomain
    canonicalPath: string
    contentMarkdown: string
    userId?: string
    writer?: WriterIdentity
    tags?: string[]
    citations?: string[]
    idempotencyKey?: string
  }): Promise<{ eventId: string; duplicate: boolean; mergeQueued: boolean }> {
    const writer = await this.resolveWriterIdentity({
      userId: args.userId,
      writer: args.writer,
    })

    const envelope = await this.signEnvelope({
      operation: "upsert",
      domain: args.domain,
      canonicalPath: args.canonicalPath,
      contentMarkdown: args.contentMarkdown,
      metadata: {
        tags: args.tags,
        citations: args.citations,
      },
      writer,
      idempotencyKey: args.idempotencyKey,
    })

    return this.request<{ eventId: string; duplicate: boolean; mergeQueued: boolean }>("/v1/memory/upsert", {
      method: "POST",
      body: envelope,
    })
  }

  async deleteMemory(args: {
    domain: DataCoreDomain
    canonicalPath: string
    userId?: string
    writer?: WriterIdentity
    tags?: string[]
    citations?: string[]
    idempotencyKey?: string
  }): Promise<{ eventId: string; duplicate: boolean; mergeQueued: boolean }> {
    const writer = await this.resolveWriterIdentity({
      userId: args.userId,
      writer: args.writer,
    })

    const envelope = await this.signEnvelope({
      operation: "delete",
      domain: args.domain,
      canonicalPath: args.canonicalPath,
      metadata: {
        tags: args.tags,
        citations: args.citations,
      },
      writer,
      idempotencyKey: args.idempotencyKey,
    })

    return this.request<{ eventId: string; duplicate: boolean; mergeQueued: boolean }>("/v1/memory/delete", {
      method: "POST",
      body: envelope,
    })
  }

  async moveMemory(args: {
    domain: DataCoreDomain
    fromCanonicalPath: string
    canonicalPath: string
    contentMarkdown?: string
    userId?: string
    writer?: WriterIdentity
    tags?: string[]
    citations?: string[]
    idempotencyKey?: string
  }): Promise<{ eventId: string; duplicate: boolean; mergeQueued: boolean }> {
    const writer = await this.resolveWriterIdentity({
      userId: args.userId,
      writer: args.writer,
    })

    const envelope = await this.signEnvelope({
      operation: "move",
      domain: args.domain,
      canonicalPath: args.canonicalPath,
      contentMarkdown: args.contentMarkdown,
      metadata: {
        tags: args.tags,
        citations: args.citations,
        fromCanonicalPath: args.fromCanonicalPath,
      },
      writer,
      idempotencyKey: args.idempotencyKey,
    })

    return this.request<{ eventId: string; duplicate: boolean; mergeQueued: boolean }>("/v1/memory/move", {
      method: "POST",
      body: {
        ...envelope,
        fromCanonicalPath: args.fromCanonicalPath,
      },
    })
  }

  async queryMemory(args: {
    query: string
    mode?: "hybrid" | "lexical"
    domain?: DataCoreDomain
    prefix?: string
    k?: number
  }): Promise<{
    mode: "hybrid" | "lexical"
    fallbackUsed: boolean
    results: DataCoreMemoryQueryResult[]
  }> {
    return this.request("/v1/memory/query", {
      method: "POST",
      body: args,
    })
  }

  async getTree(args: {
    domain: DataCoreDomain
    prefix?: string
  }): Promise<{
    domain: DataCoreDomain
    prefix: string | null
    noteCount: number
    tree: Array<Record<string, unknown>>
  }> {
    const url = new URL(`${this.baseUrl}/v1/memory/tree`)
    url.searchParams.set("domain", args.domain)
    if (args.prefix) {
      url.searchParams.set("prefix", args.prefix)
    }

    return this.request(url.pathname + url.search)
  }

  async getFile(args: {
    domain: DataCoreDomain
    canonicalPath: string
  }): Promise<DataCoreMemoryFileResponse> {
    const url = new URL(`${this.baseUrl}/v1/memory/file`)
    url.searchParams.set("domain", args.domain)
    url.searchParams.set("canonicalPath", args.canonicalPath)

    return this.request(url.pathname + url.search)
  }

  async getGraph(args: {
    domain?: DataCoreDomain
    prefix?: string
    includeUnresolved?: boolean
  }): Promise<{
    nodes: Array<{ id: string; nodeType: "note" | "ghost"; canonicalPath: string; label: string }>
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
    const url = new URL(`${this.baseUrl}/v1/memory/graph`)
    if (args.domain) {
      url.searchParams.set("domain", args.domain)
    }
    if (args.prefix) {
      url.searchParams.set("prefix", args.prefix)
    }
    if (args.includeUnresolved !== undefined) {
      url.searchParams.set("includeUnresolved", String(args.includeUnresolved))
    }

    return this.request(url.pathname + url.search)
  }

  async listSyncEvents(args: {
    afterCursor?: number
    limit?: number
  }): Promise<{ events: unknown[]; nextCursor: number }> {
    const url = new URL(`${this.baseUrl}/v1/sync/events`)
    if (args.afterCursor !== undefined) {
      url.searchParams.set("afterCursor", String(args.afterCursor))
    }
    if (args.limit !== undefined) {
      url.searchParams.set("limit", String(args.limit))
    }

    return this.request(url.pathname + url.search)
  }

  async runSyncReconcile(): Promise<Record<string, unknown>> {
    return this.request("/v1/sync/reconcile", {
      method: "POST",
      body: {},
    })
  }
}

let singleton: DataCoreClient | null = null

export function getDataCoreClient(): DataCoreClient {
  singleton ||= new DataCoreClient()
  return singleton
}
