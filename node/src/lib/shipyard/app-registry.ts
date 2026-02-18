import type { DeploymentProfile } from "@prisma/client"
import {
  defaultSpacebotLaunchIntent,
  normalizeSpacebotLaunchIntent,
  type SpacebotLaunchIntent,
} from "@/lib/shipyard/spacebot-launch-intent"

export const SHIP_RUNTIME_APP_IDS = [
  "opencode",
  "codex",
  "gemini-cli",
  "github-copilot",
  "amp",
  "kimi-cli",
] as const

export const SHIP_APP_IDS = ["n8n", "dokploy", "spacebot", ...SHIP_RUNTIME_APP_IDS] as const

export type ShipAppId = (typeof SHIP_APP_IDS)[number]
export type ShipRuntimeAppId = (typeof SHIP_RUNTIME_APP_IDS)[number]

export interface ShipAppRegistryBasicEntry<AppId extends ShipAppId = ShipAppId> {
  id: AppId
  enabled: boolean
}

export type ShipAppRegistryN8NEntry = ShipAppRegistryBasicEntry<"n8n">
export type ShipAppRegistryDokployEntry = ShipAppRegistryBasicEntry<"dokploy">
export type ShipAppRegistryRuntimeEntry<AppId extends ShipRuntimeAppId = ShipRuntimeAppId> =
  ShipAppRegistryBasicEntry<AppId>

export interface ShipAppRegistrySpacebotEntry extends SpacebotLaunchIntent {
  id: "spacebot"
}

export type ShipAppRegistryEntry =
  | ShipAppRegistryN8NEntry
  | ShipAppRegistryDokployEntry
  | ShipAppRegistrySpacebotEntry

export interface ShipAppRegistry {
  n8n: ShipAppRegistryN8NEntry
  dokploy: ShipAppRegistryDokployEntry
  spacebot: ShipAppRegistrySpacebotEntry
  opencode: ShipAppRegistryRuntimeEntry<"opencode">
  codex: ShipAppRegistryRuntimeEntry<"codex">
  "gemini-cli": ShipAppRegistryRuntimeEntry<"gemini-cli">
  "github-copilot": ShipAppRegistryRuntimeEntry<"github-copilot">
  amp: ShipAppRegistryRuntimeEntry<"amp">
  "kimi-cli": ShipAppRegistryRuntimeEntry<"kimi-cli">
}

interface ShipAppRegistryNormalizationInput {
  appRegistry?: unknown
  initialApplications?: unknown
  spacebot?: unknown
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value
  }
  return null
}

function hasOwn(target: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key)
}

function parseEnabled(value: unknown): boolean | null {
  const direct = asBoolean(value)
  if (direct !== null) {
    return direct
  }
  const record = asRecord(value)
  return asBoolean(record.enabled)
}

function buildSpacebotEntry(intent: SpacebotLaunchIntent): ShipAppRegistrySpacebotEntry {
  return {
    id: "spacebot",
    enabled: intent.enabled,
    stack: intent.stack,
    launchRequirement: intent.launchRequirement,
    agentRuntimes: [...intent.agentRuntimes],
  }
}

function buildDefaultSpacebotEntry(): ShipAppRegistrySpacebotEntry {
  return buildSpacebotEntry(defaultSpacebotLaunchIntent())
}

function buildDefaultRuntimeEntry<AppId extends ShipRuntimeAppId>(
  id: AppId,
): ShipAppRegistryRuntimeEntry<AppId> {
  return {
    id,
    enabled: false,
  }
}

export function defaultShipAppRegistry(deploymentProfile: DeploymentProfile): ShipAppRegistry {
  return {
    n8n: {
      id: "n8n",
      enabled: true,
    },
    dokploy: {
      id: "dokploy",
      enabled: deploymentProfile === "lightweight_shuttle",
    },
    spacebot: buildDefaultSpacebotEntry(),
    opencode: buildDefaultRuntimeEntry("opencode"),
    codex: buildDefaultRuntimeEntry("codex"),
    "gemini-cli": buildDefaultRuntimeEntry("gemini-cli"),
    "github-copilot": buildDefaultRuntimeEntry("github-copilot"),
    amp: buildDefaultRuntimeEntry("amp"),
    "kimi-cli": buildDefaultRuntimeEntry("kimi-cli"),
  }
}

