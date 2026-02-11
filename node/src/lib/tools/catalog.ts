import { readFile, readdir } from "node:fs/promises"
import { basename, join, resolve } from "node:path"
import { homedir } from "node:os"
import { Prisma, type ToolCatalogEntry, type ToolCatalogSource, type ToolImportRun } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { findCuratedToolBySlug, CURATED_TOOLS } from "@/lib/tools/curated-tools"
import {
  installCuratedToolFromRepo,
  installToolFromGithubUrl,
  resolveToolRootForUser,
} from "@/lib/tools/installer"
import type {
  ToolCatalogEntryDto,
  ToolCatalogRefreshMode,
  ToolCatalogResponse,
  ToolImportRunDto,
} from "@/lib/tools/types"

interface ParsedToolFrontmatter {
  name: string | null
  description: string | null
}

interface LocalToolRecord {
  slug: string
  name: string
  description: string | null
  installedPath: string
  isSystem: boolean
}

interface ToolCatalogSyncResult {
  refreshedAt: Date
  warnings: string[]
}

interface ToolImportOutcome {
  run: ToolImportRunDto
  entry: ToolCatalogEntryDto | null
}

function asObjectJson(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function formatToolNameFromSlug(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function sanitizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function sanitizeToolSlug(input: string): string {
  const slug = sanitizeSlug(input)
  if (!slug) {
    return "tool"
  }
  return slug
}

function toolCatalogStaleMs(): number {
  const parsed = Number.parseInt(process.env.ORCHWIZ_TOOL_CATALOG_STALE_MS || "900000", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 900000
  }
  return parsed
}

export function isToolCatalogStale(lastSyncedAt: Date | null, now = new Date()): boolean {
  if (!lastSyncedAt) {
    return true
  }

  return now.getTime() - lastSyncedAt.getTime() >= toolCatalogStaleMs()
}

function normalizeSourcePath(path: string | null | undefined): string {
  if (!path) {
    return ""
  }

  return path.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "")
}

function normalizeOptionalString(input: string | null | undefined): string {
  if (!input) {
    return ""
  }

  return input.trim().toLowerCase()
}

export function buildToolSourceKey(args: {
  source: ToolCatalogSource
  slug: string
  repo?: string | null
  sourcePath?: string | null
  sourceRef?: string | null
  sourceUrl?: string | null
}): string {
  const source = normalizeOptionalString(args.source)
  const slug = sanitizeToolSlug(args.slug)

  if (source === "curated") {
    return [
      source,
      normalizeOptionalString(args.repo),
      normalizeSourcePath(args.sourcePath),
      normalizeOptionalString(args.sourceRef),
      slug,
    ].join("|")
  }

  if (source === "custom_github") {
    return [
      source,
      normalizeOptionalString(args.repo),
      normalizeSourcePath(args.sourcePath),
      normalizeOptionalString(args.sourceRef),
      normalizeOptionalString(args.sourceUrl),
      slug,
    ].join("|")
  }

  return [source, slug].join("|")
}

function parseFrontmatterValue(rawValue: string): string {
  const trimmed = rawValue.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim()
  }

  return trimmed
}

function parseToolFrontmatter(markdown: string): ParsedToolFrontmatter {
  const content = markdown.trimStart()
  if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) {
    return {
      name: null,
      description: null,
    }
  }

  const lines = content.split(/\r?\n/)
  if (lines.length < 3 || lines[0].trim() !== "---") {
    return {
      name: null,
      description: null,
    }
  }

  let name: string | null = null
  let description: string | null = null

  for (let idx = 1; idx < lines.length; idx += 1) {
    const line = lines[idx]
    if (line.trim() === "---") {
      break
    }

    const separator = line.indexOf(":")
    if (separator <= 0) {
      continue
    }

    const key = line.slice(0, separator).trim().toLowerCase()
    const value = parseFrontmatterValue(line.slice(separator + 1))

    if (!value) {
      continue
    }

    if (key === "name") {
      name = value
      continue
    }

    if (key === "description") {
      description = value
    }
  }

  return {
    name,
    description,
  }
}

