import { readFile, readdir } from "node:fs/promises"
import { basename, join, resolve } from "node:path"
import { homedir } from "node:os"
import {
  Prisma,
  type CatalogActivationStatus,
  type SkillCatalogEntry,
  type SkillCatalogSource,
  type SkillImportRun,
} from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  installCuratedSkill,
  installSkillFromGithubUrl,
  listCuratedSkills,
  listExperimentalSkills,
  resolveSkillRootForUser,
} from "@/lib/skills/installer"
import { buildSkillGraph } from "@/lib/skills/graph"
import type {
  SkillCatalogEntryDto,
  SkillCatalogExperimentalStatus,
  SkillCatalogRefreshMode,
  SkillCatalogResponse,
  SkillImportRunDto,
} from "@/lib/skills/types"

const CURATED_REPO = "openai/skills"
const CURATED_REF = "main"
const CURATED_BASE_PATH = "skills/.curated"
const EXPERIMENTAL_BASE_PATH = "skills/.experimental"

interface ParsedSkillFrontmatter {
  name: string | null
  description: string | null
}

interface LocalSkillRecord {
  slug: string
  name: string
  description: string | null
  installedPath: string
  isSystem: boolean
}

interface SkillCatalogSyncResult {
  refreshedAt: Date
  warnings: string[]
  experimentalStatus: SkillCatalogExperimentalStatus
}

interface SkillImportOutcome {
  run: SkillImportRunDto
  entry: SkillCatalogEntryDto | null
}

