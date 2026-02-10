import type { RuntimeRequest, RuntimeProvider } from "@/lib/types/runtime"

export type RuntimeProfileName = "default" | "quartermaster"

const KNOWN_PROVIDER_SET = new Set<RuntimeProvider>([
  "openclaw",
  "openai-fallback",
  "local-fallback",
  "codex-cli",
])

const DEFAULT_PROFILE_CHAIN: Record<RuntimeProfileName, RuntimeProvider[]> = {
  default: ["openclaw", "openai-fallback", "local-fallback"],
  quartermaster: ["codex-cli", "openclaw", "openai-fallback", "local-fallback"],
}

const PROFILE_ENV_KEYS: Record<RuntimeProfileName, string> = {
  default: "RUNTIME_PROFILE_DEFAULT",
  quartermaster: "RUNTIME_PROFILE_QUARTERMASTER",
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {}
  }
  return value as Record<string, unknown>
}

function normalizeProviderId(value: string): RuntimeProvider | null {
  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    return null
  }

  if (KNOWN_PROVIDER_SET.has(normalized as RuntimeProvider)) {
    return normalized as RuntimeProvider
  }

  return null
}

function uniqueProviders(input: RuntimeProvider[]): RuntimeProvider[] {
  const seen = new Set<RuntimeProvider>()
  const result: RuntimeProvider[] = []

  for (const providerId of input) {
    if (seen.has(providerId)) {
      continue
    }

    seen.add(providerId)
    result.push(providerId)
  }

  return result
}

function parseProfileOverride(raw: string | undefined, profile: RuntimeProfileName): RuntimeProvider[] | null {
  if (!raw || !raw.trim()) {
    return null
  }

  const providers: RuntimeProvider[] = []
  const unknownProviders: string[] = []

  for (const entry of raw.split(",")) {
    const trimmed = entry.trim()
    if (!trimmed) {
      continue
    }

    const normalized = normalizeProviderId(trimmed)
    if (!normalized) {
      unknownProviders.push(trimmed)
      continue
    }

    providers.push(normalized)
  }

  if (unknownProviders.length > 0) {
    console.warn("Ignoring unknown runtime providers in profile override", {
      profile,
      unknownProviders,
    })
  }

  if (providers.length === 0) {
    return null
  }

  return uniqueProviders(providers)
}

export function resolveRuntimeProfileName(metadata?: Record<string, unknown>): RuntimeProfileName {
  const metadataRecord = asRecord(metadata)
  const runtimeRecord = asRecord(metadataRecord.runtime)
  const rawProfile = typeof runtimeRecord.profile === "string" ? runtimeRecord.profile.trim().toLowerCase() : ""

  if (rawProfile === "quartermaster") {
    return "quartermaster"
  }

  return "default"
}

export function resolveRuntimeProviderOrder(profile: RuntimeProfileName): RuntimeProvider[] {
  const envKey = PROFILE_ENV_KEYS[profile]
  const override = parseProfileOverride(process.env[envKey], profile)
  const baseOrder = override || DEFAULT_PROFILE_CHAIN[profile]
  const deduped = uniqueProviders(baseOrder)

  if (!deduped.includes("local-fallback")) {
    deduped.push("local-fallback")
  }

  return deduped
}

export function resolveRuntimeProfileConfig(request: RuntimeRequest): {
  profile: RuntimeProfileName
  providerOrder: RuntimeProvider[]
} {
  const profile = resolveRuntimeProfileName(request.metadata)
  return {
    profile,
    providerOrder: resolveRuntimeProviderOrder(profile),
  }
}