async function parseToolMetadataFromDirectory(toolDirectory: string, fallbackSlug: string): Promise<{
  name: string
  description: string | null
}> {
  const fallbackName = formatToolNameFromSlug(fallbackSlug)
  const candidates = ["TOOL.md", "README.md", "README.mdx", "README.txt"]

  for (const candidate of candidates) {
    try {
      const markdown = await readFile(join(toolDirectory, candidate), "utf8")
      const frontmatter = parseToolFrontmatter(markdown)

      if (frontmatter.name || frontmatter.description) {
        return {
          name: frontmatter.name || fallbackName,
          description: frontmatter.description,
        }
      }

      const titleLine = markdown
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.startsWith("# "))
      if (titleLine) {
        return {
          name: titleLine.replace(/^#\s+/, "").trim() || fallbackName,
          description: null,
        }
      }
    } catch {
      // ignore unreadable metadata files
    }
  }

  return {
    name: fallbackName,
    description: null,
  }
}

async function listDirectories(rootPath: string): Promise<string[]> {
  const entries = await readdir(rootPath, { withFileTypes: true }).catch(() => [])
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))
}

async function collectLocalTools(toolRoot: string): Promise<{
  localTools: LocalToolRecord[]
  systemTools: LocalToolRecord[]
}> {
  const localTools: LocalToolRecord[] = []
  const systemTools: LocalToolRecord[] = []

  const toolDirectories = await listDirectories(toolRoot)
  for (const directory of toolDirectories) {
    if (directory.startsWith(".") && directory !== ".system") {
      continue
    }

    if (directory === ".system") {
      continue
    }

    const slug = sanitizeToolSlug(directory)
    const installedPath = join(toolRoot, directory)
    const metadata = await parseToolMetadataFromDirectory(installedPath, slug)
    localTools.push({
      slug,
      name: metadata.name,
      description: metadata.description,
      installedPath,
      isSystem: false,
    })
  }

  const systemRootCandidates = [
    join(toolRoot, ".system"),
    join(homedir(), ".codex", "tools", ".system"),
  ]

  const seenSystemSlugs = new Set<string>()
  for (const systemRoot of systemRootCandidates) {
    const systemDirectories = await listDirectories(systemRoot)
    for (const directory of systemDirectories) {
      const slug = sanitizeToolSlug(directory)
      if (seenSystemSlugs.has(slug)) {
        continue
      }
      seenSystemSlugs.add(slug)

      const installedPath = join(systemRoot, directory)
      const metadata = await parseToolMetadataFromDirectory(installedPath, slug)
      systemTools.push({
        slug,
        name: metadata.name,
        description: metadata.description,
        installedPath,
        isSystem: true,
      })
    }
  }

  return {
    localTools,
    systemTools,
  }
}

function sourcePriority(source: ToolCatalogSource): number {
  switch (source) {
    case "custom_github":
      return 0
    case "curated":
      return 1
    case "local":
      return 2
    case "system":
      return 3
    default:
      return 4
  }
}

export function choosePreferredToolEntryBySlug<T extends { slug: string; source: ToolCatalogSource }>(
  entries: T[],
): Map<string, T> {
  const sorted = [...entries].sort((left, right) => sourcePriority(left.source) - sourcePriority(right.source))
  const map = new Map<string, T>()

  for (const entry of sorted) {
    if (!map.has(entry.slug)) {
      map.set(entry.slug, entry)
    }
  }

  return map
}

function bestEntryBySlug(entries: ToolCatalogEntry[]): Map<string, ToolCatalogEntry> {
  return choosePreferredToolEntryBySlug(entries)
}

