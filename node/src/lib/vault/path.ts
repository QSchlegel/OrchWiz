import { resolve, sep } from "node:path"

interface SanitizeOptions {
  requireMarkdown?: boolean
}

const WINDOWS_ABSOLUTE_PATH_REGEX = /^[a-zA-Z]:[\\/]/u

export function sanitizeRelativeVaultPath(inputPath: string, options: SanitizeOptions = {}): string {
  const rawPath = inputPath.trim()
  if (!rawPath) {
    throw new Error("Path is required.")
  }

  if (rawPath.includes("\u0000")) {
    throw new Error("Invalid path.")
  }

  if (rawPath.startsWith("/") || rawPath.startsWith("\\") || WINDOWS_ABSOLUTE_PATH_REGEX.test(rawPath)) {
    throw new Error("Absolute paths are not allowed.")
  }

  const normalizedSlashes = rawPath.replaceAll("\\", "/")
  const trimmed = normalizedSlashes.replace(/^\.\/+/u, "").replace(/\/+$/u, "")
  const segments = trimmed.split("/")

  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw new Error("Path traversal is not allowed.")
  }

  const normalizedPath = segments.join("/")
  if (options.requireMarkdown && !normalizedPath.toLowerCase().endsWith(".md")) {
    throw new Error("Only markdown notes are supported.")
  }

  return normalizedPath
}

export function resolvePathWithinRoot(rootPath: string, relativePath: string): string {
  const absoluteRoot = resolve(rootPath)
  const absoluteTarget = resolve(absoluteRoot, relativePath)

  if (absoluteTarget === absoluteRoot) {
    return absoluteTarget
  }

  if (!absoluteTarget.startsWith(`${absoluteRoot}${sep}`)) {
    throw new Error("Resolved path escapes vault root.")
  }

  return absoluteTarget
}
