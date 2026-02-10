import type { DeploymentProfile } from "@/lib/deployment/profile"
import {
  decryptWithWalletEnclave,
  encryptWithWalletEnclave,
  requirePrivateMemoryEncryption,
  walletEnclaveEnabled,
  WalletEnclaveError,
} from "@/lib/wallet-enclave/client"

const SHIPYARD_SECRET_TEMPLATE_KIND = "orchwiz.shipyard.secret-template"
const SHIPYARD_SECRET_TEMPLATE_VERSION = 1 as const

export type ShipyardSecretFieldKey =
  | "better_auth_secret"
  | "github_client_id"
  | "github_client_secret"
  | "openai_api_key"
  | "openclaw_api_key"
  | "postgres_password"
  | "database_url"

export interface ShipyardSecretTemplateValues {
  better_auth_secret?: string
  github_client_id?: string
  github_client_secret?: string
  openai_api_key?: string
  openclaw_api_key?: string
  postgres_password?: string
  database_url?: string
}

export interface ShipyardSecretFieldSummary {
  hasValue: boolean
  maskedValue: string | null
}

export type ShipyardSecretStorageMode =
  | "none"
  | "encrypted"
  | "plaintext-fallback"
  | "legacy-plaintext"
  | "unknown"

export interface ShipyardSecretTemplateSummary {
  storageMode: ShipyardSecretStorageMode
  hasValue: boolean
  populatedFieldCount: number
  fields: Record<ShipyardSecretFieldKey, ShipyardSecretFieldSummary>
}

export interface ShipyardSetupSnippets {
  envSnippet: string
  terraformTfvarsSnippet: string
}

export interface EncryptedShipyardSecretTemplateEnvelope {
  kind: typeof SHIPYARD_SECRET_TEMPLATE_KIND
  version: typeof SHIPYARD_SECRET_TEMPLATE_VERSION
  storageMode: "encrypted"
  context: string
  alg: "AES-256-GCM"
  ciphertextB64: string
  nonceB64: string
  encryptedAt: string
}

export interface PlaintextFallbackShipyardSecretTemplateEnvelope {
  kind: typeof SHIPYARD_SECRET_TEMPLATE_KIND
  version: typeof SHIPYARD_SECRET_TEMPLATE_VERSION
  storageMode: "plaintext-fallback"
  plaintext: ShipyardSecretTemplateValues
  savedAt: string
}

export type StoredShipyardSecretTemplateEnvelope =
  | EncryptedShipyardSecretTemplateEnvelope
  | PlaintextFallbackShipyardSecretTemplateEnvelope

export class ShipyardSecretVaultError extends Error {
  status: number
  code: string
  details?: unknown

  constructor(
    message: string,
    options: {
      status?: number
      code?: string
      details?: unknown
    } = {},
  ) {
    super(message)
    this.name = "ShipyardSecretVaultError"
    this.status = options.status ?? 500
    this.code = options.code ?? "SHIPYARD_SECRET_VAULT_ERROR"
    this.details = options.details
  }
}

const SHIPYARD_SECRET_FIELD_KEYS: ShipyardSecretFieldKey[] = [
  "better_auth_secret",
  "github_client_id",
  "github_client_secret",
  "openai_api_key",
  "openclaw_api_key",
  "postgres_password",
  "database_url",
]

const COMMON_SHIPYARD_SECRET_FIELDS: ShipyardSecretFieldKey[] = [
  "better_auth_secret",
  "github_client_id",
  "github_client_secret",
  "openai_api_key",
  "openclaw_api_key",
]

const PROFILE_SPECIFIC_FIELDS: Record<DeploymentProfile, ShipyardSecretFieldKey[]> = {
  local_starship_build: ["postgres_password"],
  cloud_shipyard: ["database_url"],
}

const ENV_SNIPPET_KEYS: Array<{ field: ShipyardSecretFieldKey; env: string }> = [
  { field: "better_auth_secret", env: "BETTER_AUTH_SECRET" },
  { field: "github_client_id", env: "GITHUB_CLIENT_ID" },
  { field: "github_client_secret", env: "GITHUB_CLIENT_SECRET" },
  { field: "openai_api_key", env: "OPENAI_API_KEY" },
  { field: "openclaw_api_key", env: "OPENCLAW_API_KEY" },
  { field: "database_url", env: "DATABASE_URL" },
]

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toBase64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64")
}

function fromBase64(value: string): string {
  return Buffer.from(value, "base64").toString("utf8")
}

function encryptionRequired(): boolean {
  return requirePrivateMemoryEncryption()
}

function profileAllowsField(profile: DeploymentProfile, field: ShipyardSecretFieldKey): boolean {
  return COMMON_SHIPYARD_SECRET_FIELDS.includes(field) || PROFILE_SPECIFIC_FIELDS[profile].includes(field)
}

