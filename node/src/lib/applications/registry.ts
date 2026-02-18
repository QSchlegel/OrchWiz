import type { ApplicationType } from "@/lib/applications/view-model"

export type AppRegistryApplicationType = ApplicationType

export interface AppRegistryEntry {
  id: string
  name: string
  description: string
  applicationType: AppRegistryApplicationType
  image: string
  repository: string
  branch: string
  buildCommand: string
  startCommand: string
  port: number
  version: string
  createdAt: string
  showInLaunchWizard: boolean
  system: boolean
}

export const APP_REGISTRY_STORAGE_KEY = "orchwiz:app-registry"

const DEFAULT_CREATED_AT = "2026-01-01T00:00:00.000Z"
const APP_REGISTRY_SYSTEM_IDS = [
  "n8n",
  "dokploy",
  "spacebot",
  "opencode",
  "codex",
  "gemini-cli",
  "github-copilot",
  "amp",
  "kimi-cli",
] as const

const APP_TYPE_VALUES: ReadonlySet<AppRegistryApplicationType> = new Set([
  "docker",
  "nodejs",
  "python",
  "static",
  "n8n",
  "custom",
])

const KNOWN_SYSTEM_ID_BY_NAME: ReadonlyMap<string, (typeof APP_REGISTRY_SYSTEM_IDS)[number]> = new Map([
  ["n8n", "n8n"],
  ["dokploy", "dokploy"],
  ["spacebot", "spacebot"],
  ["opencode", "opencode"],
  ["codex", "codex"],
  ["gemini-cli", "gemini-cli"],
  ["github-copilot", "github-copilot"],
  ["amp", "amp"],
  ["kimi-cli", "kimi-cli"],
])

const DEFAULT_APP_REGISTRY_ENTRIES: ReadonlyArray<AppRegistryEntry> = [
  {
    id: "n8n",
    name: "n8n",
    description: "Workflow automation + curated tool bridge bootstrap.",
    applicationType: "n8n",
    image: "",
    repository: "",
    branch: "main",
    buildCommand: "",
    startCommand: "",
    port: 5678,
    version: "",
    createdAt: DEFAULT_CREATED_AT,
    showInLaunchWizard: true,
    system: true,
  },
  {
    id: "dokploy",
    name: "Dokploy",
    description: "Staging deploy control plane (connect-only for local profile, provisioning later).",
    applicationType: "docker",
    image: "",
    repository: "",
    branch: "main",
    buildCommand: "",
    startCommand: "",
    port: 3000,
    version: "",
    createdAt: DEFAULT_CREATED_AT,
    showInLaunchWizard: true,
    system: true,
  },
  {
    id: "spacebot",
    name: "Spacebot",
    description: "Agent runtime app with webhook connector controls for ship launch.",
    applicationType: "docker",
    image: "",
    repository: "",
    branch: "main",
    buildCommand: "",
    startCommand: "",
    port: 3000,
    version: "",
    createdAt: DEFAULT_CREATED_AT,
    showInLaunchWizard: true,
    system: true,
  },
  {
    id: "opencode",
    name: "opencode",
    description: "Dedicated agent runtime app for opencode sessions.",
    applicationType: "custom",
    image: "",
    repository: "",
    branch: "main",
    buildCommand: "",
    startCommand: "opencode",
    port: 3000,
    version: "",
    createdAt: DEFAULT_CREATED_AT,
    showInLaunchWizard: true,
    system: true,
  },
  {
    id: "codex",
    name: "codex",
    description: "Dedicated agent runtime app for Codex sessions.",
    applicationType: "custom",
    image: "",
    repository: "",
    branch: "main",
    buildCommand: "",
    startCommand: "codex",
    port: 3000,
    version: "",
    createdAt: DEFAULT_CREATED_AT,
    showInLaunchWizard: true,
    system: true,
  },
  {
    id: "gemini-cli",
    name: "gemini-cli",
    description: "Dedicated agent runtime app for Gemini CLI sessions.",
    applicationType: "custom",
    image: "",
    repository: "",
    branch: "main",
    buildCommand: "",
    startCommand: "gemini-cli",
    port: 3000,
    version: "",
    createdAt: DEFAULT_CREATED_AT,
    showInLaunchWizard: true,
    system: true,
  },
  {
    id: "github-copilot",
    name: "github-copilot",
    description: "Dedicated agent runtime app for GitHub Copilot CLI sessions.",
    applicationType: "custom",
    image: "",
    repository: "",
    branch: "main",
    buildCommand: "",
    startCommand: "github-copilot",
    port: 3000,
    version: "",
    createdAt: DEFAULT_CREATED_AT,
    showInLaunchWizard: true,
    system: true,
  },
  {
    id: "amp",
    name: "amp",
    description: "Dedicated agent runtime app for Amp CLI sessions.",
    applicationType: "custom",
    image: "",
    repository: "",
    branch: "main",
    buildCommand: "",
    startCommand: "amp",
    port: 3000,
    version: "",
    createdAt: DEFAULT_CREATED_AT,
    showInLaunchWizard: true,
    system: true,
  },
  {
    id: "kimi-cli",
    name: "kimi-cli",
    description: "Dedicated agent runtime app for Kimi CLI sessions.",
    applicationType: "custom",
    image: "",
    repository: "",
    branch: "main",
    buildCommand: "",
    startCommand: "kimi-cli",
    port: 3000,
    version: "",
    createdAt: DEFAULT_CREATED_AT,
    showInLaunchWizard: true,
    system: true,
  },
]

