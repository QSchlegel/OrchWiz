import type { PhysicalVaultId } from "@/lib/vault/types"

export interface ProviderCapabilities {
  supportsDelete: boolean
  supportsPostProcess: boolean
}

export interface ProviderConfig {
  id: string
  version: string
}

export interface IngestDocument {
  key: string
  vaultId: PhysicalVaultId
  relativePath: string
  absolutePath: string
  content: string
  contentHash: string
  byteSize: number
  mtime: string
}

export interface IngestDeleteRequest {
  key: string
  artifactRef: string
  reason: "updated" | "deleted"
}

export interface IngestUpsertResult {
  artifactRef: string
}

export interface IngestFailure {
  key: string | null
  phase: "delete" | "ingest" | "post_process" | "provider"
  message: string
}

export interface IngestRunSummary {
  providerId: string
  providerVersion: string
  manifestPath: string
  dryRun: boolean
  force: boolean
  counts: {
    scanned: number
    unchanged: number
    plannedCreate: number
    plannedUpdate: number
    plannedDelete: number
    created: number
    updated: number
    deleted: number
    failed: number
  }
  failures: IngestFailure[]
}

export interface KnowledgeIngestProvider {
  readonly config: ProviderConfig
  readonly capabilities: ProviderCapabilities

  ingestDocument(document: IngestDocument): Promise<IngestUpsertResult>
  deleteDocuments?(documents: IngestDeleteRequest[]): Promise<void>
  postProcess?(): Promise<void>
}

export function assertKnowledgeIngestProvider(provider: KnowledgeIngestProvider): void {
  if (!provider || typeof provider !== "object") {
    throw new Error("Knowledge ingest provider must be an object.")
  }

  if (!provider.config?.id || !provider.config.id.trim()) {
    throw new Error("Knowledge ingest provider config.id is required.")
  }

  if (!provider.config?.version || !provider.config.version.trim()) {
    throw new Error("Knowledge ingest provider config.version is required.")
  }

  if (typeof provider.ingestDocument !== "function") {
    throw new Error("Knowledge ingest provider must implement ingestDocument().")
  }

  if (provider.capabilities?.supportsDelete && typeof provider.deleteDocuments !== "function") {
    throw new Error(
      `Knowledge ingest provider \"${provider.config.id}\" declares delete support but does not implement deleteDocuments().`,
    )
  }

  if (provider.capabilities?.supportsPostProcess && typeof provider.postProcess !== "function") {
    throw new Error(
      `Knowledge ingest provider \"${provider.config.id}\" declares post-process support but does not implement postProcess().`,
    )
  }
}