function tfvarsDbFieldForProfile(profile: DeploymentProfile): ShipyardSecretFieldKey {
  return profile === "local_starship_build" ? "postgres_password" : "database_url"
}

function maskSecret(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return "********"
  }
  const suffix = trimmed.slice(-4)
  return suffix.length > 0 ? `********${suffix}` : "********"
}

function toEnvAssignment(value: string): string {
  return JSON.stringify(value)
}

function toTfvarsAssignment(value: string): string {
  const escaped = value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n")
  return `"${escaped}"`
}

function parseStoredShipyardSecretTemplateEnvelope(
  value: unknown,
): StoredShipyardSecretTemplateEnvelope | null {
  const record = asRecord(value)
  const kind = asNonEmptyString(record.kind)
  const version = record.version
  const storageMode = asNonEmptyString(record.storageMode)

  if (kind !== SHIPYARD_SECRET_TEMPLATE_KIND || version !== SHIPYARD_SECRET_TEMPLATE_VERSION) {
    return null
  }

  if (storageMode === "encrypted") {
    const context = asNonEmptyString(record.context)
    const alg = asNonEmptyString(record.alg)
    const ciphertextB64 = asNonEmptyString(record.ciphertextB64)
    const nonceB64 = asNonEmptyString(record.nonceB64)
    const encryptedAt = asNonEmptyString(record.encryptedAt)
    if (!context || !ciphertextB64 || !nonceB64 || !encryptedAt || alg !== "AES-256-GCM") {
      return null
    }

    return {
      kind: SHIPYARD_SECRET_TEMPLATE_KIND,
      version: SHIPYARD_SECRET_TEMPLATE_VERSION,
      storageMode: "encrypted",
      context,
      alg: "AES-256-GCM",
      ciphertextB64,
      nonceB64,
      encryptedAt,
    }
  }

  if (storageMode === "plaintext-fallback") {
    return {
      kind: SHIPYARD_SECRET_TEMPLATE_KIND,
      version: SHIPYARD_SECRET_TEMPLATE_VERSION,
      storageMode: "plaintext-fallback",
      plaintext: asRecord(record.plaintext) as ShipyardSecretTemplateValues,
      savedAt: asNonEmptyString(record.savedAt) || new Date(0).toISOString(),
    }
  }

  return null
}

function parseLegacyPlaintextValues(
  deploymentProfile: DeploymentProfile,
  value: unknown,
): ShipyardSecretTemplateValues | null {
  const record = asRecord(value)
  if (Object.keys(record).length === 0) {
    return {}
  }

  const hasKnownField = SHIPYARD_SECRET_FIELD_KEYS.some((field) =>
    Object.prototype.hasOwnProperty.call(record, field),
  )
  if (!hasKnownField) {
    return null
  }

  return validateShipyardSecretTemplateValues({
    deploymentProfile,
    values: record,
  })
}

function allFieldsEmpty(values: ShipyardSecretTemplateValues): boolean {
  return SHIPYARD_SECRET_FIELD_KEYS.every((field) => !values[field])
}

function redactedValues(values: ShipyardSecretTemplateValues): ShipyardSecretTemplateValues {
  const result: ShipyardSecretTemplateValues = {}
  for (const field of SHIPYARD_SECRET_FIELD_KEYS) {
    if (values[field]) {
      result[field] = "********"
    }
  }
  return result
}

export function listShipyardSecretFieldsForProfile(
  deploymentProfile: DeploymentProfile,
): ShipyardSecretFieldKey[] {
  return [...COMMON_SHIPYARD_SECRET_FIELDS, ...PROFILE_SPECIFIC_FIELDS[deploymentProfile]]
}

export function buildShipyardSecretTemplateContext(
  userId: string,
  deploymentProfile: DeploymentProfile,
): string {
  return `shipyard:template:${userId}:${deploymentProfile}:secrets`
}

export function validateShipyardSecretTemplateValues(args: {
  deploymentProfile: DeploymentProfile
  values: unknown
}): ShipyardSecretTemplateValues {
  const record = asRecord(args.values)
  const normalized: ShipyardSecretTemplateValues = {}

  for (const key of Object.keys(record)) {
    if (!SHIPYARD_SECRET_FIELD_KEYS.includes(key as ShipyardSecretFieldKey)) {
      throw new ShipyardSecretVaultError(`Unknown Ship Yard secret field: ${key}`, {
        status: 400,
        code: "SHIPYARD_SECRET_FIELD_UNKNOWN",
      })
    }
  }

  for (const field of SHIPYARD_SECRET_FIELD_KEYS) {
    const raw = record[field]

    if (raw === undefined || raw === null) {
      continue
    }
    if (typeof raw !== "string") {
      throw new ShipyardSecretVaultError(`Ship Yard secret field '${field}' must be a string.`, {
        status: 400,
        code: "SHIPYARD_SECRET_FIELD_INVALID",
      })
    }

    if (!profileAllowsField(args.deploymentProfile, field)) {
      if (raw.trim().length > 0) {
        throw new ShipyardSecretVaultError(
          `Ship Yard secret field '${field}' is not allowed for profile '${args.deploymentProfile}'.`,
          {
            status: 400,
            code: "SHIPYARD_SECRET_FIELD_PROFILE_MISMATCH",
          },
        )
      }
      continue
    }

    const value = raw.trim()
    if (!value) {
      continue
    }

    normalized[field] = value
  }

  return normalized
}

