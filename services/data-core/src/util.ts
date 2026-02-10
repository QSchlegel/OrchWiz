import crypto from "node:crypto"

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`
  }

  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort((a, b) => a.localeCompare(b))
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`
}

export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex")
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

export function asBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  const normalized = value.trim().toLowerCase()
  if (["1", "true", "yes", "on"].includes(normalized)) return true
  if (["0", "false", "no", "off"].includes(normalized)) return false
  return fallback
}

export function asPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }
  return parsed
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function canonicalTitleFromPath(canonicalPath: string): string {
  const parts = canonicalPath.split("/").filter(Boolean)
  const leaf = parts.at(-1) || canonicalPath
  return leaf.replace(/\.md$/iu, "")
}

export function normalizeRelativeMarkdownPath(pathInput: string): string {
  const normalized = pathInput.trim().replaceAll("\\", "/").replace(/^\/+/, "")
  if (!normalized) {
    throw new Error("Path cannot be empty")
  }

  const parts = normalized.split("/").filter(Boolean)
  if (parts.some((segment) => segment === "." || segment === "..")) {
    throw new Error("Path traversal is not allowed")
  }

  const joined = parts.join("/")
  if (!joined.toLowerCase().endsWith(".md")) {
    return `${joined}.md`
  }
  return joined
}
