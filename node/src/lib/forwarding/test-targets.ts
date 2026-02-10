function normalizeEntry(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function defaultAllowlistEntries(): string[] {
  return ["localhost", "127.0.0.1", "::1"]
}

export function configuredForwardingTestTargetAllowlist(): string[] {
  const configured = process.env.FORWARDING_TEST_TARGET_ALLOWLIST
  if (!configured || !configured.trim()) {
    return defaultAllowlistEntries()
  }

  const entries = configured
    .split(",")
    .map((entry) => normalizeEntry(entry))
    .filter((entry): entry is string => Boolean(entry))

  return entries.length > 0 ? entries : defaultAllowlistEntries()
}

function normalizeTargetUrl(value: string): URL {
  return new URL(value.trim())
}

function entryMatchesUrl(entry: string, target: URL): boolean {
  const normalizedEntry = entry.toLowerCase()
  const targetHost = target.hostname.toLowerCase()
  const targetOrigin = target.origin.toLowerCase()

  if (normalizedEntry === targetHost || normalizedEntry === targetOrigin) {
    return true
  }

  if (normalizedEntry.startsWith(".")) {
    return targetHost.endsWith(normalizedEntry)
  }

  return false
}

export function isForwardingTestTargetAllowed(targetUrl: string, allowlist: string[]): boolean {
  let parsed: URL
  try {
    parsed = normalizeTargetUrl(targetUrl)
  } catch {
    return false
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return false
  }

  for (const entry of allowlist) {
    if (entryMatchesUrl(entry, parsed)) {
      return true
    }
  }

  return false
}