export function summarizeShipyardSecretTemplate(args: {
  deploymentProfile: DeploymentProfile
  storageMode: ShipyardSecretStorageMode
  values: ShipyardSecretTemplateValues
}): ShipyardSecretTemplateSummary {
  const fields = {} as Record<ShipyardSecretFieldKey, ShipyardSecretFieldSummary>
  let populatedFieldCount = 0

  for (const field of SHIPYARD_SECRET_FIELD_KEYS) {
    const value = args.values[field]
    const hasValue = typeof value === "string" && value.trim().length > 0
    if (hasValue) {
      populatedFieldCount += 1
    }

    fields[field] = {
      hasValue,
      maskedValue: hasValue ? maskSecret(value || "") : null,
    }
  }

  return {
    storageMode: args.storageMode,
    hasValue: populatedFieldCount > 0,
    populatedFieldCount,
    fields,
  }
}

export function buildShipyardSetupSnippets(args: {
  deploymentProfile: DeploymentProfile
  values: ShipyardSecretTemplateValues
  redact?: boolean
}): ShipyardSetupSnippets {
  const values = args.redact ? redactedValues(args.values) : args.values

  const envLines: string[] = []
  for (const { field, env } of ENV_SNIPPET_KEYS) {
    if (!profileAllowsField(args.deploymentProfile, field)) {
      continue
    }
    const value = values[field]
    if (!value) {
      continue
    }
    envLines.push(`${env}=${toEnvAssignment(value)}`)
  }

  const tfvarsLines: string[] = []

  const betterAuthSecret = values.better_auth_secret
  if (betterAuthSecret) {
    tfvarsLines.push(`better_auth_secret = ${toTfvarsAssignment(betterAuthSecret)}`)
  }

  const githubClientId = values.github_client_id
  if (githubClientId) {
    tfvarsLines.push(`github_client_id = ${toTfvarsAssignment(githubClientId)}`)
  }

  const githubClientSecret = values.github_client_secret
  if (githubClientSecret) {
    tfvarsLines.push(`github_client_secret = ${toTfvarsAssignment(githubClientSecret)}`)
  }

  const dbField = tfvarsDbFieldForProfile(args.deploymentProfile)
  const dbFieldValue = values[dbField]
  if (dbFieldValue) {
    tfvarsLines.push(`${dbField} = ${toTfvarsAssignment(dbFieldValue)}`)
  }

  const appEnvLines: string[] = []
  const openAiApiKey = values.openai_api_key
  if (openAiApiKey) {
    appEnvLines.push(`  OPENAI_API_KEY = ${toTfvarsAssignment(openAiApiKey)}`)
  }
  const openClawApiKey = values.openclaw_api_key
  if (openClawApiKey) {
    appEnvLines.push(`  OPENCLAW_API_KEY = ${toTfvarsAssignment(openClawApiKey)}`)
  }
  if (appEnvLines.length > 0) {
    tfvarsLines.push("app_env = {")
    tfvarsLines.push(...appEnvLines)
    tfvarsLines.push("}")
  }

  return {
    envSnippet:
      envLines.length > 0
        ? envLines.join("\n")
        : "# No populated environment values in this Ship Yard secret template yet.",
    terraformTfvarsSnippet:
      tfvarsLines.length > 0
        ? tfvarsLines.join("\n")
        : "# No populated terraform.tfvars values in this Ship Yard secret template yet.",
  }
}

