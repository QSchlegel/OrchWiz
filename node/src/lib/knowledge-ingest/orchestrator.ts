import { createHash } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { collectMarkdownFilePaths, directoryExists, readMarkdownFile } from "@/lib/vault/fs"
import { resolveVaultAbsolutePath } from "@/lib/vault/config"
import type { PhysicalVaultId } from "@/lib/vault/types"
import {
  assertKnowledgeIngestProvider,
  type IngestDeleteRequest,
  type IngestDocument,
  type IngestFailure,
  type IngestRunSummary,
  type KnowledgeIngestProvider,
} from "@/lib/knowledge-ingest/contracts"

const MANIFEST_SCHEMA_VERSION = 1
const DEFAULT_MANIFEST_PATH = resolve(process.cwd(), ".cache", "knowledge-ingest-manifest.json")
const DEFAULT_PUBLIC_VAULTS: PhysicalVaultId[] = ["orchwiz", "ship", "agent-public"]

interface ManifestDocumentEntry {
  key: string
  vaultId: PhysicalVaultId
  relativePath: string
  contentHash: string
  artifactRef: string
  byteSize: number
  mtime: string
  updatedAt: string
}

interface ManifestProviderState {
  version: string
  updatedAt: string
  documents: Record<string, ManifestDocumentEntry>
}

interface ManifestFile {
  schemaVersion: number
  updatedAt: string
  providers: Record<string, ManifestProviderState>
}

interface IngestPlan {
  created: string[]
  updated: string[]
  unchanged: string[]
  deleted: string[]
}

export interface KnowledgeIngestRunOptions {
  provider: KnowledgeIngestProvider
  dryRun?: boolean
  force?: boolean
  includeTrash?: boolean
  deleteMissing?: boolean
  runPostProcess?: boolean
  continueOnError?: boolean
  manifestPath?: string
  vaultIds?: PhysicalVaultId[]
  log?: (line: string) => void
}

function asBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback
  }

  const normalized = value.trim().toLowerCase()
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false
  }
  return fallback
}

function nowIso(): string {
  return new Date().toISOString()
}

function emptyManifest(): ManifestFile {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    updatedAt: nowIso(),
    providers: {},
  }
}

function toDocumentKey(vaultId: PhysicalVaultId, relativePath: string): string {
  return `${vaultId}:${relativePath}`
}

function contentHashFor(content: string): string {
  return createHash("sha256").update(content).digest("hex")
}

function isTrashPath(relativePath: string): boolean {
  return relativePath.toLowerCase().startsWith("_trash/")
}

function firstFailureMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

function normalizeManifest(raw: unknown): ManifestFile {
  if (!raw || typeof raw !== "object") {
    return emptyManifest()
  }

  const record = raw as Record<string, unknown>
  const providersRaw = record.providers

  const providers: Record<string, ManifestProviderState> = {}
  if (providersRaw && typeof providersRaw === "object") {
    for (const [providerId, stateRaw] of Object.entries(providersRaw)) {
      if (!stateRaw || typeof stateRaw !== "object") {
        continue
      }

      const stateRecord = stateRaw as Record<string, unknown>
      const version = typeof stateRecord.version === "string" ? stateRecord.version : ""
      const updatedAt = typeof stateRecord.updatedAt === "string" ? stateRecord.updatedAt : nowIso()
      const documentsRaw = stateRecord.documents

      if (!version || !documentsRaw || typeof documentsRaw !== "object") {
        continue
      }

      const documents: Record<string, ManifestDocumentEntry> = {}
      for (const [key, entryRaw] of Object.entries(documentsRaw as Record<string, unknown>)) {
        if (!entryRaw || typeof entryRaw !== "object") {
          continue
        }

        const entry = entryRaw as Record<string, unknown>
        if (
          typeof entry.key !== "string"
          || typeof entry.relativePath !== "string"
          || typeof entry.contentHash !== "string"
          || typeof entry.artifactRef !== "string"
          || typeof entry.mtime !== "string"
        ) {
          continue
        }

        const vaultId = entry.vaultId
        if (vaultId !== "orchwiz" && vaultId !== "ship" && vaultId !== "agent-public") {
          continue
        }

        documents[key] = {
          key: entry.key,
          vaultId,
          relativePath: entry.relativePath,
          contentHash: entry.contentHash,
          artifactRef: entry.artifactRef,
          byteSize: typeof entry.byteSize === "number" ? entry.byteSize : 0,
          mtime: entry.mtime,
          updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : nowIso(),
        }
      }

      providers[providerId] = {
        version,
        updatedAt,
        documents,
      }
    }
  }

  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : nowIso(),
    providers,
  }
}

async function loadManifest(manifestPath: string): Promise<ManifestFile> {
  try {
    const content = await readFile(manifestPath, "utf8")
    const parsed = JSON.parse(content) as unknown
    return normalizeManifest(parsed)
  } catch {
    return emptyManifest()
  }
}