function toEntryDto(entry: ToolCatalogEntry): ToolCatalogEntryDto {
  return {
    id: entry.id,
    slug: entry.slug,
    name: entry.name,
    description: entry.description,
    source: entry.source,
    sourceKey: entry.sourceKey,
    repo: entry.repo,
    sourcePath: entry.sourcePath,
    sourceRef: entry.sourceRef,
    sourceUrl: entry.sourceUrl,
    isInstalled: entry.isInstalled,
    isSystem: entry.isSystem,
    installedPath: entry.installedPath,
    metadata: asObjectJson(entry.metadata),
    ownerUserId: entry.ownerUserId,
    lastSyncedAt: entry.lastSyncedAt.toISOString(),
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  }
}

function toImportRunDto(run: ToolImportRun): ToolImportRunDto {
  return {
    id: run.id,
    ownerUserId: run.ownerUserId,
    catalogEntryId: run.catalogEntryId,
    mode: run.mode,
    source: run.source,
    toolSlug: run.toolSlug,
    repo: run.repo,
    sourcePath: run.sourcePath,
    sourceRef: run.sourceRef,
    sourceUrl: run.sourceUrl,
    status: run.status,
    exitCode: run.exitCode,
    stdout: run.stdout,
    stderr: run.stderr,
    errorMessage: run.errorMessage,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt ? run.completedAt.toISOString() : null,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  }
}

function parseGitHubUrlDetails(urlValue: string): {
  repo: string | null
  sourcePath: string | null
  sourceRef: string | null
} {
  try {
    const url = new URL(urlValue)
    if (url.protocol !== "https:" || url.hostname !== "github.com") {
      return { repo: null, sourcePath: null, sourceRef: null }
    }

    const parts = url.pathname.split("/").filter(Boolean)
    if (parts.length < 2) {
      return { repo: null, sourcePath: null, sourceRef: null }
    }

    const repo = `${parts[0]}/${parts[1]}`

    if (parts[2] !== "tree" && parts[2] !== "blob") {
      return {
        repo,
        sourcePath: null,
        sourceRef: null,
      }
    }

    const sourceRef = parts[3] || null
    const sourcePath = parts.length > 4 ? parts.slice(4).join("/") : null

    return {
      repo,
      sourcePath,
      sourceRef,
    }
  } catch {
    return {
      repo: null,
      sourcePath: null,
      sourceRef: null,
    }
  }
}

async function upsertCatalogEntry(data: {
  ownerUserId: string
  slug: string
  name: string
  description: string | null
  source: ToolCatalogSource
  sourceKey: string
  repo?: string | null
  sourcePath?: string | null
  sourceRef?: string | null
  sourceUrl?: string | null
  isInstalled: boolean
  isSystem: boolean
  installedPath?: string | null
  metadata?: Prisma.JsonValue | null
  lastSyncedAt: Date
}): Promise<ToolCatalogEntry> {
  const normalizedMetadata =
    data.metadata === undefined
      ? undefined
      : data.metadata === null
        ? Prisma.JsonNull
        : data.metadata

  return prisma.toolCatalogEntry.upsert({
    where: {
      ownerUserId_sourceKey: {
        ownerUserId: data.ownerUserId,
        sourceKey: data.sourceKey,
      },
    },
    create: {
      ownerUserId: data.ownerUserId,
      slug: data.slug,
      name: data.name,
      description: data.description,
      source: data.source,
      sourceKey: data.sourceKey,
      repo: data.repo || null,
      sourcePath: data.sourcePath || null,
      sourceRef: data.sourceRef || null,
      sourceUrl: data.sourceUrl || null,
      isInstalled: data.isInstalled,
      isSystem: data.isSystem,
      installedPath: data.installedPath || null,
      metadata: normalizedMetadata,
      lastSyncedAt: data.lastSyncedAt,
    },
    update: {
      slug: data.slug,
      name: data.name,
      description: data.description,
      repo: data.repo || null,
      sourcePath: data.sourcePath || null,
      sourceRef: data.sourceRef || null,
      sourceUrl: data.sourceUrl || null,
      isInstalled: data.isInstalled,
      isSystem: data.isSystem,
      installedPath: data.installedPath || null,
      metadata: normalizedMetadata,
      lastSyncedAt: data.lastSyncedAt,
    },
  })
}

