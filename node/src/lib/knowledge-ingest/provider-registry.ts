import { assertKnowledgeIngestProvider, type KnowledgeIngestProvider } from "@/lib/knowledge-ingest/contracts"
import { createLlmGraphBuilderProvider } from "@/lib/knowledge-ingest/providers/llm-graph-builder"

type ProviderFactory = () => KnowledgeIngestProvider

const DEFAULT_PROVIDER_ID = "llm_graph_builder"

const PROVIDER_FACTORIES: Record<string, ProviderFactory> = {
  llm_graph_builder: () => createLlmGraphBuilderProvider(),
}

export function resolveKnowledgeIngestProviderId(explicitProviderId?: string | null): string {
  const fromArg = explicitProviderId?.trim()
  if (fromArg) {
    return fromArg
  }

  const fromEnv = process.env.KNOWLEDGE_INGEST_PROVIDER?.trim()
  if (fromEnv) {
    return fromEnv
  }

  return DEFAULT_PROVIDER_ID
}

export function listKnowledgeIngestProviderIds(): string[] {
  return Object.keys(PROVIDER_FACTORIES).sort((left, right) => left.localeCompare(right))
}

export function createKnowledgeIngestProvider(explicitProviderId?: string | null): KnowledgeIngestProvider {
  const providerId = resolveKnowledgeIngestProviderId(explicitProviderId)
  const factory = PROVIDER_FACTORIES[providerId]

  if (!factory) {
    const supported = listKnowledgeIngestProviderIds().join(", ")
    throw new Error(`Unsupported knowledge ingest provider: ${providerId}. Supported providers: ${supported}.`)
  }

  const provider = factory()
  assertKnowledgeIngestProvider(provider)
  return provider
}
