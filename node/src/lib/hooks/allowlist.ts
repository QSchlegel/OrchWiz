const DEFAULT_HOOK_WEBHOOK_TARGET_ALLOWLIST = ["localhost", "127.0.0.1", "::1"]
const NGROK_HOOK_WEBHOOK_TARGET_ALLOWLIST = [".ngrok-free.app", ".ngrok.app", ".ngrok.io"]

function asBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  const normalized = value.trim().toLowerCase()
  if (["1", "true", "yes", "on"].includes(normalized)) return true
  if (["0", "false", "no", "off"].includes(normalized)) return false
  return fallback
}

function allowNgrokWebhookTargets(): boolean {
  return asBoolean(process.env.HOOK_WEBHOOK_ALLOW_NGROK, false)
}

function normalizeAllowlistEntry(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  return trimmed.toLowerCase()
}

export function configuredHookWebhookTargetAllowlist(): string[] {
  const configured = process.env.HOOK_WEBHOOK_TARGET_ALLOWLIST
  const parsed = (!configured || !configured.trim())
    ? [...DEFAULT_HOOK_WEBHOOK_TARGET_ALLOWLIST]
    : configured
        .split(",")
        .map((entry) => normalizeAllowlistEntry(entry))
        .filter((entry): entry is string => Boolean(entry))

  const baseAllowlist = parsed.length > 0 ? parsed : [...DEFAULT_HOOK_WEBHOOK_TARGET_ALLOWLIST]
  if (!allowNgrokWebhookTargets()) {
    return baseAllowlist
  }

  for (const entry of NGROK_HOOK_WEBHOOK_TARGET_ALLOWLIST) {
    if (!baseAllowlist.includes(entry)) {
      baseAllowlist.push(entry)
    }
  }

  return baseAllowlist
}

export function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase()
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]"
}

function entryMatchesUrl(entry: string, target: URL): boolean {
  const targetHost = target.hostname.toLowerCase()
  const targetOrigin = target.origin.toLowerCase()

  if (entry === targetHost || entry === targetOrigin) {
    return true
  }

  if (entry.startsWith(".")) {
    return targetHost.endsWith(entry)
  }

  return false
}

export function parseHookWebhookUrl(targetUrl: string): URL {
  return new URL(targetUrl.trim())
}

export function isHookWebhookProtocolAllowed(target: URL): boolean {
  if (target.protocol === "https:") {
    return true
  }

  return target.protocol === "http:" && isLoopbackHostname(target.hostname)
}

export function isHookWebhookTargetAllowed(targetUrl: string, allowlist: string[]): boolean {
  let parsed: URL
  try {
    parsed = parseHookWebhookUrl(targetUrl)
  } catch {
    return false
  }

  if (!isHookWebhookProtocolAllowed(parsed)) {
    return false
  }

  const normalizedAllowlist = allowlist.map((entry) => entry.toLowerCase())
  for (const entry of normalizedAllowlist) {
    if (entryMatchesUrl(entry, parsed)) {
      return true
    }
  }

  return false
}