async function listCatalogEntriesForOwner(ownerUserId: string): Promise<ToolCatalogEntry[]> {
  return prisma.toolCatalogEntry.findMany({
    where: {
      ownerUserId,
    },
    orderBy: [
      {
        isSystem: "desc",
      },
      {
        isInstalled: "desc",
      },
      {
        name: "asc",
      },
    ],
  })
}

async function latestCatalogSyncAt(ownerUserId: string): Promise<Date | null> {
  const latest = await prisma.toolCatalogEntry.findFirst({
    where: {
      ownerUserId,
    },
    select: {
      lastSyncedAt: true,
    },
    orderBy: {
      lastSyncedAt: "desc",
    },
  })

  return latest?.lastSyncedAt || null
}

async function syncToolCatalogForUser(args: {
  ownerUserId: string
}): Promise<ToolCatalogSyncResult> {
  const refreshedAt = new Date()
  const warnings: string[] = []
  const toolRoot = resolveToolRootForUser(args.ownerUserId)

  const existingEntries = await listCatalogEntriesForOwner(args.ownerUserId)
  const existingBySourceKey = new Map(existingEntries.map((entry) => [entry.sourceKey, entry]))
  const existingBySlug = bestEntryBySlug(existingEntries)

  const { localTools, systemTools } = await collectLocalTools(toolRoot)
  const localBySlug = new Map(localTools.map((tool) => [tool.slug, tool]))

  const curatedSlugs = new Set<string>()
  for (const curatedTool of CURATED_TOOLS) {
    const slug = sanitizeToolSlug(curatedTool.slug)
    curatedSlugs.add(slug)

    const sourceKey = buildToolSourceKey({
      source: "curated",
      slug,
      repo: curatedTool.repo,
      sourcePath: curatedTool.sourcePath || null,
      sourceRef: curatedTool.sourceRef || "main",
      sourceUrl: curatedTool.sourceUrl || null,
    })

    const localTool = localBySlug.get(slug)
    const existing = existingBySourceKey.get(sourceKey)

    await upsertCatalogEntry({
      ownerUserId: args.ownerUserId,
      slug,
      name: localTool?.name || existing?.name || curatedTool.name || formatToolNameFromSlug(slug),
      description: localTool?.description ?? existing?.description ?? curatedTool.description ?? null,
      source: "curated",
      sourceKey,
      repo: curatedTool.repo,
      sourcePath: curatedTool.sourcePath || null,
      sourceRef: curatedTool.sourceRef || "main",
      sourceUrl: curatedTool.sourceUrl || null,
      isInstalled: Boolean(localTool),
      isSystem: false,
      installedPath: localTool?.installedPath || null,
      metadata: {
        source: "curated_manifest",
      },
      lastSyncedAt: refreshedAt,
    })
  }

  for (const localTool of localTools) {
    if (curatedSlugs.has(localTool.slug)) {
      continue
    }

    const matchingExisting = existingBySlug.get(localTool.slug)

    if (matchingExisting && (matchingExisting.source === "custom_github" || matchingExisting.source === "local")) {
      await prisma.toolCatalogEntry.update({
        where: {
          id: matchingExisting.id,
        },
        data: {
          name: localTool.name,
          description: localTool.description,
          isInstalled: true,
          installedPath: localTool.installedPath,
          lastSyncedAt: refreshedAt,
        },
      })
      continue
    }

    const sourceKey = buildToolSourceKey({
      source: "local",
      slug: localTool.slug,
    })

    await upsertCatalogEntry({
      ownerUserId: args.ownerUserId,
      slug: localTool.slug,
      name: localTool.name,
      description: localTool.description,
      source: "local",
      sourceKey,
      isInstalled: true,
      isSystem: false,
      installedPath: localTool.installedPath,
      metadata: {
        source: "local_scan",
      },
      lastSyncedAt: refreshedAt,
    })
  }

  const systemSlugs = new Set<string>()
  for (const systemTool of systemTools) {
    systemSlugs.add(systemTool.slug)
    const sourceKey = buildToolSourceKey({
      source: "system",
      slug: systemTool.slug,
    })

    await upsertCatalogEntry({
      ownerUserId: args.ownerUserId,
      slug: systemTool.slug,
      name: systemTool.name,
      description: systemTool.description,
      source: "system",
      sourceKey,
      isInstalled: true,
      isSystem: true,
      installedPath: systemTool.installedPath,
      metadata: {
        source: "system_scan",
      },
      lastSyncedAt: refreshedAt,
    })
  }

  const installedLocalSlugs = new Set(localTools.map((tool) => tool.slug))

  await prisma.toolCatalogEntry.updateMany({
    where: {
      ownerUserId: args.ownerUserId,
      source: {
        in: ["custom_github", "local", "curated"],
      },
      slug: {
        notIn: [...installedLocalSlugs],
      },
    },
    data: {
      isInstalled: false,
      installedPath: null,
      lastSyncedAt: refreshedAt,
    },
  })

  await prisma.toolCatalogEntry.updateMany({
    where: {
      ownerUserId: args.ownerUserId,
      source: "system",
      slug: {
        notIn: [...systemSlugs],
      },
    },
    data: {
      isInstalled: false,
      installedPath: null,
      lastSyncedAt: refreshedAt,
    },
  })

  return {
    refreshedAt,
    warnings,
  }
}