export function normalizeShipAppRegistry(
  input: ShipAppRegistryNormalizationInput,
  deploymentProfile: DeploymentProfile,
): ShipAppRegistry {
  const defaults = defaultShipAppRegistry(deploymentProfile)
  const normalized: ShipAppRegistry = {
    n8n: { ...defaults.n8n },
    dokploy: { ...defaults.dokploy },
    spacebot: { ...defaults.spacebot },
    opencode: { ...defaults.opencode },
    codex: { ...defaults.codex },
    "gemini-cli": { ...defaults["gemini-cli"] },
    "github-copilot": { ...defaults["github-copilot"] },
    amp: { ...defaults.amp },
    "kimi-cli": { ...defaults["kimi-cli"] },
  }

  const legacyInitial = asRecord(input.initialApplications)
  const legacyN8NEnabled = asBoolean(legacyInitial.n8n)
  const legacyDokployEnabled = asBoolean(legacyInitial.dokploy)
  if (legacyN8NEnabled !== null) {
    normalized.n8n.enabled = legacyN8NEnabled
  }
  if (legacyDokployEnabled !== null) {
    normalized.dokploy.enabled = legacyDokployEnabled
  }

  const legacySpacebot = normalizeSpacebotLaunchIntent(input.spacebot)
  if (legacySpacebot) {
    normalized.spacebot = buildSpacebotEntry(legacySpacebot)
  }

  const registryRecord = asRecord(input.appRegistry)

  if (hasOwn(registryRecord, "n8n")) {
    const enabled = parseEnabled(registryRecord.n8n)
    if (enabled !== null) {
      normalized.n8n.enabled = enabled
    }
  }

  if (hasOwn(registryRecord, "dokploy")) {
    const enabled = parseEnabled(registryRecord.dokploy)
    if (enabled !== null) {
      normalized.dokploy.enabled = enabled
    }
  }

  for (const runtimeId of SHIP_RUNTIME_APP_IDS) {
    if (hasOwn(registryRecord, runtimeId)) {
      const enabled = parseEnabled(registryRecord[runtimeId])
      if (enabled !== null) {
        normalized[runtimeId].enabled = enabled
      }
    }
  }

  if (hasOwn(registryRecord, "spacebot")) {
    const registrySpacebotIntent = normalizeSpacebotLaunchIntent(registryRecord.spacebot)
    if (registrySpacebotIntent) {
      normalized.spacebot = buildSpacebotEntry(registrySpacebotIntent)
    } else {
      const enabled = parseEnabled(registryRecord.spacebot)
      if (enabled !== null) {
        normalized.spacebot.enabled = enabled
      }
    }
  }

  return normalized
}

export function countEnabledShipApps(registry: ShipAppRegistry): number {
  let total = 0
  for (const appId of SHIP_APP_IDS) {
    if (appId === "spacebot") {
      if (registry.spacebot.enabled) {
        total += 1
      }
      continue
    }
    if (registry[appId].enabled) {
      total += 1
    }
  }
  return total
}

export function readShipAppRegistryFromConfig(
  config: unknown,
  deploymentProfile: DeploymentProfile,
): ShipAppRegistry {
  const configRecord = asRecord(config)
  return normalizeShipAppRegistry(
    {
      appRegistry: configRecord.appRegistry,
      initialApplications: configRecord.initialApplications,
      spacebot: configRecord.spacebot,
    },
    deploymentProfile,
  )
}

export function withSanitizedShipAppRegistryConfig(args: {
  config: Record<string, unknown>
  deploymentProfile: DeploymentProfile
  rawAppRegistry?: unknown
  rawInitialApplications?: unknown
  rawSpacebot?: unknown
}): Record<string, unknown> {
  const configRecord = asRecord(args.config)
  const {
    appRegistry: _ignoredRegistry,
    initialApplications: _ignoredInitialApplications,
    spacebot: _ignoredSpacebot,
    ...configWithoutLegacyAppShape
  } = configRecord

  const appRegistry = normalizeShipAppRegistry(
    {
      appRegistry: args.rawAppRegistry !== undefined ? args.rawAppRegistry : configRecord.appRegistry,
      initialApplications:
        args.rawInitialApplications !== undefined
          ? args.rawInitialApplications
          : configRecord.initialApplications,
      spacebot: args.rawSpacebot !== undefined ? args.rawSpacebot : configRecord.spacebot,
    },
    args.deploymentProfile,
  )

  return {
    ...configWithoutLegacyAppShape,
    appRegistry,
  }
}
