export interface CuratedToolDefinition {
  slug: string
  name: string
  description: string
  repo: string
  sourcePath?: string
  sourceRef?: string
  sourceUrl?: string
}

export const CURATED_TOOLS: CuratedToolDefinition[] = [
  {
    slug: "camoufox",
    name: "Camoufox",
    description:
      "Stealth Firefox-based anti-detect browser toolkit for scraping and anti-bot evasion workflows.",
    repo: "daijro/camoufox",
    sourcePath: ".",
    sourceRef: "main",
    sourceUrl: "https://github.com/daijro/camoufox",
  },
]

export function findCuratedToolBySlug(slug: string): CuratedToolDefinition | null {
  const normalized = slug.trim().toLowerCase()
  return CURATED_TOOLS.find((entry) => entry.slug.toLowerCase() === normalized) || null
}
