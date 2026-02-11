import { createHash } from "node:crypto"
import type {
  IngestDeleteRequest,
  IngestDocument,
  IngestUpsertResult,
  KnowledgeIngestProvider,
} from "@/lib/knowledge-ingest/contracts"

interface LlmGraphBuilderSettings {
  apiUrl: string
  neo4jUri: string
  neo4jUsername: string
  neo4jPassword: string
  neo4jDatabase: string
  model: string
  embeddingProvider: string
  embeddingModel: string
}

interface LlmGraphBuilderProviderOptions {
  fetchFn?: typeof fetch
  env?: NodeJS.ProcessEnv
}

function requiredEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim()
  if (!value) {
    throw new Error(`${key} is required for llm_graph_builder provider.`)
  }
  return value
}

function optionalEnv(env: NodeJS.ProcessEnv, key: string, fallback: string): string {
  const value = env[key]?.trim()
  return value || fallback
}

export function toLlmGraphBuilderFileName(key: string, relativePath: string): string {
  const inputName = relativePath.split("/").at(-1) || "note.md"
  const cleaned = inputName.replace(/[^a-zA-Z0-9._-]/g, "_")
  const withMarkdown = cleaned.toLowerCase().endsWith(".md") ? cleaned : `${cleaned}.md`
  const stem = withMarkdown.slice(0, -3) || "note"
  const hash = createHash("sha1").update(key).digest("hex").slice(0, 16)
  const truncatedStem = stem.slice(0, 110)
  return `${truncatedStem}__${hash}.md`
}

function normalizeResponseError(payload: unknown, status: number): string {
  if (!payload || typeof payload !== "object") {
    return `Request failed (${status}).`
  }

  const record = payload as Record<string, unknown>
  const explicit = typeof record.error === "string"
    ? record.error
    : typeof record.message === "string"
      ? record.message
      : null

  if (explicit) {
    return `${explicit} (status ${status})`
  }

  return `Request failed (${status}).`
}

class LlmGraphBuilderProvider implements KnowledgeIngestProvider {
  readonly config = {
    id: "llm_graph_builder",
    version: "1",
  }

  readonly capabilities = {
    supportsDelete: true,
    supportsPostProcess: true,
  }

  private readonly settings: LlmGraphBuilderSettings
  private readonly fetchFn: typeof fetch

  constructor(settings: LlmGraphBuilderSettings, fetchFn: typeof fetch) {
    this.settings = settings
    this.fetchFn = fetchFn
  }

  private withCredentials(form: FormData): void {
    form.append("uri", this.settings.neo4jUri)
    form.append("userName", this.settings.neo4jUsername)
    form.append("password", this.settings.neo4jPassword)
    form.append("database", this.settings.neo4jDatabase)
  }

  private async postForm(path: string, form: FormData): Promise<Record<string, unknown>> {
    const response = await this.fetchFn(`${this.settings.apiUrl}${path}`, {
      method: "POST",
      body: form,
    })

    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null
    const statusText = typeof payload?.status === "string" ? payload.status : null

    if (!response.ok || statusText !== "Success") {
      throw new Error(normalizeResponseError(payload, response.status))
    }

    return payload || {}
  }

  async ingestDocument(document: IngestDocument): Promise<IngestUpsertResult> {
    const artifactRef = toLlmGraphBuilderFileName(document.key, document.relativePath)

    const uploadForm = new FormData()
    this.withCredentials(uploadForm)
    uploadForm.append("model", this.settings.model)
    uploadForm.append("chunkNumber", "1")
    uploadForm.append("totalChunks", "1")
    uploadForm.append("originalname", artifactRef)
    uploadForm.append(
      "file",
      new Blob([document.content], { type: "text/markdown; charset=utf-8" }),
      artifactRef,
    )

    await this.postForm("/upload", uploadForm)

    const extractForm = new FormData()
    this.withCredentials(extractForm)
    extractForm.append("model", this.settings.model)
    extractForm.append("source_type", "local file")
    extractForm.append("file_name", artifactRef)
    extractForm.append("embedding_provider", this.settings.embeddingProvider)
    extractForm.append("embedding_model", this.settings.embeddingModel)

    await this.postForm("/extract", extractForm)

    return { artifactRef }
  }

  async deleteDocuments(documents: IngestDeleteRequest[]): Promise<void> {
    if (documents.length === 0) {
      return
    }

    const filenames = documents.map((entry) => entry.artifactRef).filter((entry) => entry.trim().length > 0)
    if (filenames.length === 0) {
      return
    }

    const sourceTypes = filenames.map(() => "local file")

    const form = new FormData()
    this.withCredentials(form)
    form.append("filenames", JSON.stringify(filenames))
    form.append("source_types", JSON.stringify(sourceTypes))
    form.append("deleteEntities", "true")

    await this.postForm("/delete_document_and_entities", form)
  }

  async postProcess(): Promise<void> {
    const form = new FormData()
    this.withCredentials(form)
    form.append("tasks", JSON.stringify(["enable_hybrid_search_and_fulltext_search_in_bloom"]))
    form.append("embedding_provider", this.settings.embeddingProvider)
    form.append("embedding_model", this.settings.embeddingModel)

    await this.postForm("/post_processing", form)
  }
}

function loadSettings(env: NodeJS.ProcessEnv): LlmGraphBuilderSettings {
  return {
    apiUrl: optionalEnv(env, "LGB_API_URL", "http://127.0.0.1:8000").replace(/\/+$/u, ""),
    neo4jUri: requiredEnv(env, "LGB_NEO4J_URI"),
    neo4jUsername: requiredEnv(env, "LGB_NEO4J_USERNAME"),
    neo4jPassword: requiredEnv(env, "LGB_NEO4J_PASSWORD"),
    neo4jDatabase: optionalEnv(env, "LGB_NEO4J_DATABASE", "neo4j"),
    model: optionalEnv(env, "LGB_MODEL", "openai_gpt_5_mini"),
    embeddingProvider: optionalEnv(env, "LGB_EMBEDDING_PROVIDER", "sentence-transformer"),
    embeddingModel: optionalEnv(env, "LGB_EMBEDDING_MODEL", "all-MiniLM-L6-v2"),
  }
}

export function createLlmGraphBuilderProvider(options: LlmGraphBuilderProviderOptions = {}): KnowledgeIngestProvider {
  const env = options.env || process.env
  const settings = loadSettings(env)
  return new LlmGraphBuilderProvider(settings, options.fetchFn || fetch)
}
