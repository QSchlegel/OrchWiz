import { existsSync } from "node:fs"
import { lstat, readdir, readFile } from "node:fs/promises"
import { resolve, sep } from "node:path"

const WINDOWS_ABSOLUTE_PATH_REGEX = /^[A-Za-z]:[\\/]/u
const DEFAULT_MAX_DIRECTORY_ENTRIES = 250
const DEFAULT_MAX_FILE_PREVIEW_BYTES = 128 * 1024

function parsePositiveIntegerEnv(name: string, fallback: number): number {
  const value = Number(process.env[name] || "")
  if (!Number.isFinite(value) || value < 1) {
    return fallback
  }

  return Math.floor(value)
}

const MAX_DIRECTORY_ENTRIES = parsePositiveIntegerEnv(
  "SUBAGENT_WORKSPACE_INSPECTOR_MAX_DIRECTORY_ENTRIES",
  DEFAULT_MAX_DIRECTORY_ENTRIES,
)

const MAX_FILE_PREVIEW_BYTES = parsePositiveIntegerEnv(
  "SUBAGENT_WORKSPACE_INSPECTOR_MAX_FILE_PREVIEW_BYTES",
  DEFAULT_MAX_FILE_PREVIEW_BYTES,
)

export class WorkspaceInspectorError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = "WorkspaceInspectorError"
    this.status = status
  }
}

export interface WorkspaceTreeEntry {
  name: string
  path: string
  nodeType: "folder" | "file"
  size: number | null
  mtime: string | null
}

export interface WorkspaceTreeResponse {
  rootPath: string
  currentPath: string
  exists: boolean
  truncated: boolean
  entries: WorkspaceTreeEntry[]
}

export interface WorkspaceFileResponse {
  rootPath: string
  path: string
  exists: boolean
  isBinary: boolean
  truncated: boolean
  size: number
  mtime: string | null
  content: string
}

function sanitizeRelativePath(input: string, options: { allowEmpty?: boolean } = {}): string {
  const allowEmpty = options.allowEmpty === true
  const trimmed = input.trim()

  if (!trimmed) {
    if (allowEmpty) {
      return ""
    }
    throw new WorkspaceInspectorError("Path is required.", 400)
  }

  if (trimmed.includes("\u0000")) {
    throw new WorkspaceInspectorError("Path contains invalid characters.", 400)
  }

  if (trimmed.startsWith("/") || trimmed.startsWith("\\") || WINDOWS_ABSOLUTE_PATH_REGEX.test(trimmed)) {
    throw new WorkspaceInspectorError("Absolute paths are not allowed.", 400)
  }

  const normalized = trimmed.replaceAll("\\", "/").replace(/^\.\/+/u, "").replace(/\/+$/u, "")
  if (!normalized) {
    if (allowEmpty) {
      return ""
    }
    throw new WorkspaceInspectorError("Path is required.", 400)
  }

  const segments = normalized.split("/")
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw new WorkspaceInspectorError("Path traversal is not allowed.", 400)
  }

  return segments.join("/")
}

function resolvePathWithinRoot(rootPath: string, relativePath: string): string {
  const absoluteRoot = resolve(rootPath)
  const absoluteTarget = relativePath ? resolve(absoluteRoot, relativePath) : absoluteRoot

  if (absoluteTarget === absoluteRoot || absoluteTarget.startsWith(`${absoluteRoot}${sep}`)) {
    return absoluteTarget
  }

  throw new WorkspaceInspectorError("Resolved path escapes workspace root.", 400)
}

function isLikelyBinary(buffer: Buffer): boolean {
  if (buffer.length === 0) {
    return false
  }

  const sampleLength = Math.min(buffer.length, 8192)
  let suspicious = 0
  for (let index = 0; index < sampleLength; index += 1) {
    const byte = buffer[index]
    if (byte === 0) {
      return true
    }

    // Tabs/newlines/carriage returns are expected in text files.
    const isControl = (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) || byte === 127
    if (isControl) {
      suspicious += 1
    }
  }

  return suspicious / sampleLength > 0.3
}

function toIsoStringOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null
}

export function resolveWorkspaceRootForSubagents(): string {
  const cwd = process.cwd()
  const direct = resolve(cwd, ".claude/agents")
  if (existsSync(direct)) {
    return cwd
  }

  const parent = resolve(cwd, "..")
  const parentAgentsRoot = resolve(parent, ".claude/agents")
  if (existsSync(parentAgentsRoot)) {
    return parent
  }

  return cwd
}

