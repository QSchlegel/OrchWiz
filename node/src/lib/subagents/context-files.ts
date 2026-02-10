import { dirname, resolve, sep } from "node:path"
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises"

export interface ContextSizeMetrics {
  wordCount: number
  estimatedTokens: number
}

export interface EditableContextFile {
  fileName: string
  content: string
}

export interface SubagentContextFile extends EditableContextFile {
  relativePath: string
  size: ContextSizeMetrics
}

export interface LoadedSubagentContextFiles {
  source: "filesystem" | "content-fallback"
  rootPath: string | null
  files: SubagentContextFile[]
  totals: ContextSizeMetrics
}

export interface PersistedSubagentContextFiles extends LoadedSubagentContextFiles {
  content: string
  path: string
}

interface SubagentContextSource {
  name: string
  path: string | null
  content: string
}

const CONTEXT_ROOT_PREFIX = ".claude/agents"
const CONTEXT_FILE_HEADING_REGEX = /^\s{0,3}#{1,6}\s+([A-Za-z][A-Za-z0-9._-]*\.md)\s*$/u
const MD_FILE_NAME_REGEX = /^[A-Za-z0-9._-]+\.md$/u
const PREFERRED_FILE_ORDER = [
  "SOUL.md",
  "MISSION.md",
  "CONTEXT.md",
  "SCOPE.md",
  "AUDIENCE.md",
  "VOICE.md",
  "ETHICS.md",
  "MEMORY.md",
  "DECISIONS.md",
  "FAILURES.md",
  "PROMPT.md",
]
const NORMALIZED_PREFERRED_FILE_ORDER = PREFERRED_FILE_ORDER.map((fileName) => fileName.toUpperCase())

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n")
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function estimateTokens(wordCount: number): number {
  return Math.ceil(wordCount * 1.3)
}

function sanitizeRelativePath(value: string): string {
  const raw = value.trim()
  if (!raw) {
    throw new Error("Path cannot be empty.")
  }

  if (raw.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(raw)) {
    throw new Error("Absolute paths are not allowed.")
  }

  const normalized = raw.replaceAll("\\", "/").replace(/^\.\/+/, "").replace(/\/+$/u, "")
  const segments = normalized.split("/").filter(Boolean)
  if (segments.length === 0) {
    throw new Error("Path cannot be empty.")
  }

  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("Path traversal is not allowed.")
  }

  return segments.join("/")
}

function ensureContextRootPath(pathValue: string): string {
  const sanitized = sanitizeRelativePath(pathValue)
  if (sanitized !== CONTEXT_ROOT_PREFIX && !sanitized.startsWith(`${CONTEXT_ROOT_PREFIX}/`)) {
    throw new Error(`Context root must be inside ${CONTEXT_ROOT_PREFIX}.`)
  }
  return sanitized
}

function ensurePathWithinRoot(root: string, target: string): string {
  const absoluteRoot = resolve(root)
  const absoluteTarget = resolve(target)
  if (absoluteTarget === absoluteRoot || absoluteTarget.startsWith(`${absoluteRoot}${sep}`)) {
    return absoluteTarget
  }
  throw new Error("Resolved path escapes workspace root.")
}

function sanitizeFileName(fileName: string): string {
  const normalized = fileName.trim()
  if (!MD_FILE_NAME_REGEX.test(normalized)) {
    throw new Error(`Invalid context file name: ${fileName}`)
  }
  return normalized
}

function preferredIndex(fileName: string): number {
  const idx = NORMALIZED_PREFERRED_FILE_ORDER.indexOf(fileName.toUpperCase())
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx
}

function sortContextFiles<T extends { fileName: string }>(files: T[]): T[] {
  return [...files].sort((left, right) => {
    const leftIdx = preferredIndex(left.fileName)
    const rightIdx = preferredIndex(right.fileName)

    if (leftIdx !== rightIdx) {
      return leftIdx - rightIdx
    }

    return left.fileName.localeCompare(right.fileName)
  })
}

function toContextSize(content: string): ContextSizeMetrics {
  const wordCount = countWords(content)
  return {
    wordCount,
    estimatedTokens: estimateTokens(wordCount),
  }
}

function buildTotals(files: Array<{ content: string }>): ContextSizeMetrics {
  const wordCount = files.reduce((sum, file) => sum + countWords(file.content), 0)
  return {
    wordCount,
    estimatedTokens: estimateTokens(wordCount),
  }
}

function toSubagentContextFile(file: EditableContextFile, rootPath: string | null): SubagentContextFile {
  return {
    ...file,
    relativePath: rootPath ? `${rootPath}/${file.fileName}` : file.fileName,
    size: toContextSize(file.content),
  }
}

function inferContextRootPath(pathValue: string | null): string | null {
  if (!pathValue) {
    return null
  }

  try {
    const sanitized = sanitizeRelativePath(pathValue)
    const rootPath = sanitized.toLowerCase().endsWith(".md") ? dirname(sanitized) : sanitized
    return ensureContextRootPath(rootPath)
  } catch {
    return null
  }
}

