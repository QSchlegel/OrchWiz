export interface DataCoreQueryCitation {
  id: string
  canonicalPath: string
  excerpt: string
  score: number
  lexicalScore: number
  semanticScore: number
}

export interface DataCoreQueryResult {
  domain: string
  canonicalPath: string
  title: string
  excerpt: string
  score: number
  citations: DataCoreQueryCitation[]
}

export interface DataCoreHybridQueryResponse {
  mode: "hybrid" | "lexical"
  fallbackUsed: boolean
  results: DataCoreQueryResult[]
}

export interface DataCorePluginWriteSyncInput {
  eventId: string
  operation: "upsert" | "delete" | "move" | "merge"
  domain: string
  canonicalPath: string
  fromCanonicalPath?: string | null
  contentMarkdown?: string | null
}

export interface DataCorePluginDrainResult {
  processed: number
  succeeded: number
  failed: number
  skipped: number
}

export interface DataCorePlugin {
  enqueueWriteSync(input: DataCorePluginWriteSyncInput): Promise<void>
  drainPending(args?: { limit?: number }): Promise<DataCorePluginDrainResult>
  queryHybrid(args: {
    query: string
    domain?: string
    prefix?: string
    k: number
  }): Promise<DataCoreHybridQueryResponse>
}