const DEFAULT_ENTRY_BY_ID = new Map(DEFAULT_APP_REGISTRY_ENTRIES.map((entry) => [entry.id, entry] as const))

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function isAppRegistryApplicationType(value: unknown): value is AppRegistryApplicationType {
  return typeof value === "string" && APP_TYPE_VALUES.has(value as AppRegistryApplicationType)
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null
}

function defaultPortForApplicationType(applicationType: AppRegistryApplicationType): number {
  if (applicationType === "n8n") {
    return 5678
  }
  return 3000
}

function normalizeRegistryPort(value: unknown, applicationType: AppRegistryApplicationType): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value)
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }

  return defaultPortForApplicationType(applicationType)
}

function normalizeId(rawId: unknown, name: string, index: number): string {
  if (typeof rawId === "string" && rawId.trim().length > 0) {
    return rawId.trim()
  }

  const normalizedName = name.trim().toLowerCase()
  const knownId = KNOWN_SYSTEM_ID_BY_NAME.get(normalizedName)
  if (knownId) {
    return knownId
  }

  const slug = normalizedName.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  if (slug.length > 0) {
    return `registry-${slug}-${index + 1}`
  }

  return `registry-entry-${index + 1}`
}

function normalizeCreatedAt(value: unknown): string {
  if (typeof value === "string" && value.trim().length > 0) {
    const timestamp = new Date(value).getTime()
    if (Number.isFinite(timestamp)) {
      return value
    }
  }
  return new Date().toISOString()
}

function sortAppRegistryEntries(entries: AppRegistryEntry[]): AppRegistryEntry[] {
  return [...entries].sort((left, right) => {
    const rightTimestamp = new Date(right.createdAt).getTime()
    const leftTimestamp = new Date(left.createdAt).getTime()
    if (rightTimestamp !== leftTimestamp) {
      return rightTimestamp - leftTimestamp
    }
    return left.name.localeCompare(right.name)
  })
}

function normalizeParsedEntry(entry: unknown, index: number): AppRegistryEntry | null {
  const record = asRecord(entry)
  const rawName = typeof record.name === "string" ? record.name.trim() : ""
  if (!rawName) {
    return null
  }

  const id = normalizeId(record.id, rawName, index)
  const defaultEntry = DEFAULT_ENTRY_BY_ID.get(id)
  const applicationType = isAppRegistryApplicationType(record.applicationType)
    ? record.applicationType
    : defaultEntry?.applicationType || null
  if (!applicationType) {
    return null
  }

  const explicitWizardFlag = asBoolean(record.showInLaunchWizard)
  const explicitSystemFlag = asBoolean(record.system)

  return {
    id,
    name: rawName,
    description: typeof record.description === "string" ? record.description : defaultEntry?.description || "",
    applicationType,
    image: typeof record.image === "string" ? record.image : defaultEntry?.image || "",
    repository: typeof record.repository === "string" ? record.repository : defaultEntry?.repository || "",
    branch: typeof record.branch === "string" && record.branch.trim().length > 0 ? record.branch : "main",
    buildCommand: typeof record.buildCommand === "string" ? record.buildCommand : defaultEntry?.buildCommand || "",
    startCommand: typeof record.startCommand === "string" ? record.startCommand : defaultEntry?.startCommand || "",
    port: normalizeRegistryPort(record.port, applicationType),
    version: typeof record.version === "string" ? record.version : defaultEntry?.version || "",
    createdAt: normalizeCreatedAt(record.createdAt),
    showInLaunchWizard: explicitWizardFlag ?? defaultEntry?.showInLaunchWizard ?? false,
    system: explicitSystemFlag ?? defaultEntry?.system ?? false,
  }
}

function mergeWithSystemEntries(entries: AppRegistryEntry[]): AppRegistryEntry[] {
  const byId = new Map<string, AppRegistryEntry>()
  for (const entry of DEFAULT_APP_REGISTRY_ENTRIES) {
    byId.set(entry.id, { ...entry })
  }

  for (const entry of entries) {
    const defaultEntry = byId.get(entry.id)
    if (defaultEntry) {
      byId.set(entry.id, {
        ...defaultEntry,
        ...entry,
        system: true,
      })
      continue
    }
    byId.set(entry.id, { ...entry, system: false })
  }

  return sortAppRegistryEntries(Array.from(byId.values()))
}

export function defaultAppRegistryEntries(): AppRegistryEntry[] {
  return DEFAULT_APP_REGISTRY_ENTRIES.map((entry) => ({ ...entry }))
}

export function parseAppRegistryEntries(rawValue: string | null): AppRegistryEntry[] {
  if (!rawValue) {
    return defaultAppRegistryEntries()
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown
    if (!Array.isArray(parsed)) {
      return defaultAppRegistryEntries()
    }

    const normalizedEntries = parsed
      .map((entry, index) => normalizeParsedEntry(entry, index))
      .filter((entry): entry is AppRegistryEntry => Boolean(entry))

    return mergeWithSystemEntries(normalizedEntries)
  } catch {
    return defaultAppRegistryEntries()
  }
}