function splitContentIntoContextFiles(content: string): EditableContextFile[] {
  const normalized = normalizeNewlines(content).trim()
  if (!normalized) {
    return [{ fileName: "PROMPT.md", content: "" }]
  }

  const lines = normalized.split("\n")
  const files: EditableContextFile[] = []
  let currentFileName: string | null = null
  let currentBody: string[] = []

  const flush = () => {
    if (!currentFileName) return
    files.push({
      fileName: currentFileName,
      content: currentBody.join("\n").trim(),
    })
  }

  for (const line of lines) {
    const heading = line.match(CONTEXT_FILE_HEADING_REGEX)
    if (heading) {
      flush()
      currentFileName = sanitizeFileName(heading[1].trim())
      currentBody = []
      continue
    }

    currentBody.push(line)
  }

  flush()

  if (files.length === 0) {
    return [{ fileName: "PROMPT.md", content: normalized }]
  }

  return sortContextFiles(files)
}

function normalizeEditableContextFiles(files: EditableContextFile[]): EditableContextFile[] {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("At least one context file is required.")
  }

  const deduped = new Map<string, EditableContextFile>()
  for (const file of files) {
    const fileName = sanitizeFileName(file.fileName)
    const content = typeof file.content === "string" ? normalizeNewlines(file.content).trim() : ""
    deduped.set(fileName.toUpperCase(), {
      fileName,
      content,
    })
  }

  return sortContextFiles([...deduped.values()])
}

function composeSubagentContent(files: EditableContextFile[]): string {
  return normalizeEditableContextFiles(files)
    .map((file) => `# ${file.fileName}\n${file.content}`.trim())
    .join("\n\n")
    .trim()
}

export function composeContextFilesContent(files: EditableContextFile[]): string {
  return composeSubagentContent(files)
}

function slugifyAgentName(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  return slug || "agent"
}

function defaultContextRootPathForAgent(name: string): string {
  return `${CONTEXT_ROOT_PREFIX}/${slugifyAgentName(name)}`
}

async function loadFilesystemContextFiles(
  repoRoot: string,
  rootPath: string,
): Promise<EditableContextFile[] | null> {
  const rootAbsolute = ensurePathWithinRoot(repoRoot, resolve(repoRoot, rootPath))

  let rootStats
  try {
    rootStats = await stat(rootAbsolute)
  } catch {
    return null
  }

  if (!rootStats.isDirectory()) {
    return null
  }

  const entries = await readdir(rootAbsolute, { withFileTypes: true })
  const fileNames = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .map((entry) => entry.name)

  if (fileNames.length === 0) {
    return null
  }

  const sortedNames = sortContextFiles(fileNames.map((fileName) => ({ fileName }))).map((entry) => entry.fileName)
  const files = await Promise.all(
    sortedNames.map(async (fileName) => {
      const content = await readFile(resolve(rootAbsolute, fileName), "utf8")
      return {
        fileName,
        content: normalizeNewlines(content).trim(),
      }
    }),
  )

  return files
}

export async function loadSubagentContextFiles(args: {
  repoRoot: string
  subagent: SubagentContextSource
}): Promise<LoadedSubagentContextFiles> {
  const rootPath = inferContextRootPath(args.subagent.path)

  if (rootPath) {
    const filesystemFiles = await loadFilesystemContextFiles(args.repoRoot, rootPath)
    if (filesystemFiles && filesystemFiles.length > 0) {
      return {
        source: "filesystem",
        rootPath,
        files: filesystemFiles.map((file) => toSubagentContextFile(file, rootPath)),
        totals: buildTotals(filesystemFiles),
      }
    }
  }

  const fallbackFiles = splitContentIntoContextFiles(args.subagent.content)
  return {
    source: "content-fallback",
    rootPath,
    files: fallbackFiles.map((file) => toSubagentContextFile(file, rootPath)),
    totals: buildTotals(fallbackFiles),
  }
}

export async function persistSubagentContextFiles(args: {
  repoRoot: string
  subagent: Pick<SubagentContextSource, "name" | "path">
  files: EditableContextFile[]
}): Promise<PersistedSubagentContextFiles> {
  const normalizedFiles = normalizeEditableContextFiles(args.files)
  const rootPath = inferContextRootPath(args.subagent.path) || defaultContextRootPathForAgent(args.subagent.name)
  const safeRootPath = ensureContextRootPath(rootPath)
  const rootAbsolute = ensurePathWithinRoot(args.repoRoot, resolve(args.repoRoot, safeRootPath))

  await mkdir(rootAbsolute, { recursive: true })

  const existingEntries = await readdir(rootAbsolute, { withFileTypes: true })
  const desiredNames = new Set(normalizedFiles.map((file) => file.fileName.toUpperCase()))

  await Promise.all(
    existingEntries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md") && !desiredNames.has(entry.name.toUpperCase()))
      .map((entry) => rm(resolve(rootAbsolute, entry.name), { force: true })),
  )

  await Promise.all(
    normalizedFiles.map((file) =>
      writeFile(resolve(rootAbsolute, file.fileName), `${normalizeNewlines(file.content).trim()}\n`, "utf8"),
    ),
  )

  const path = `${safeRootPath}/${normalizedFiles[0].fileName}`
  const content = composeSubagentContent(normalizedFiles)
  return {
    source: "filesystem",
    rootPath: safeRootPath,
    files: normalizedFiles.map((file) => toSubagentContextFile(file, safeRootPath)),
    totals: buildTotals(normalizedFiles),
    path,
    content,
  }
}

export function calculateContextSize(content: string): ContextSizeMetrics {
  return toContextSize(content)
}

export function calculateTotalContextSize(files: EditableContextFile[]): ContextSizeMetrics {
  return buildTotals(files)
}

export function parseContextFilesFromContent(content: string): EditableContextFile[] {
  return splitContentIntoContextFiles(content)
}