async function saveManifest(manifestPath: string, manifest: ManifestFile): Promise<void> {
  await mkdir(dirname(manifestPath), { recursive: true })
  const tmpPath = `${manifestPath}.tmp-${process.pid}-${Date.now()}`
  await writeFile(tmpPath, JSON.stringify(manifest, null, 2), "utf8")
  await rename(tmpPath, manifestPath)
}

async function scanIngestDocuments(args: {
  vaultIds: PhysicalVaultId[]
  includeTrash: boolean
}): Promise<Map<string, IngestDocument>> {
  const byKey = new Map<string, IngestDocument>()

  for (const vaultId of args.vaultIds) {
    const rootPath = resolveVaultAbsolutePath(vaultId)
    if (!(await directoryExists(rootPath))) {
      continue
    }

    const relativePaths = await collectMarkdownFilePaths(rootPath)
    for (const relativePath of relativePaths) {
      if (!args.includeTrash && isTrashPath(relativePath)) {
        continue
      }

      const file = await readMarkdownFile(rootPath, relativePath).catch(() => null)
      if (!file) {
        continue
      }

      const key = toDocumentKey(vaultId, relativePath)
      byKey.set(key, {
        key,
        vaultId,
        relativePath,
        absolutePath: `${rootPath}/${relativePath}`,
        content: file.content,
        contentHash: contentHashFor(file.content),
        byteSize: file.size,
        mtime: file.mtime.toISOString(),
      })
    }
  }

  return byKey
}

function buildIngestPlan(args: {
  scanned: Map<string, IngestDocument>
  existing: Record<string, ManifestDocumentEntry>
  force: boolean
}): IngestPlan {
  const created: string[] = []
  const updated: string[] = []
  const unchanged: string[] = []

  for (const [key, document] of args.scanned.entries()) {
    const current = args.existing[key]
    if (!current) {
      created.push(key)
      continue
    }

    if (args.force) {
      updated.push(key)
      continue
    }

    if (current.contentHash === document.contentHash) {
      unchanged.push(key)
    } else {
      updated.push(key)
    }
  }

  const deleted: string[] = []
  for (const key of Object.keys(args.existing)) {
    if (!args.scanned.has(key)) {
      deleted.push(key)
    }
  }

  return { created, updated, unchanged, deleted }
}

function buildSummary(args: {
  provider: KnowledgeIngestProvider
  manifestPath: string
  dryRun: boolean
  force: boolean
  scannedCount: number
  plan: IngestPlan
  completed: { created: number; updated: number; deleted: number }
  failures: IngestFailure[]
  deleteMissing: boolean
}): IngestRunSummary {
  const plannedDelete = args.deleteMissing ? args.plan.deleted.length : 0

  return {
    providerId: args.provider.config.id,
    providerVersion: args.provider.config.version,
    manifestPath: args.manifestPath,
    dryRun: args.dryRun,
    force: args.force,
    counts: {
      scanned: args.scannedCount,
      unchanged: args.plan.unchanged.length,
      plannedCreate: args.plan.created.length,
      plannedUpdate: args.plan.updated.length,
      plannedDelete,
      created: args.completed.created,
      updated: args.completed.updated,
      deleted: args.completed.deleted,
      failed: args.failures.length,
    },
    failures: args.failures,
  }
}

