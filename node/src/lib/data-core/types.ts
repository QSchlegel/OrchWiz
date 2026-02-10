export type DataCoreDomain = "orchwiz" | "ship" | "agent-public"

export interface DataCoreSignatureEnvelope {
  chain: "cardano"
  alg: "cip8-ed25519"
  keyRef: string
  address: string
  key?: string
  signature: string
  payloadHash: string
  signedAt: string
}

export interface DataCoreWriteMetadata {
  tags?: string[]
  citations?: string[]
  source: "agent" | "user" | "system"
  writerType: "agent" | "user" | "system"
  writerId: string
  fromCanonicalPath?: string
}

export interface DataCoreEventMeta {
  sourceCoreId: string
  sourceSeq: number
  occurredAt: string
  idempotencyKey: string
}

export interface DataCoreWriteEnvelope {
  operation: "upsert" | "delete" | "move" | "merge"
  domain: DataCoreDomain
  canonicalPath: string
  contentMarkdown?: string
  metadata: DataCoreWriteMetadata
  event: DataCoreEventMeta
  signature: DataCoreSignatureEnvelope
}

export interface DataCoreMemoryQueryResult {
  domain: DataCoreDomain
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
}

export interface DataCoreMemoryFileResponse {
  domain: DataCoreDomain
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
}