function asObjectJson(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function formatSkillNameFromSlug(slug: string): string {
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

function sanitizeSkillSlug(input: string): string {
  const slug = sanitizeSlug(input)
  if (!slug) {
    return "skill"
  }
  return slug
}

function skillCatalogStaleMs(): number {
  const parsed = Number.parseInt(process.env.ORCHWIZ_SKILL_CATALOG_STALE_MS || "900000", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 900000
  }
  return parsed
}

export function isSkillCatalogStale(lastSyncedAt: Date | null, now = new Date()): boolean {
  if (!lastSyncedAt) {
    return true
  }

  return now.getTime() - lastSyncedAt.getTime() >= skillCatalogStaleMs()
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

export function buildSkillSourceKey(args: {
  source: SkillCatalogSource
  slug: string
  repo?: string | null
  sourcePath?: string | null
  sourceRef?: string | null
  sourceUrl?: string | null
}): string {
  const source = normalizeOptionalString(args.source)
  const slug = sanitizeSkillSlug(args.slug)

  if (source === "curated" || source === "experimental") {
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

export function parseSkillFrontmatter(markdown: string): ParsedSkillFrontmatter {
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

async function parseSkillMetadataFromDirectory(skillDirectory: string, fallbackSlug: string): Promise<{
  name: string
  description: string | null
}> {
  const fallbackName = formatSkillNameFromSlug(fallbackSlug)
  try {
    const skillMarkdown = await readFile(join(skillDirectory, "SKILL.md"), "utf8")
    const frontmatter = parseSkillFrontmatter(skillMarkdown)

    return {
      name: frontmatter.name || fallbackName,
      description: frontmatter.description,
    }
  } catch {
    return {
      name: fallbackName,
      description: null,
    }
  }
}

async function listDirectories(rootPath: string): Promise<string[]> {
  const entries = await readdir(rootPath, { withFileTypes: true }).catch(() => [])
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))
}

async function collectLocalSkills(skillRoot: string): Promise<{
  localSkills: LocalSkillRecord[]
  systemSkills: LocalSkillRecord[]
}> {
  const localSkills: LocalSkillRecord[] = []
  const systemSkills: LocalSkillRecord[] = []

  const skillDirectories = await listDirectories(skillRoot)
  for (const directory of skillDirectories) {
    if (directory.startsWith(".") && directory !== ".system") {
      continue
    }

    if (directory === ".system") {
      continue
    }

    const slug = sanitizeSkillSlug(directory)
    const installedPath = join(skillRoot, directory)
    const metadata = await parseSkillMetadataFromDirectory(installedPath, slug)
    localSkills.push({
      slug,
      name: metadata.name,
      description: metadata.description,
      installedPath,
      isSystem: false,
    })
  }

  const systemRootCandidates = [
    join(skillRoot, ".system"),
    join(homedir(), ".codex", "skills", ".system"),
  ]

  const seenSystemSlugs = new Set<string>()
  for (const systemRoot of systemRootCandidates) {
    const systemDirectories = await listDirectories(systemRoot)
    for (const directory of systemDirectories) {
      const slug = sanitizeSkillSlug(directory)
      if (seenSystemSlugs.has(slug)) {
        continue
      }
      seenSystemSlugs.add(slug)

      const installedPath = join(systemRoot, directory)
      const metadata = await parseSkillMetadataFromDirectory(installedPath, slug)
      systemSkills.push({
        slug,
        name: metadata.name,
        description: metadata.description,
        installedPath,
        isSystem: true,
      })
    }
  }

  return {
    localSkills,
    systemSkills,
  }
}

function sourcePriority(source: SkillCatalogSource): number {
  switch (source) {
    case "custom_github":
      return 0
    case "curated":
      return 1
    case "experimental":
      return 2
    case "local":
      return 3
    case "system":
      return 4
    default:
      return 5
  }
}

function bestEntryBySlug(entries: SkillCatalogEntry[]): Map<string, SkillCatalogEntry> {
  const sorted = [...entries].sort((left, right) => sourcePriority(left.source) - sourcePriority(right.source))
  const map = new Map<string, SkillCatalogEntry>()

  for (const entry of sorted) {
    if (!map.has(entry.slug)) {
      map.set(entry.slug, entry)
    }
  }

  return map
}

function defaultActivationStatusForSource(source: SkillCatalogSource): CatalogActivationStatus {
  switch (source) {
    case "custom_github":
    case "local":
    case "system":
      return "pending"
    case "curated":
    case "experimental":
      return "approved"
    default:
      return "approved"
  }
}

function toEntryDto(entry: SkillCatalogEntry): SkillCatalogEntryDto {
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
    activationStatus: entry.activationStatus,
    activationRationale: entry.activationRationale,
    activatedAt: entry.activatedAt ? entry.activatedAt.toISOString() : null,
    activatedByUserId: entry.activatedByUserId,
    activatedByBridgeCrewId: entry.activatedByBridgeCrewId,
    activationSecurityReportId: entry.activationSecurityReportId,
    metadata: asObjectJson(entry.metadata),
    ownerUserId: entry.ownerUserId,
    lastSyncedAt: entry.lastSyncedAt.toISOString(),
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  }
}

function toImportRunDto(run: SkillImportRun): SkillImportRunDto {
  return {
    id: run.id,
    ownerUserId: run.ownerUserId,
    catalogEntryId: run.catalogEntryId,
    mode: run.mode,
    source: run.source,
    skillSlug: run.skillSlug,
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

function defaultExperimentalStatus(state: SkillCatalogExperimentalStatus["state"]): SkillCatalogExperimentalStatus {
  return {
    state,
    checkedAt: null,
    error: null,
  }
}

async function upsertCatalogEntry(data: {
  ownerUserId: string
  slug: string
  name: string
  description: string | null
  source: SkillCatalogSource
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
}): Promise<SkillCatalogEntry> {
  const normalizedMetadata =
    data.metadata === undefined
      ? undefined
      : data.metadata === null
        ? Prisma.JsonNull
        : data.metadata

  return prisma.skillCatalogEntry.upsert({
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
      activationStatus: defaultActivationStatusForSource(data.source),
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

async function listCatalogEntriesForOwner(ownerUserId: string): Promise<SkillCatalogEntry[]> {
  return prisma.skillCatalogEntry.findMany({
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
  const latest = await prisma.skillCatalogEntry.findFirst({
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

async function syncSkillCatalogForUser(args: {
  ownerUserId: string
}): Promise<SkillCatalogSyncResult> {
  const refreshedAt = new Date()
  const warnings: string[] = []
  const skillRoot = resolveSkillRootForUser(args.ownerUserId)

  const existingEntries = await listCatalogEntriesForOwner(args.ownerUserId)
  const existingBySourceKey = new Map(existingEntries.map((entry) => [entry.sourceKey, entry]))
  const existingBySlug = bestEntryBySlug(existingEntries)

  const curated = await listCuratedSkills({ userId: args.ownerUserId })
  if (!curated.ok) {
    warnings.push(curated.error || "Unable to refresh curated skills catalog.")
  }

  const experimental = await listExperimentalSkills({ userId: args.ownerUserId })
  const experimentalStatus: SkillCatalogExperimentalStatus = experimental.ok
    ? {
        state: "available",
        checkedAt: refreshedAt.toISOString(),
        error: null,
      }
    : {
        state: "unavailable",
        checkedAt: refreshedAt.toISOString(),
        error: experimental.error || "Experimental source is unavailable.",
      }

  if (!experimental.ok) {
    warnings.push(experimentalStatus.error || "Experimental source is unavailable.")
  }

  const { localSkills, systemSkills } = await collectLocalSkills(skillRoot)
  const localBySlug = new Map(localSkills.map((skill) => [skill.slug, skill]))

  const curatedSlugs = new Set<string>()
  if (curated.ok) {
    for (const item of curated.items) {
      const slug = sanitizeSkillSlug(item.name)
      curatedSlugs.add(slug)
      const sourcePath = `${CURATED_BASE_PATH}/${slug}`
      const sourceKey = buildSkillSourceKey({
        source: "curated",
        slug,
        repo: CURATED_REPO,
        sourcePath,
        sourceRef: CURATED_REF,
      })

      const localSkill = localBySlug.get(slug)
      const existing = existingBySourceKey.get(sourceKey)

      await upsertCatalogEntry({
        ownerUserId: args.ownerUserId,
        slug,
        name: localSkill?.name || existing?.name || formatSkillNameFromSlug(slug),
        description: localSkill?.description ?? existing?.description ?? null,
        source: "curated",
        sourceKey,
        repo: CURATED_REPO,
        sourcePath,
        sourceRef: CURATED_REF,
        isInstalled: Boolean(localSkill) || item.installed,
        isSystem: false,
        installedPath: localSkill?.installedPath || (item.installed ? resolve(join(skillRoot, slug)) : null),
        metadata: {
          source: "curated",
          upstreamInstalled: item.installed,
        },
        lastSyncedAt: refreshedAt,
      })
    }
  }

  const experimentalSlugs = new Set<string>()
  if (experimental.ok) {
    for (const item of experimental.items) {
      const slug = sanitizeSkillSlug(item.name)
      experimentalSlugs.add(slug)
      const sourcePath = `${EXPERIMENTAL_BASE_PATH}/${slug}`
      const sourceKey = buildSkillSourceKey({
        source: "experimental",
        slug,
        repo: CURATED_REPO,
        sourcePath,
        sourceRef: CURATED_REF,
      })

      const localSkill = localBySlug.get(slug)
      const existing = existingBySourceKey.get(sourceKey)

      await upsertCatalogEntry({
        ownerUserId: args.ownerUserId,
        slug,
        name: localSkill?.name || existing?.name || formatSkillNameFromSlug(slug),
        description: localSkill?.description ?? existing?.description ?? null,
        source: "experimental",
        sourceKey,
        repo: CURATED_REPO,
        sourcePath,
        sourceRef: CURATED_REF,
        isInstalled: Boolean(localSkill) || item.installed,
        isSystem: false,
        installedPath: localSkill?.installedPath || (item.installed ? resolve(join(skillRoot, slug)) : null),
        metadata: {
          source: "experimental",
          upstreamInstalled: item.installed,
        },
        lastSyncedAt: refreshedAt,
      })
    }
  }

  for (const localSkill of localSkills) {
    if (curatedSlugs.has(localSkill.slug) || experimentalSlugs.has(localSkill.slug)) {
      continue
    }

    const matchingExisting = existingBySlug.get(localSkill.slug)

    if (matchingExisting && (matchingExisting.source === "custom_github" || matchingExisting.source === "local")) {
      await prisma.skillCatalogEntry.update({
        where: {
          id: matchingExisting.id,
        },
        data: {
          name: localSkill.name,
          description: localSkill.description,
          isInstalled: true,
          installedPath: localSkill.installedPath,
          lastSyncedAt: refreshedAt,
        },
      })
      continue
    }

    const sourceKey = buildSkillSourceKey({
      source: "local",
      slug: localSkill.slug,
    })

    await upsertCatalogEntry({
      ownerUserId: args.ownerUserId,
      slug: localSkill.slug,
      name: localSkill.name,
      description: localSkill.description,
      source: "local",
      sourceKey,
      isInstalled: true,
      isSystem: false,
      installedPath: localSkill.installedPath,
      metadata: {
        source: "local_scan",
      },
      lastSyncedAt: refreshedAt,
    })
  }

  const systemSlugs = new Set<string>()
  for (const systemSkill of systemSkills) {
    systemSlugs.add(systemSkill.slug)
    const sourceKey = buildSkillSourceKey({
      source: "system",
      slug: systemSkill.slug,
    })

    await upsertCatalogEntry({
      ownerUserId: args.ownerUserId,
      slug: systemSkill.slug,
      name: systemSkill.name,
      description: systemSkill.description,
      source: "system",
      sourceKey,
      isInstalled: true,
      isSystem: true,
      installedPath: systemSkill.installedPath,
      metadata: {
        source: "system_scan",
      },
      lastSyncedAt: refreshedAt,
    })
  }

  const installedLocalSlugs = new Set(localSkills.map((skill) => skill.slug))

  await prisma.skillCatalogEntry.updateMany({
    where: {
      ownerUserId: args.ownerUserId,
      source: {
        in: ["custom_github", "local"],
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

  await prisma.skillCatalogEntry.updateMany({
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
    experimentalStatus,
  }
}

async function getCatalogEntryById(id: string): Promise<SkillCatalogEntry | null> {
  return prisma.skillCatalogEntry.findUnique({
    where: { id },
  })
}

export async function getSkillCatalogForUser(args: {
  ownerUserId: string
  refreshMode: SkillCatalogRefreshMode
}): Promise<SkillCatalogResponse> {
  const lastSyncedAtBeforeRefresh = await latestCatalogSyncAt(args.ownerUserId)
  const staleBeforeRefresh = isSkillCatalogStale(lastSyncedAtBeforeRefresh)

  const existingEntries = await listCatalogEntriesForOwner(args.ownerUserId)
  const shouldRefresh =
    args.refreshMode === "force"
    || (args.refreshMode === "auto" && (staleBeforeRefresh || existingEntries.length === 0))

  let syncResult: SkillCatalogSyncResult | null = null
  if (shouldRefresh) {
    syncResult = await syncSkillCatalogForUser({
      ownerUserId: args.ownerUserId,
    })
  }

  const entries = await listCatalogEntriesForOwner(args.ownerUserId)
  const entryDtos = entries.map(toEntryDto)
  const graph = buildSkillGraph(entryDtos)

  const lastSyncedAt = await latestCatalogSyncAt(args.ownerUserId)
  const stale = isSkillCatalogStale(lastSyncedAt)

  return {
    entries: entryDtos,
    graph,
    refresh: {
      refreshMode: args.refreshMode,
      refreshed: Boolean(syncResult),
      stale,
      lastSyncedAt: lastSyncedAt ? lastSyncedAt.toISOString() : null,
      warnings: syncResult?.warnings || [],
      experimentalStatus: syncResult?.experimentalStatus || defaultExperimentalStatus("not_checked"),
    },
  }
}

async function createRunningImportRun(data: {
  ownerUserId: string
  mode: string
  source: SkillCatalogSource | null
  skillSlug?: string | null
  repo?: string | null
  sourcePath?: string | null
  sourceRef?: string | null
  sourceUrl?: string | null
}): Promise<SkillImportRun> {
  return prisma.skillImportRun.create({
    data: {
      ownerUserId: data.ownerUserId,
      mode: data.mode,
      source: data.source,
      skillSlug: data.skillSlug || null,
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
}): Promise<SkillImportRun> {
  return prisma.skillImportRun.update({
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

export async function importCuratedSkillForUser(args: {
  ownerUserId: string
  skillSlug: string
  githubTokenOverride?: string
}): Promise<SkillImportOutcome> {
  const slug = sanitizeSkillSlug(args.skillSlug)
  const sourcePath = `${CURATED_BASE_PATH}/${slug}`

  const run = await createRunningImportRun({
    ownerUserId: args.ownerUserId,
    mode: "curated",
    source: "curated",
    skillSlug: slug,
    repo: CURATED_REPO,
    sourcePath,
    sourceRef: CURATED_REF,
  })

  try {
    const result = await installCuratedSkill({
      userId: args.ownerUserId,
      skillSlug: slug,
      githubTokenOverride: args.githubTokenOverride,
    })

    if (!result.ok) {
      const completed = await completeImportRun({
        runId: run.id,
        status: "failed",
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        errorMessage: result.error || "Skill install failed.",
      })

      return {
        run: toImportRunDto(completed),
        entry: null,
      }
    }

    const installedRecord = result.installed.find((entry) => sanitizeSkillSlug(entry.name) === slug) || result.installed[0]
    const installedPath = installedRecord?.destination || resolve(join(resolveSkillRootForUser(args.ownerUserId), slug))
    const metadata = await parseSkillMetadataFromDirectory(installedPath, slug)

    const sourceKey = buildSkillSourceKey({
      source: "curated",
      slug,
      repo: CURATED_REPO,
      sourcePath,
      sourceRef: CURATED_REF,
    })

    const entry = await upsertCatalogEntry({
      ownerUserId: args.ownerUserId,
      slug,
      name: metadata.name,
      description: metadata.description,
      source: "curated",
      sourceKey,
      repo: CURATED_REPO,
      sourcePath,
      sourceRef: CURATED_REF,
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
      errorMessage: error instanceof Error ? error.message : "Skill install failed unexpectedly.",
    })

    return {
      run: toImportRunDto(completed),
      entry: null,
    }
  }
}

export async function importGithubUrlSkillForUser(args: {
  ownerUserId: string
  githubUrl: string
  githubTokenOverride?: string
}): Promise<SkillImportOutcome> {
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
    const result = await installSkillFromGithubUrl({
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
        errorMessage: result.error || "Skill install failed.",
      })

      return {
        run: toImportRunDto(completed),
        entry: null,
      }
    }

    const installedRecord = result.installed[0]
    const fallbackSlugSource = parsedUrl.sourcePath
      ? basename(parsedUrl.sourcePath)
      : (parsedUrl.repo ? basename(parsedUrl.repo) : "custom-skill")
    const slug = sanitizeSkillSlug(installedRecord?.name || fallbackSlugSource)
    const installedPath = installedRecord?.destination || resolve(join(resolveSkillRootForUser(args.ownerUserId), slug))
    const metadata = await parseSkillMetadataFromDirectory(installedPath, slug)

    const sourceKey = buildSkillSourceKey({
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
      errorMessage: error instanceof Error ? error.message : "Skill install failed unexpectedly.",
    })

    return {
      run: toImportRunDto(completed),
      entry: null,
    }
  }
}

export async function listSkillImportRunsForUser(args: {
  ownerUserId: string
  limit: number
}): Promise<SkillImportRunDto[]> {
  const normalizedLimit = Math.max(1, Math.min(100, Math.trunc(args.limit || 20)))

  const runs = await prisma.skillImportRun.findMany({
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

export async function getSkillCatalogEntryByIdForOwner(args: {
  ownerUserId: string
  id: string
}): Promise<SkillCatalogEntryDto | null> {
  const entry = await getCatalogEntryById(args.id)
  if (!entry || entry.ownerUserId !== args.ownerUserId) {
    return null
  }

  return toEntryDto(entry)
}