export async function runKnowledgeIngest(options: KnowledgeIngestRunOptions): Promise<IngestRunSummary> {
  assertKnowledgeIngestProvider(options.provider)

  const log = options.log || (() => {})
  const manifestPath = options.manifestPath || DEFAULT_MANIFEST_PATH
  const dryRun = options.dryRun === true
  const force = options.force === true
  const includeTrash = options.includeTrash ?? asBoolean(process.env.KNOWLEDGE_INGEST_INCLUDE_TRASH, false)
  const deleteMissing = options.deleteMissing ?? asBoolean(process.env.KNOWLEDGE_INGEST_DELETE_MISSING, true)
  const runPostProcess = options.runPostProcess ?? asBoolean(process.env.KNOWLEDGE_INGEST_POST_PROCESS, true)
  const continueOnError = options.continueOnError ?? true
  const vaultIds = options.vaultIds || DEFAULT_PUBLIC_VAULTS

  const manifest = await loadManifest(manifestPath)
  const providerId = options.provider.config.id
  const providerVersion = options.provider.config.version

  const providerState = manifest.providers[providerId]
  const existingDocuments = providerState && providerState.version === providerVersion
    ? providerState.documents
    : {}

  if (providerState && providerState.version !== providerVersion) {
    log(
      `[knowledge-ingest] provider manifest version mismatch for ${providerId}: ${providerState.version} -> ${providerVersion}; starting with empty provider state.`,
    )
  }

  const scanned = await scanIngestDocuments({
    vaultIds,
    includeTrash,
  })

  const plan = buildIngestPlan({
    scanned,
    existing: existingDocuments,
    force,
  })

  log(
    `[knowledge-ingest] provider=${providerId} scanned=${scanned.size} create=${plan.created.length} update=${plan.updated.length} unchanged=${plan.unchanged.length} deleted=${plan.deleted.length}`,
  )

  const failures: IngestFailure[] = []
  const completed = {
    created: 0,
    updated: 0,
    deleted: 0,
  }

  const nextDocuments: Record<string, ManifestDocumentEntry> = {
    ...existingDocuments,
  }

  const blockedUpdates = new Set<string>()
  let mutated = false
  let halted = false

  const deleteTargets: IngestDeleteRequest[] = []
  for (const key of plan.updated) {
    const current = existingDocuments[key]
    if (current?.artifactRef) {
      deleteTargets.push({
        key,
        artifactRef: current.artifactRef,
        reason: "updated",
      })
    }
  }

  if (deleteMissing) {
    for (const key of plan.deleted) {
      const current = existingDocuments[key]
      if (!current?.artifactRef) {
        continue
      }

      deleteTargets.push({
        key,
        artifactRef: current.artifactRef,
        reason: "deleted",
      })
    }
  }

  if (!dryRun && deleteTargets.length > 0) {
    if (!options.provider.capabilities.supportsDelete || typeof options.provider.deleteDocuments !== "function") {
      for (const target of deleteTargets) {
        failures.push({
          key: target.key,
          phase: "provider",
          message: `Provider ${providerId} does not support delete operations.`,
        })
        if (target.reason === "updated") {
          blockedUpdates.add(target.key)
        }
        if (!continueOnError) {
          halted = true
          break
        }
      }
    } else {
      for (const target of deleteTargets) {
        try {
          await options.provider.deleteDocuments([target])
          mutated = true

          if (target.reason === "deleted") {
            delete nextDocuments[target.key]
            completed.deleted += 1
          }
        } catch (error) {
          failures.push({
            key: target.key,
            phase: "delete",
            message: firstFailureMessage(error),
          })

          if (target.reason === "updated") {
            blockedUpdates.add(target.key)
          }

          if (!continueOnError) {
            halted = true
            break
          }
        }
      }
    }
  }

  if (!dryRun && !halted) {
    for (const key of plan.created) {
      const document = scanned.get(key)
      if (!document) {
        continue
      }

      try {
        const result = await options.provider.ingestDocument(document)
        mutated = true
        completed.created += 1
        nextDocuments[key] = {
          key,
          vaultId: document.vaultId,
          relativePath: document.relativePath,
          contentHash: document.contentHash,
          artifactRef: result.artifactRef,
          byteSize: document.byteSize,
          mtime: document.mtime,
          updatedAt: nowIso(),
        }
      } catch (error) {
        failures.push({
          key,
          phase: "ingest",
          message: firstFailureMessage(error),
        })

        if (!continueOnError) {
          halted = true
          break
        }
      }
    }

    for (const key of plan.updated) {
      if (halted) {
        break
      }

      if (blockedUpdates.has(key)) {
        continue
      }

      const document = scanned.get(key)
      if (!document) {
        continue
      }

      try {
        const result = await options.provider.ingestDocument(document)
        mutated = true
        completed.updated += 1
        nextDocuments[key] = {
          key,
          vaultId: document.vaultId,
          relativePath: document.relativePath,
          contentHash: document.contentHash,
          artifactRef: result.artifactRef,
          byteSize: document.byteSize,
          mtime: document.mtime,
          updatedAt: nowIso(),
        }
      } catch (error) {
        failures.push({
          key,
          phase: "ingest",
          message: firstFailureMessage(error),
        })

        if (!continueOnError) {
          halted = true
          break
        }
      }
    }
  }

  if (!dryRun && !halted && runPostProcess && mutated) {
    if (options.provider.capabilities.supportsPostProcess && typeof options.provider.postProcess === "function") {
      try {
        await options.provider.postProcess()
      } catch (error) {
        failures.push({
          key: null,
          phase: "post_process",
          message: firstFailureMessage(error),
        })
      }
    } else {
      failures.push({
        key: null,
        phase: "provider",
        message: `Provider ${providerId} does not support post-process operations.`,
      })
    }
  }

  if (!dryRun) {
    manifest.providers[providerId] = {
      version: providerVersion,
      updatedAt: nowIso(),
      documents: nextDocuments,
    }
    manifest.updatedAt = nowIso()
    await saveManifest(manifestPath, manifest)
  }

  const summary = buildSummary({
    provider: options.provider,
    manifestPath,
    dryRun,
    force,
    scannedCount: scanned.size,
    plan,
    completed,
    failures,
    deleteMissing,
  })

  log(
    `[knowledge-ingest] completed provider=${summary.providerId} dryRun=${summary.dryRun} created=${summary.counts.created} updated=${summary.counts.updated} deleted=${summary.counts.deleted} failed=${summary.counts.failed}`,
  )

  return summary
}

export const __test = {
  buildIngestPlan,
  contentHashFor,
  isTrashPath,
  toDocumentKey,
}
