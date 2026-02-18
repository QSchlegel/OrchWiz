export type SpacebotLaunchStack = "dev-local" | "cloudflare-local"

export type SpacebotLaunchRequirement = "require_running"

export const SPACEBOT_AGENT_RUNTIME_VALUES = [
  "opencode",
  "codex",
  "gemini-cli",
  "github-copilot",
  "amp",
  "kimi-cli",
] as const

export type SpacebotAgentRuntime = (typeof SPACEBOT_AGENT_RUNTIME_VALUES)[number]

export interface SpacebotLaunchIntent {
  enabled: boolean
  stack: SpacebotLaunchStack
  launchRequirement: SpacebotLaunchRequirement
  agentRuntimes: SpacebotAgentRuntime[]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value
  }
  return null
}

function parseStack(value: unknown): SpacebotLaunchStack | null {
  if (value === "dev-local" || value === "cloudflare-local") {
    return value
  }
  return null
}

function parseLaunchRequirement(value: unknown): SpacebotLaunchRequirement | null {
  if (value === "require_running") {
    return value
  }
  return null
}

function parseAgentRuntimes(value: unknown): SpacebotAgentRuntime[] {
  if (!Array.isArray(value)) {
    return []
  }

  const allowed = new Set<string>(SPACEBOT_AGENT_RUNTIME_VALUES)
  const seen = new Set<SpacebotAgentRuntime>()
  const result: SpacebotAgentRuntime[] = []

  for (const entry of value) {
    if (typeof entry !== "string") {
      continue
    }

    const normalized = entry.trim().toLowerCase()
    if (!allowed.has(normalized)) {
      continue
    }

    const runtime = normalized as SpacebotAgentRuntime
    if (seen.has(runtime)) {
      continue
    }

    seen.add(runtime)
    result.push(runtime)
  }

  return result
}

export function defaultSpacebotLaunchIntent(): SpacebotLaunchIntent {
  return {
    enabled: false,
    stack: "cloudflare-local",
    launchRequirement: "require_running",
    agentRuntimes: [],
  }
}

export function normalizeSpacebotLaunchIntent(value: unknown): SpacebotLaunchIntent | null {
  const record = asRecord(value)
  if (!record) {
    return null
  }

  const enabled = asBoolean(record.enabled)
  if (enabled === null) {
    return null
  }

  return {
    enabled,
    stack: parseStack(record.stack) || "cloudflare-local",
    launchRequirement: parseLaunchRequirement(record.launchRequirement) || "require_running",
    agentRuntimes: parseAgentRuntimes(record.agentRuntimes),
  }
}
