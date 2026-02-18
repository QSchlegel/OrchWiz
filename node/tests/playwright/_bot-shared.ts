const DEFAULT_BASE_URL = "http://127.0.0.1:3000"

type BotMode = "smoke" | "full" | "custom"

interface ParsedTargetResult {
  url: string
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
