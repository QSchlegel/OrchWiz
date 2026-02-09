import { promises as fs } from "node:fs"
import { dirname } from "node:path"
import type { PhysicalVaultId, VaultTreeNode } from "./types"
import { resolvePathWithinRoot, sanitizeRelativeVaultPath } from "./path"

const EXCLUDED_DIRECTORIES = new Set([".git", ".obsidian", "node_modules"])

function shouldSkipDirectory(name: string): boolean {
  return name.startsWith(".") || EXCLUDED_DIRECTORIES.has(name)
}

function shouldSkipFile(name: string): boolean {
  return name.startsWith(".")
}

export async function directoryExists(absolutePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(absolutePath)
    return stats.isDirectory()
  } catch {
    return false
  }
}

export async function collectMarkdownFilePaths(vaultRootPath: string): Promise<string[]> {
  const files: string[] = []

  const walk = async (relativeDir = ""): Promise<void> => {
    const absoluteDir = relativeDir
      ? resolvePathWithinRoot(vaultRootPath, relativeDir)
      : vaultRootPath

    const entries = await fs.readdir(absoluteDir, { withFileTypes: true }).catch(() => null)
    if (!entries) {
      return
    }

    entries.sort((a, b) => a.name.localeCompare(b.name))

    for (const entry of entries) {
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (shouldSkipDirectory(entry.name)) continue
        await walk(relativePath)
        continue
      }

      if (shouldSkipFile(entry.name)) continue
      if (!entry.isFile()) continue
      if (!entry.name.toLowerCase().endsWith(".md")) continue
      files.push(relativePath)
    }
  }

  await walk()
  return files
}

export async function countMarkdownFiles(vaultRootPath: string): Promise<number> {
  const files = await collectMarkdownFilePaths(vaultRootPath)
  return files.length
}

export async function buildVaultTree(vaultRootPath: string, vaultId: PhysicalVaultId): Promise<VaultTreeNode[]> {
  const walk = async (relativeDir = ""): Promise<VaultTreeNode[]> => {
    const absoluteDir = relativeDir
      ? resolvePathWithinRoot(vaultRootPath, relativeDir)
      : vaultRootPath

    const entries = await fs.readdir(absoluteDir, { withFileTypes: true }).catch(() => null)
    if (!entries) {
      return []
    }

    const directories = entries
      .filter((entry) => entry.isDirectory() && !shouldSkipDirectory(entry.name))
      .sort((a, b) => a.name.localeCompare(b.name))
    const files = entries
      .filter((entry) => entry.isFile() && !shouldSkipFile(entry.name) && entry.name.toLowerCase().endsWith(".md"))
      .sort((a, b) => a.name.localeCompare(b.name))

    const nodes: VaultTreeNode[] = []

    for (const directory of directories) {
      const relativePath = relativeDir ? `${relativeDir}/${directory.name}` : directory.name
      const children = await walk(relativePath)
      nodes.push({
        id: `${vaultId}:${relativePath}`,
        name: directory.name,
        path: relativePath,
        nodeType: "folder",
        vaultId,
        children,
      })
    }

    for (const file of files) {
      const relativePath = relativeDir ? `${relativeDir}/${file.name}` : file.name
      nodes.push({
        id: `${vaultId}:${relativePath}`,
        name: file.name,
        path: relativePath,
        nodeType: "file",
        vaultId,
      })
    }

    return nodes
  }

  return walk()
}

export async function readMarkdownFileWithLimit(
  vaultRootPath: string,
  relativePathInput: string,
  maxBytes: number,
): Promise<{ content: string; size: number; mtime: Date; truncated: boolean }> {
  const relativePath = sanitizeRelativeVaultPath(relativePathInput, { requireMarkdown: true })
  const absolutePath = resolvePathWithinRoot(vaultRootPath, relativePath)
  const fileStats = await fs.stat(absolutePath)

  if (!fileStats.isFile()) {
    throw new Error("Not a file.")
  }

  if (!relativePath.toLowerCase().endsWith(".md")) {
    throw new Error("Only markdown notes are supported.")
  }

  if (fileStats.size <= maxBytes) {
    const content = await fs.readFile(absolutePath, "utf8")
    return {
      content,
      size: fileStats.size,
      mtime: fileStats.mtime,
      truncated: false,
    }
  }

  const fileHandle = await fs.open(absolutePath, "r")
  try {
    const buffer = Buffer.alloc(maxBytes)
    const { bytesRead } = await fileHandle.read(buffer, 0, maxBytes, 0)
    return {
      content: buffer.subarray(0, bytesRead).toString("utf8"),
      size: fileStats.size,
      mtime: fileStats.mtime,
      truncated: true,
    }
  } finally {
    await fileHandle.close()
  }
}

export async function readMarkdownFile(
  vaultRootPath: string,
  relativePathInput: string,
): Promise<{ content: string; size: number; mtime: Date }> {
  const relativePath = sanitizeRelativeVaultPath(relativePathInput, { requireMarkdown: true })
  const absolutePath = resolvePathWithinRoot(vaultRootPath, relativePath)
  const fileStats = await fs.stat(absolutePath)

  if (!fileStats.isFile()) {
    throw new Error("Not a file.")
  }

  if (!relativePath.toLowerCase().endsWith(".md")) {
    throw new Error("Only markdown notes are supported.")
  }

  const content = await fs.readFile(absolutePath, "utf8")
  return {
    content,
    size: fileStats.size,
    mtime: fileStats.mtime,
  }
}

export async function writeMarkdownFile(
  vaultRootPath: string,
  relativePathInput: string,
  content: string,
): Promise<{ size: number; mtime: Date }> {
  const relativePath = sanitizeRelativeVaultPath(relativePathInput, { requireMarkdown: true })
  const absolutePath = resolvePathWithinRoot(vaultRootPath, relativePath)
  const parentDirectory = dirname(absolutePath)
  await fs.mkdir(parentDirectory, { recursive: true })

  const tempPath = `${absolutePath}.tmp-${process.pid}-${Date.now()}`
  await fs.writeFile(tempPath, content, "utf8")
  await fs.rename(tempPath, absolutePath)

  const stats = await fs.stat(absolutePath)
  return {
    size: stats.size,
    mtime: stats.mtime,
  }
}
