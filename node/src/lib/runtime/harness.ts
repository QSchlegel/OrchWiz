import { prisma } from "@/lib/prisma"
import { loadSubagentContextFiles } from "@/lib/subagents/context-files"
import { normalizeSubagentSettings, type HarnessRuntimeProfile } from "@/lib/subagents/settings"
import { resolveWorkspaceRootForSubagents } from "@/lib/subagents/workspace-inspector"

const MAX_CONTEXT_FILES = 6
const MAX_CONTEXT_CHARS_PER_FILE = 1_200
const MAX_CONTEXT_TOTAL_CHARS = 5_000

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

function trimForPrompt(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value
  }

  return `${value.slice(0, maxChars - 18).trimEnd()}\n...[trimmed]`
}

function formatContextBlock(input: {
  source: "filesystem" | "content-fallback"
  rootPath: string | null
  files: Array<{
    fileName: string
    content: string
    size: {
      estimatedTokens: number
    }
  }>
}): string | null {
  if (input.files.length === 0) {
    return null
  }

  const lines = [
    "Harness Context Pack:",
    `Source: ${input.source}${input.rootPath ? ` (${input.rootPath})` : ""}`,
  ]

  let remainingChars = MAX_CONTEXT_TOTAL_CHARS
  const visibleFiles = input.files.slice(0, MAX_CONTEXT_FILES)
  for (const file of visibleFiles) {
    if (remainingChars <= 0) {
      break
    }

    const snippet = trimForPrompt(file.content, Math.min(MAX_CONTEXT_CHARS_PER_FILE, remainingChars))
    remainingChars -= snippet.length
    lines.push(`## ${file.fileName} (~${Math.max(0, Math.round(file.size.estimatedTokens))} tokens)`)
    lines.push(snippet || "(empty)")
  }

  if (input.files.length > visibleFiles.length) {
    lines.push(`...${input.files.length - visibleFiles.length} additional context files omitted.`)
  }

  return lines.join("\n")
}

function formatToolsBlock(input: Array<{
  slug: string
  name: string
  description: string | null
  source: "curated" | "custom_github" | "local" | "system"
}>): string | null {
  if (input.length === 0) {
    return null
  }

  const lines = ["Harness Tools (agent-bound):"]
  for (const tool of input.slice(0, 16)) {
    lines.push(`- ${tool.slug} [${tool.source}]${tool.description ? `: ${tool.description}` : ""}`)
  }
  if (input.length > 16) {
    lines.push(`...${input.length - 16} additional bound tools omitted.`)
  }

  return lines.join("\n")
}

function formatSkillsBlock(input: Array<{
  policyId: string
  priority: number
  policy: {
    slug: string
    name: string
    description: string | null
    _count: {
      rules: number
    }
  }
}>): string | null {
  if (input.length === 0) {
    return null
  }

  const lines = ["Harness Skills (policy profiles):"]
  const sorted = [...input].sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority
    }
    return left.policy.slug.localeCompare(right.policy.slug)
  })

  for (const assignment of sorted.slice(0, 16)) {
    lines.push(
      `- ${assignment.policy.name} (${assignment.policy.slug}) priority=${assignment.priority} rules=${assignment.policy._count.rules}`,
    )
  }
  if (sorted.length > 16) {
    lines.push(`...${sorted.length - 16} additional profile bindings omitted.`)
  }

  return lines.join("\n")
}

export function agentHarnessPodEnabled(): boolean {
  const raw = (process.env.ENABLE_AGENT_HARNESS_POD || "").trim().toLowerCase()
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on"
}

export interface ResolveHarnessPodContextArgs {
  userId: string
  subagentId: string
}

export interface ResolveHarnessPodContextResult {
  runtimeProfile: HarnessRuntimeProfile | null
  promptFragments: string[]
  warnings: string[]
}

interface HarnessSubagentRecord {
  id: string
  name: string
  path: string | null
  content: string
  settings: unknown
}

interface HarnessDeps {
  enabled: () => boolean
  resolveWorkspaceRoot: () => string
  loadSubagent: (args: { userId: string; subagentId: string }) => Promise<HarnessSubagentRecord | null>
  loadContextFiles: typeof loadSubagentContextFiles
  listEnabledToolBindings: (subagentId: string) => Promise<Array<{
    toolCatalogEntry: {
      slug: string
      name: string
      description: string | null
      source: "curated" | "custom_github" | "local" | "system"
    }
  }>>
  listEnabledSkillPolicies: (subagentId: string) => Promise<Array<{
    policyId: string
    priority: number
    policy: {
      slug: string
      name: string
      description: string | null
      _count: {
        rules: number
      }
    }
  }>>
}