export async function getToolCatalogForUser(args: {
  ownerUserId: string
  refreshMode: ToolCatalogRefreshMode
}): Promise<ToolCatalogResponse> {
  const lastSyncedAtBeforeRefresh = await latestCatalogSyncAt(args.ownerUserId)
  const staleBeforeRefresh = isToolCatalogStale(lastSyncedAtBeforeRefresh)

  const existingEntries = await listCatalogEntriesForOwner(args.ownerUserId)
  const shouldRefresh =
    args.refreshMode === "force"
    || (args.refreshMode === "auto" && (staleBeforeRefresh || existingEntries.length === 0))

  let syncResult: ToolCatalogSyncResult | null = null
  if (shouldRefresh) {
    syncResult = await syncToolCatalogForUser({
      ownerUserId: args.ownerUserId,
    })
  }

  const entries = await listCatalogEntriesForOwner(args.ownerUserId)
  const entryDtos = entries.map(toEntryDto)

  const lastSyncedAt = await latestCatalogSyncAt(args.ownerUserId)
  const stale = isToolCatalogStale(lastSyncedAt)

  return {
    entries: entryDtos,
    refresh: {
      refreshMode: args.refreshMode,
      refreshed: Boolean(syncResult),
      stale,
      lastSyncedAt: lastSyncedAt ? lastSyncedAt.toISOString() : null,
      warnings: syncResult?.warnings || [],
    },
  }
}

async function createRunningImportRun(data: {
  ownerUserId: string
  mode: string
  source: ToolCatalogSource | null
  toolSlug?: string | null
  repo?: string | null
  sourcePath?: string | null
  sourceRef?: string | null
  sourceUrl?: string | null
}): Promise<ToolImportRun> {
  return prisma.toolImportRun.create({
    data: {
      ownerUserId: data.ownerUserId,
      mode: data.mode,
      source: data.source,
      toolSlug: data.toolSlug || null,
      repo: data.repo || null,
      sourcePath: data.sourcePath || null,
      sourceRef: data.sourceRef || null,
      sourceUrl: data.sourceUrl || null,
      status: "running",
    },
  })
}

