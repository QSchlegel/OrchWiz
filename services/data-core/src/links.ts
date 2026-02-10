import { dirname, posix } from "node:path"

export interface RawLink {
  kind: "wiki" | "markdown"
  target: string
  label: string
}

export function extractLinks(markdown: string): RawLink[] {
  const links: RawLink[] = []

  const wikiRegex = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/gu
  let wikiMatch = wikiRegex.exec(markdown)
  while (wikiMatch) {
    const target = (wikiMatch[1] || "").trim()
    const fallbackLabel = target.split("/").at(-1) || target
    const label = (wikiMatch[2] || fallbackLabel).trim()

    if (target) {
      links.push({
        kind: "wiki",
        target,
        label: label || target,
      })
    }

    wikiMatch = wikiRegex.exec(markdown)
  }

  const markdownRegex = /\[([^\]]+)\]\(([^)]+)\)/gu
  let markdownMatch = markdownRegex.exec(markdown)
  while (markdownMatch) {
    const previousChar = markdownMatch.index > 0 ? markdown[markdownMatch.index - 1] : ""
    if (previousChar === "!") {
      markdownMatch = markdownRegex.exec(markdown)
      continue
    }

    const label = (markdownMatch[1] || "").trim()
    const target = (markdownMatch[2] || "").trim()
    if (target) {
      links.push({
        kind: "markdown",
        target,
        label: label || target,
      })
    }

    markdownMatch = markdownRegex.exec(markdown)
  }

  return links
}

function isExternalTarget(target: string): boolean {
  if (!target) return true
  if (target.startsWith("#")) return true
  if (target.startsWith("//")) return true
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/u.test(target)) return true
  return false
}

function normalizeLinkTarget(rawTarget: string): string {
  const trimmed = rawTarget.trim().replace(/^<|>$/gu, "")
  const noFragment = trimmed.split("#")[0] || ""
  const noQuery = noFragment.split("?")[0] || ""
  return noQuery.replaceAll("\\", "/").trim()
}

export function resolveLinkPath(args: {
  sourceCanonicalPath: string
  target: string
  allCanonicalPaths: Set<string>
}): string | null {
  let normalizedTarget = normalizeLinkTarget(args.target)
  if (!normalizedTarget || isExternalTarget(normalizedTarget)) {
    return null
  }

  if (args.allCanonicalPaths.has(normalizedTarget)) {
    return normalizedTarget
  }

  const sourceDir = dirname(args.sourceCanonicalPath)
  let candidatePath = normalizedTarget
  if (normalizedTarget.startsWith("/")) {
    candidatePath = normalizedTarget.slice(1)
  } else {
    const baseDir = sourceDir === "." ? "" : sourceDir
    candidatePath = posix.join(baseDir, normalizedTarget)
  }

  candidatePath = posix.normalize(candidatePath)
  if (!candidatePath || candidatePath === "." || candidatePath === ".." || candidatePath.startsWith("../")) {
    return null
  }

  if (!candidatePath.toLowerCase().endsWith(".md")) {
    candidatePath = `${candidatePath}.md`
  }

  if (args.allCanonicalPaths.has(candidatePath)) {
    return candidatePath
  }

  const basenameTarget = candidatePath.split("/").at(-1)?.replace(/\.md$/iu, "").toLowerCase() || ""
  if (!basenameTarget) {
    return null
  }

  const candidates = [...args.allCanonicalPaths].filter((path) => path.split("/").at(-1)?.replace(/\.md$/iu, "").toLowerCase() === basenameTarget)
  if (candidates.length === 1) {
    return candidates[0]
  }

  return null
}