const defaultDeps: HarnessDeps = {
  enabled: agentHarnessPodEnabled,
  resolveWorkspaceRoot: resolveWorkspaceRootForSubagents,
  loadSubagent: async ({ userId, subagentId }) =>
    prisma.subagent.findFirst({
      where: {
        id: subagentId,
        OR: [
          { ownerUserId: userId },
          { isShared: true },
        ],
      },
      select: {
        id: true,
        name: true,
        path: true,
        content: true,
        settings: true,
      },
    }),
  loadContextFiles: loadSubagentContextFiles,
  listEnabledToolBindings: async (subagentId) =>
    (prisma as unknown as {
      subagentToolBinding: {
        findMany: (args: unknown) => Promise<Array<{
          toolCatalogEntry: {
            slug: string
            name: string
            description: string | null
            source: "curated" | "custom_github" | "local" | "system"
          }
        }>>
      }
    }).subagentToolBinding.findMany({
      where: {
        subagentId,
        enabled: true,
        toolCatalogEntry: {
          isInstalled: true,
          activationStatus: "approved",
        },
      },
      select: {
        toolCatalogEntry: {
          select: {
            slug: true,
            name: true,
            description: true,
            source: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
      take: 20,
    }),
  listEnabledSkillPolicies: async (subagentId) =>
    prisma.subagentPermissionPolicy.findMany({
      where: {
        subagentId,
        enabled: true,
      },
      select: {
        policyId: true,
        priority: true,
        policy: {
          select: {
            slug: true,
            name: true,
            description: true,
            _count: {
              select: {
                rules: true,
              },
            },
          },
        },
      },
      orderBy: {
        priority: "asc",
      },
      take: 20,
    }),
}

export async function resolveHarnessPodContext(
  args: ResolveHarnessPodContextArgs,
  deps: HarnessDeps = defaultDeps,
): Promise<ResolveHarnessPodContextResult> {
  if (!deps.enabled()) {
    return {
      runtimeProfile: null,
      promptFragments: [],
      warnings: [],
    }
  }

  const warnings: string[] = []
  const promptFragments: string[] = []

  const subagent = await deps.loadSubagent({
    userId: args.userId,
    subagentId: args.subagentId,
  })
  if (!subagent) {
    warnings.push(`Harness: subagent not found (${args.subagentId}).`)
    return {
      runtimeProfile: null,
      promptFragments,
      warnings,
    }
  }

  const settings = normalizeSubagentSettings(asRecord(subagent.settings))
  const harness = settings.harness
  if (!harness.applyWhenSubagentPresent) {
    return {
      runtimeProfile: null,
      promptFragments,
      warnings,
    }
  }

  if (harness.autoload.context) {
    try {
      const contextPack = await deps.loadContextFiles({
        repoRoot: deps.resolveWorkspaceRoot(),
        subagent: {
          name: subagent.name,
          path: subagent.path,
          content: subagent.content,
        },
      })

      const block = formatContextBlock(contextPack)
      if (block) {
        promptFragments.push(block)
      }
    } catch (error) {
      warnings.push(`Harness context autoload failed: ${(error as Error)?.message || "unknown error"}`)
    }
  }

  if (harness.autoload.tools) {
    try {
      const boundTools = await deps.listEnabledToolBindings(subagent.id)
      const block = formatToolsBlock(boundTools.map((entry) => entry.toolCatalogEntry))
      if (block) {
        promptFragments.push(block)
      }
    } catch (error) {
      warnings.push(`Harness tools autoload failed: ${(error as Error)?.message || "unknown error"}`)
    }
  }

  if (harness.autoload.skills) {
    try {
      const policies = await deps.listEnabledSkillPolicies(subagent.id)
      const block = formatSkillsBlock(policies)
      if (block) {
        promptFragments.push(block)
      }
    } catch (error) {
      warnings.push(`Harness skills autoload failed: ${(error as Error)?.message || "unknown error"}`)
    }
  }

  return {
    runtimeProfile: harness.runtimeProfile,
    promptFragments,
    warnings,
  }
}
