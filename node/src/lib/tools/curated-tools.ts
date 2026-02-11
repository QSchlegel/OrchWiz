export interface CuratedToolDefinition {
  slug: string
  name: string
  description: string
  repo?: string | null
  sourcePath?: string | null
  sourceRef?: string | null
  sourceUrl?: string | null
  sourceUriEnvKey?: string
}

export interface ResolvedCuratedToolDefinition extends CuratedToolDefinition {
  repo: string | null
  sourcePath: string | null
  sourceRef: string | null
  sourceUrl: string | null
  available: boolean
  unavailableReason: string | null
}

const RAW_CURATED_TOOLS: CuratedToolDefinition[] = [
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
  {
    slug: "wallet-enclave",
    name: "Wallet Enclave Connector",
    description:
      "Wallet enclave runtime connector for signature tooling and secured key operations.",
    sourceUriEnvKey: "WALLET_ENCLAVE_TOOL_URI",
  },
  {
    slug: "data-core-connector",
    name: "Data Core Connector",
    description:
      "Data-core connector toolkit for memory retrieval and orchestration workflows.",
    sourceUriEnvKey: "DATA_CORE_CONNECTOR_TOOL_URI",
  },
]

function normalizeOptionalPath(path: string | null): string | null {
  if (!path) {
    return null
  }

  const normalized = path.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "")
  return normalized.length > 0 ? normalized : null
}

function parseGitHubToolUri(rawValue: string): {
  repo: string
  sourcePath: string | null
  sourceRef: string | null
  sourceUrl: string
} | null {
  const value = rawValue.trim()
  if (!value) {
    return null
  }

  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(value)) {
    return {
      repo: value,
      sourcePath: ".",
      sourceRef: "main",
      sourceUrl: `https://github.com/${value}`,
    }
  }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return null
  }

  if (parsed.protocol !== "https:" || parsed.hostname !== "github.com") {
    return null
  }

  const parts = parsed.pathname.split("/").filter(Boolean)
  if (parts.length < 2) {
    return null
  }

  const owner = parts[0]
  const repoName = parts[1].replace(/\.git$/iu, "")
  const repo = `${owner}/${repoName}`

  if (parts.length >= 4 && parts[2] === "tree") {
    const sourceRef = parts[3] || "main"
    const sourcePath = normalizeOptionalPath(parts.slice(4).join("/")) || "."
    return {
      repo,
      sourcePath,
      sourceRef,
      sourceUrl: value,
    }
  }

  return {
    repo,
    sourcePath: ".",
    sourceRef: "main",
    sourceUrl: value,
  }
}

function normalizeSourceUriFromEnv(tool: CuratedToolDefinition): {
  repo: string | null
  sourcePath: string | null
  sourceRef: string | null
  sourceUrl: string | null
  available: boolean
  unavailableReason: string | null
} {
  if (!tool.sourceUriEnvKey) {
    return {
      repo: tool.repo || null,
      sourcePath: normalizeOptionalPath(tool.sourcePath || ".") || ".",
      sourceRef: (tool.sourceRef || "main").trim(),
      sourceUrl: tool.sourceUrl || null,
      available: Boolean(tool.repo),
      unavailableReason: tool.repo ? null : "Missing curated repository configuration.",
    }
  }

  const rawUri = process.env[tool.sourceUriEnvKey]
  if (!rawUri || !rawUri.trim()) {
    return {
      repo: null,
      sourcePath: null,
      sourceRef: null,
      sourceUrl: null,
      available: false,
      unavailableReason: `Set ${tool.sourceUriEnvKey} to enable this curated tool.`,
    }
  }

  const parsed = parseGitHubToolUri(rawUri)
  if (!parsed) {
    return {
      repo: null,
      sourcePath: null,
      sourceRef: null,
      sourceUrl: rawUri.trim(),
      available: false,
      unavailableReason: `${tool.sourceUriEnvKey} must be a GitHub URL or owner/repo tuple.`,
    }
  }

  return {
    repo: parsed.repo,
    sourcePath: parsed.sourcePath,
    sourceRef: parsed.sourceRef,
    sourceUrl: parsed.sourceUrl,
    available: true,
    unavailableReason: null,
  }
}

export function resolveCuratedToolDefinition(tool: CuratedToolDefinition): ResolvedCuratedToolDefinition {
  const source = normalizeSourceUriFromEnv(tool)
  return {
    ...tool,
    repo: source.repo,
    sourcePath: source.sourcePath,
    sourceRef: source.sourceRef,
    sourceUrl: source.sourceUrl,
    available: source.available,
    unavailableReason: source.unavailableReason,
  }
}

export function listCuratedTools(): ResolvedCuratedToolDefinition[] {
  return RAW_CURATED_TOOLS.map(resolveCuratedToolDefinition)
}

export function findCuratedToolBySlug(slug: string): ResolvedCuratedToolDefinition | null {
  const normalized = slug.trim().toLowerCase()
  for (const rawTool of RAW_CURATED_TOOLS) {
    if (rawTool.slug.toLowerCase() === normalized) {
      return resolveCuratedToolDefinition(rawTool)
    }
  }
  return null
}

export const CURATED_TOOLS = RAW_CURATED_TOOLS