export function resolveSubagentWorkingDirectoryRoot(
  workingDirectoryInput: string,
  workspaceRoot = resolveWorkspaceRootForSubagents(),
): string {
  const workingDirectory = sanitizeRelativePath(workingDirectoryInput, { allowEmpty: true })
  return resolvePathWithinRoot(workspaceRoot, workingDirectory)
}

export async function listSubagentWorkspaceDirectory(args: {
  rootPath: string
  pathInput?: string | null
  maxEntries?: number
}): Promise<WorkspaceTreeResponse> {
  const currentPath = sanitizeRelativePath(args.pathInput || "", { allowEmpty: true })
  const directoryPath = resolvePathWithinRoot(args.rootPath, currentPath)

  let stats
  try {
    stats = await lstat(directoryPath)
  } catch {
    return {
      rootPath: args.rootPath,
      currentPath,
      exists: false,
      truncated: false,
      entries: [],
    }
  }

  if (stats.isSymbolicLink()) {
    throw new WorkspaceInspectorError("Symbolic links are not supported.", 400)
  }

  if (!stats.isDirectory()) {
    throw new WorkspaceInspectorError("Path must point to a directory.", 400)
  }

  const entries = await readdir(directoryPath, { withFileTypes: true })
  const maxEntries = args.maxEntries && args.maxEntries > 0 ? Math.floor(args.maxEntries) : MAX_DIRECTORY_ENTRIES

  const candidateEntries = entries
    .filter((entry) => entry.isDirectory() || entry.isFile())
    .sort((left, right) => {
      const leftWeight = left.isDirectory() ? 0 : 1
      const rightWeight = right.isDirectory() ? 0 : 1
      if (leftWeight !== rightWeight) {
        return leftWeight - rightWeight
      }
      return left.name.localeCompare(right.name)
    })

  const visibleEntries = candidateEntries.slice(0, maxEntries)
  const mapped = await Promise.all(
    visibleEntries.map(async (entry): Promise<WorkspaceTreeEntry | null> => {
      const relativePath = currentPath ? `${currentPath}/${entry.name}` : entry.name
      const absolutePath = resolvePathWithinRoot(args.rootPath, relativePath)
      const childStats = await lstat(absolutePath).catch(() => null)
      if (!childStats || childStats.isSymbolicLink()) {
        return null
      }
      if (!childStats.isDirectory() && !childStats.isFile()) {
        return null
      }

      return {
        name: entry.name,
        path: relativePath,
        nodeType: childStats.isDirectory() ? "folder" : "file",
        size: childStats.isFile() ? childStats.size : null,
        mtime: toIsoStringOrNull(childStats.mtime),
      }
    }),
  )

  return {
    rootPath: args.rootPath,
    currentPath,
    exists: true,
    truncated: candidateEntries.length > visibleEntries.length,
    entries: mapped.filter((entry): entry is WorkspaceTreeEntry => Boolean(entry)),
  }
}

export async function readSubagentWorkspaceFile(args: {
  rootPath: string
  pathInput: string
  maxBytes?: number
}): Promise<WorkspaceFileResponse> {
  const filePath = sanitizeRelativePath(args.pathInput)
  const absolutePath = resolvePathWithinRoot(args.rootPath, filePath)
  const maxBytes = args.maxBytes && args.maxBytes > 0 ? Math.floor(args.maxBytes) : MAX_FILE_PREVIEW_BYTES

  let stats
  try {
    stats = await lstat(absolutePath)
  } catch {
    return {
      rootPath: args.rootPath,
      path: filePath,
      exists: false,
      isBinary: false,
      truncated: false,
      size: 0,
      mtime: null,
      content: "",
    }
  }

  if (stats.isSymbolicLink()) {
    throw new WorkspaceInspectorError("Symbolic links are not supported.", 400)
  }

  if (!stats.isFile()) {
    throw new WorkspaceInspectorError("Path must point to a file.", 400)
  }

  const fullBuffer = await readFile(absolutePath)
  const truncated = fullBuffer.length > maxBytes
  const previewBuffer = truncated ? fullBuffer.subarray(0, maxBytes) : fullBuffer
  const isBinary = isLikelyBinary(previewBuffer)

  return {
    rootPath: args.rootPath,
    path: filePath,
    exists: true,
    isBinary,
    truncated,
    size: stats.size,
    mtime: toIsoStringOrNull(stats.mtime),
    content: isBinary ? "" : previewBuffer.toString("utf8"),
  }
}
