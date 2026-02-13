export interface AgentLightningConfig {
  enabled: boolean
  storeUrl: string
  timeoutMs: number
  failOpenBackoffMs: number
  agentSyncEnabled: boolean
  agentSyncResourceName: string
}

function parseEnabled(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback
  }

  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    return fallback
  }

  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false
  }

  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true
  }

  return fallback
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }
  return parsed
}

function parseNonEmptyString(value: string | undefined, fallback: string): string {
  if (typeof value !== "string") {
    return fallback
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, "")
}

export function getAgentLightningConfig(): AgentLightningConfig {
  return {
    enabled: parseEnabled(process.env.AGENT_LIGHTNING_ENABLED, true),
    storeUrl: trimTrailingSlash(parseNonEmptyString(process.env.AGENT_LIGHTNING_STORE_URL, "http://127.0.0.1:4747")),
    timeoutMs: parsePositiveInt(process.env.AGENT_LIGHTNING_STORE_TIMEOUT_MS, 1500),
    failOpenBackoffMs: parsePositiveInt(process.env.AGENT_LIGHTNING_FAIL_OPEN_BACKOFF_MS, 30_000),
    agentSyncEnabled: parseEnabled(process.env.AGENT_LIGHTNING_AGENTSYNC_ENABLED, true),
    agentSyncResourceName: parseNonEmptyString(
      process.env.AGENT_LIGHTNING_AGENTSYNC_RESOURCE_NAME,
      "agentsync_guidance_template",
    ),
  }
}