async function completeImportRun(args: {
  runId: string
  status: "succeeded" | "failed"
  catalogEntryId?: string | null
  exitCode?: number | null
  stdout?: string | null
  stderr?: string | null
  errorMessage?: string | null
}): Promise<ToolImportRun> {
  return prisma.toolImportRun.update({
    where: {
      id: args.runId,
    },
    data: {
      status: args.status,
      catalogEntryId: args.catalogEntryId || null,
      exitCode: args.exitCode ?? null,
      stdout: args.stdout ?? null,
      stderr: args.stderr ?? null,
      errorMessage: args.errorMessage ?? null,
      completedAt: new Date(),
    },
  })
}

export async function importCuratedToolForUser(args: {
  ownerUserId: string
  toolSlug: string
  githubTokenOverride?: string
}): Promise<ToolImportOutcome> {
  const slug = sanitizeToolSlug(args.toolSlug)
  const curated = findCuratedToolBySlug(slug)
  if (!curated) {
    throw new Error(`Unknown curated tool slug: ${slug}`)
  }

  const run = await createRunningImportRun({
    ownerUserId: args.ownerUserId,
    mode: "curated",
    source: "curated",
    toolSlug: slug,
    repo: curated.repo,
    sourcePath: curated.sourcePath || null,
    sourceRef: curated.sourceRef || "main",
    sourceUrl: curated.sourceUrl || null,
  })

  try {
    const result = await installCuratedToolFromRepo({
      userId: args.ownerUserId,
      repo: curated.repo,
      sourcePath: curated.sourcePath || null,
      sourceRef: curated.sourceRef || "main",
      toolSlug: slug,
      githubTokenOverride: args.githubTokenOverride,
    })

    if (!result.ok) {
      const completed = await completeImportRun({
        runId: run.id,
        status: "failed",
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        errorMessage: result.error || "Tool install failed.",
      })

      return {
        run: toImportRunDto(completed),
        entry: null,
      }
    }

    const installedRecord = result.installed.find((entry) => sanitizeToolSlug(entry.name) === slug) || result.installed[0]
    const installedPath = installedRecord?.destination || resolve(join(resolveToolRootForUser(args.ownerUserId), slug))
    const metadata = await parseToolMetadataFromDirectory(installedPath, slug)

    const sourceKey = buildToolSourceKey({
      source: "curated",
      slug,
      repo: curated.repo,
      sourcePath: curated.sourcePath || null,
      sourceRef: curated.sourceRef || "main",
      sourceUrl: curated.sourceUrl || null,
    })

    const entry = await upsertCatalogEntry({
      ownerUserId: args.ownerUserId,
      slug,
      name: metadata.name,
      description: metadata.description || curated.description,
      source: "curated",
      sourceKey,
      repo: curated.repo,
      sourcePath: curated.sourcePath || null,
      sourceRef: curated.sourceRef || "main",
      sourceUrl: curated.sourceUrl || null,
      isInstalled: true,
      isSystem: false,
      installedPath,
      metadata: {
        source: "curated_import",
      },
      lastSyncedAt: new Date(),
    })

    const completed = await completeImportRun({
      runId: run.id,
      status: "succeeded",
      catalogEntryId: entry.id,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      errorMessage: null,
    })

    return {
      run: toImportRunDto(completed),
      entry: toEntryDto(entry),
    }
  } catch (error) {
    const completed = await completeImportRun({
      runId: run.id,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Tool install failed unexpectedly.",
    })

    return {
      run: toImportRunDto(completed),
      entry: null,
    }
  }
}

