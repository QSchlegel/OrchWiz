export interface ParsedGuidanceEntry {
  content: string
  category: string | null
}

function normalizeContent(content: string): string {
  return content.replace(/\s+/g, " ").trim()
}

export function extractGuidanceEntries(markdown: string): ParsedGuidanceEntry[] {
  const lines = markdown.split(/\r?\n/)
  const entries: ParsedGuidanceEntry[] = []
  const seen = new Set<string>()
  let currentCategory: string | null = null

  const pushEntry = (rawContent: string) => {
    const normalized = normalizeContent(rawContent)
    if (!normalized) {
      return
    }

    const key = `${currentCategory || ""}::${normalized}`
    if (seen.has(key)) {
      return
    }

    seen.add(key)
    entries.push({
      content: normalized,
      category: currentCategory,
    })
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      continue
    }

    const headingMatch = line.match(/^#{2,6}\s+(.+)$/)
    if (headingMatch) {
      currentCategory = normalizeContent(headingMatch[1])
      continue
    }

    const bulletMatch = line.match(/^[-*+]\s+(.+)$/)
    if (bulletMatch) {
      pushEntry(bulletMatch[1])
      continue
    }

    const numberedMatch = line.match(/^\d+\.\s+(.+)$/)
    if (numberedMatch) {
      pushEntry(numberedMatch[1])
      continue
    }

    if (!line.startsWith("#") && !line.startsWith("```") && line.length > 24) {
      pushEntry(line)
    }
  }

  return entries
}