export async function storeShipyardSecretTemplateEnvelope(args: {
  userId: string
  deploymentProfile: DeploymentProfile
  values: ShipyardSecretTemplateValues
}): Promise<StoredShipyardSecretTemplateEnvelope> {
  const values = validateShipyardSecretTemplateValues({
    deploymentProfile: args.deploymentProfile,
    values: args.values,
  })

  const now = new Date().toISOString()
  const context = buildShipyardSecretTemplateContext(args.userId, args.deploymentProfile)

  if (!walletEnclaveEnabled()) {
    if (encryptionRequired()) {
      throw new ShipyardSecretVaultError(
        "Wallet enclave is disabled; encrypted Ship Yard secrets are required.",
        {
          status: 503,
          code: "WALLET_ENCLAVE_DISABLED",
        },
      )
    }

    return {
      kind: SHIPYARD_SECRET_TEMPLATE_KIND,
      version: SHIPYARD_SECRET_TEMPLATE_VERSION,
      storageMode: "plaintext-fallback",
      plaintext: values,
      savedAt: now,
    }
  }

  try {
    const encrypted = await encryptWithWalletEnclave({
      context,
      plaintextB64: toBase64(JSON.stringify(values)),
    })

    return {
      kind: SHIPYARD_SECRET_TEMPLATE_KIND,
      version: SHIPYARD_SECRET_TEMPLATE_VERSION,
      storageMode: "encrypted",
      context,
      alg: encrypted.alg,
      ciphertextB64: encrypted.ciphertextB64,
      nonceB64: encrypted.nonceB64,
      encryptedAt: now,
    }
  } catch (error) {
    if (encryptionRequired()) {
      if (error instanceof WalletEnclaveError) {
        throw new ShipyardSecretVaultError("Wallet enclave encryption failed.", {
          status: error.status,
          code: error.code,
          details: error.details,
        })
      }

      throw new ShipyardSecretVaultError(`Wallet enclave encryption failed: ${(error as Error).message}`, {
        status: 503,
        code: "WALLET_ENCLAVE_ENCRYPTION_FAILED",
      })
    }

    return {
      kind: SHIPYARD_SECRET_TEMPLATE_KIND,
      version: SHIPYARD_SECRET_TEMPLATE_VERSION,
      storageMode: "plaintext-fallback",
      plaintext: values,
      savedAt: now,
    }
  }
}

export function detectShipyardSecretStorageMode(stored: unknown): ShipyardSecretStorageMode {
  if (!stored || (typeof stored === "object" && Object.keys(asRecord(stored)).length === 0)) {
    return "none"
  }

  const parsedEnvelope = parseStoredShipyardSecretTemplateEnvelope(stored)
  if (parsedEnvelope) {
    return parsedEnvelope.storageMode
  }

  return "unknown"
}

export async function resolveShipyardSecretTemplateValues(args: {
  userId: string
  deploymentProfile: DeploymentProfile
  stored: unknown
}): Promise<ShipyardSecretTemplateValues> {
  const parsedEnvelope = parseStoredShipyardSecretTemplateEnvelope(args.stored)
  if (parsedEnvelope?.storageMode === "plaintext-fallback") {
    return validateShipyardSecretTemplateValues({
      deploymentProfile: args.deploymentProfile,
      values: parsedEnvelope.plaintext,
    })
  }

  if (parsedEnvelope?.storageMode === "encrypted") {
    try {
      const decrypted = await decryptWithWalletEnclave({
        context: parsedEnvelope.context || buildShipyardSecretTemplateContext(args.userId, args.deploymentProfile),
        ciphertextB64: parsedEnvelope.ciphertextB64,
        nonceB64: parsedEnvelope.nonceB64,
      })

      const decoded = JSON.parse(fromBase64(decrypted.plaintextB64)) as unknown
      return validateShipyardSecretTemplateValues({
        deploymentProfile: args.deploymentProfile,
        values: decoded,
      })
    } catch (error) {
      if (error instanceof WalletEnclaveError) {
        throw new ShipyardSecretVaultError("Wallet enclave decryption failed.", {
          status: error.status,
          code: error.code,
          details: error.details,
        })
      }

      throw new ShipyardSecretVaultError(
        `Ship Yard secret template decryption failed: ${(error as Error).message}`,
        {
          status: 500,
          code: "SHIPYARD_SECRET_DECRYPT_FAILED",
        },
      )
    }
  }

  const legacy = parseLegacyPlaintextValues(args.deploymentProfile, args.stored)
  if (legacy) {
    return legacy
  }

  return {}
}

export function summarizeStoredShipyardSecretTemplate(args: {
  deploymentProfile: DeploymentProfile
  stored: unknown
  resolvedValues: ShipyardSecretTemplateValues
}): ShipyardSecretTemplateSummary {
  const normalizedValues = validateShipyardSecretTemplateValues({
    deploymentProfile: args.deploymentProfile,
    values: args.resolvedValues,
  })
  let storageMode = detectShipyardSecretStorageMode(args.stored)
  if (storageMode === "unknown" && templateHasPopulatedSecrets(normalizedValues)) {
    storageMode = "legacy-plaintext"
  }

  return summarizeShipyardSecretTemplate({
    deploymentProfile: args.deploymentProfile,
    storageMode,
    values: normalizedValues,
  })
}

export function templateHasPopulatedSecrets(values: ShipyardSecretTemplateValues): boolean {
  return !allFieldsEmpty(values)
}