export async function importGithubUrlToolForUser(args: {
  ownerUserId: string
  githubUrl: string
  githubTokenOverride?: string
}): Promise<ToolImportOutcome> {
  const parsedUrl = parseGitHubUrlDetails(args.githubUrl)

  const run = await createRunningImportRun({
    ownerUserId: args.ownerUserId,
    mode: "github_url",
    source: "custom_github",
    repo: parsedUrl.repo,
    sourcePath: parsedUrl.sourcePath,
    sourceRef: parsedUrl.sourceRef,
    sourceUrl: args.githubUrl,
  })

  try {
    const result = await installToolFromGithubUrl({
      userId: args.ownerUserId,
      githubUrl: args.githubUrl,
      githubTokenOverride: args.githubTokenOverride,
    })

    if (!result.ok) {
      const completed = await completeImportRun({
        runId: run.id,
        status: "failed",
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        errorMessage: result.error || "Tool install failed.",
      })

      return {
        run: toImportRunDto(completed),
        entry: null,
      }
    }

    const installedRecord = result.installed[0]
    const fallbackSlugSource = parsedUrl.sourcePath
      ? basename(parsedUrl.sourcePath)
      : (parsedUrl.repo ? basename(parsedUrl.repo) : "custom-tool")
    const slug = sanitizeToolSlug(installedRecord?.name || fallbackSlugSource)
    const installedPath = installedRecord?.destination || resolve(join(resolveToolRootForUser(args.ownerUserId), slug))
    const metadata = await parseToolMetadataFromDirectory(installedPath, slug)

    const sourceKey = buildToolSourceKey({
      source: "custom_github",
      slug,
      repo: parsedUrl.repo,
      sourcePath: parsedUrl.sourcePath,
      sourceRef: parsedUrl.sourceRef,
      sourceUrl: args.githubUrl,
    })

    const entry = await upsertCatalogEntry({
      ownerUserId: args.ownerUserId,
      slug,
      name: metadata.name,
      description: metadata.description,
      source: "custom_github",
      sourceKey,
      repo: parsedUrl.repo,
      sourcePath: parsedUrl.sourcePath,
      sourceRef: parsedUrl.sourceRef,
      sourceUrl: args.githubUrl,
      isInstalled: true,
      isSystem: false,
      installedPath,
      metadata: {
        source: "custom_github_import",
      },
      lastSyncedAt: new Date(),
    })

    const completed = await completeImportRun({
      runId: run.id,
      status: "succeeded",
      catalogEntryId: entry.id,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      errorMessage: null,
    })

    return {
      run: toImportRunDto(completed),
      entry: toEntryDto(entry),
    }
  } catch (error) {
    const completed = await completeImportRun({
      runId: run.id,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Tool install failed unexpectedly.",
    })

    return {
      run: toImportRunDto(completed),
      entry: null,
    }
  }
}

export async function listToolImportRunsForUser(args: {
  ownerUserId: string
  limit: number
}): Promise<ToolImportRunDto[]> {
  const normalizedLimit = Math.max(1, Math.min(100, Math.trunc(args.limit || 20)))

  const runs = await prisma.toolImportRun.findMany({
    where: {
      ownerUserId: args.ownerUserId,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: normalizedLimit,
  })

  return runs.map(toImportRunDto)
}

export async function getToolCatalogEntryByIdForOwner(args: {
  ownerUserId: string
  id: string
}): Promise<ToolCatalogEntryDto | null> {
  const entry = await prisma.toolCatalogEntry.findUnique({
    where: { id: args.id },
  })
  if (!entry || entry.ownerUserId !== args.ownerUserId) {
    return null
  }

  return toEntryDto(entry)
}

export async function listToolCatalogEntriesForOwner(args: {
  ownerUserId: string
  installedOnly?: boolean
}): Promise<ToolCatalogEntryDto[]> {
  const entries = await prisma.toolCatalogEntry.findMany({
    where: {
      ownerUserId: args.ownerUserId,
      ...(args.installedOnly
        ? {
            isInstalled: true,
          }
        : {}),
    },
    orderBy: {
      name: "asc",
    },
  })

  return entries.map(toEntryDto)
}
