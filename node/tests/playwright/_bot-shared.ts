const DEFAULT_BASE_URL = "http://127.0.0.1:3000"
const DEFAULT_AUTH_EMAIL_PREFIX = "orchwiz.bot"
const DEFAULT_AUTH_EMAIL_DOMAIN = "example.com"
const DEFAULT_AUTH_DISPLAY_NAME = "OrchWiz Bot"

type BotMode = "smoke" | "full" | "custom"

interface ParsedTargetResult {
  url: string
}

export interface BotAuthIdentity {
  emailPrefix: string
  emailDomain: string
  displayName: string
  runId: string
}

function sanitizeSegment(raw: string, fallback: string): string {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "")

  return normalized || fallback
}

function normalizeEmailDomain(raw: string, fallback: string): string {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/gu, "")
    .replace(/^\.+|\.+$/gu, "")
    .replace(/\.\.+/gu, ".")

  if (!normalized.includes(".")) {
    return fallback
  }

  return normalized || fallback
}

export function parseBotMode(raw: string | undefined): BotMode {
  const normalized = raw?.trim().toLowerCase()
  if (normalized === "smoke" || normalized === "full" || normalized === "custom") {
    return normalized
  }

  return "smoke"
}

export function normalizeBaseUrl(raw: string | undefined): string {
  const value = (raw || DEFAULT_BASE_URL).trim()
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`Invalid ORCHWIZ_BOT_BASE_URL: ${value}`)
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("ORCHWIZ_BOT_BASE_URL must be http or https.")
  }

  return parsed.toString().replace(/\/+$/u, "")
}

export function parseTargetUrls(raw: string | undefined): ParsedTargetResult[] {
  const value = (raw || "").trim()
  if (!value) {
    return []
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry): entry is string => entry.length > 0)
    .map((url) => ({ url }))
}

export function resolveBotRunId(raw: string | undefined): string {
  const fromEnv = raw ? sanitizeSegment(raw, "") : ""
  if (fromEnv) {
    return fromEnv
  }

  const now = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 8)
  return `run-${now}-${random}`
}

export function resolveBotAuthIdentity(env: NodeJS.ProcessEnv = process.env): BotAuthIdentity {
  const emailPrefix = sanitizeSegment(env.PW_BOT_AUTH_EMAIL_PREFIX || DEFAULT_AUTH_EMAIL_PREFIX, DEFAULT_AUTH_EMAIL_PREFIX)
  const emailDomain = normalizeEmailDomain(env.PW_BOT_AUTH_EMAIL_DOMAIN || DEFAULT_AUTH_EMAIL_DOMAIN, DEFAULT_AUTH_EMAIL_DOMAIN)
  const displayName = (env.PW_BOT_AUTH_DISPLAY_NAME || DEFAULT_AUTH_DISPLAY_NAME).trim() || DEFAULT_AUTH_DISPLAY_NAME
  const runId = resolveBotRunId(env.PW_BOT_RUN_ID)

  return {
    emailPrefix,
    emailDomain,
    displayName,
    runId,
  }
}

export function buildBotAuthEmail(
  identity: BotAuthIdentity,
  options?: {
    tag?: string
    retry?: number
    workerIndex?: number
  },
): string {
  const segments = [identity.runId]
  if (typeof options?.workerIndex === "number") {
    segments.push(`w${options.workerIndex}`)
  }
  if (typeof options?.retry === "number") {
    segments.push(`r${options.retry}`)
  }
  if (options?.tag) {
    segments.push(options.tag)
  }

  const suffix = segments
    .map((segment) => sanitizeSegment(segment, "x"))
    .filter((segment) => segment.length > 0)
    .join("-")

  return `${identity.emailPrefix}+${suffix}@${identity.emailDomain}`
}
