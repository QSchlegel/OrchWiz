import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  decryptWithWalletEnclave,
  encryptWithWalletEnclave,
  requirePrivateMemoryEncryption,
  walletEnclaveEnabled,
  WalletEnclaveError,
} from "@/lib/wallet-enclave/client"

const SECURITY_INTEGRATION_SECRETS_KIND = "orchwiz.security.integration-secrets"
const SECURITY_INTEGRATION_SECRETS_VERSION = 1 as const

export interface SecurityIntegrationSecretValues {
  misp_base_url?: string
  misp_api_key?: string
  virustotal_api_key?: string
}

export type SecurityIntegrationSecretsStorageMode =
  | "none"
  | "encrypted"
  | "plaintext-fallback"
  | "unknown"

export interface SecurityIntegrationSecretsSummary {
  storageMode: SecurityIntegrationSecretsStorageMode
  mispBaseUrl: string | null
  hasMispKey: boolean
  hasVtKey: boolean
}

interface EncryptedSecurityIntegrationSecretsEnvelope {
  kind: typeof SECURITY_INTEGRATION_SECRETS_KIND
  version: typeof SECURITY_INTEGRATION_SECRETS_VERSION
  storageMode: "encrypted"
  context: string
  alg: "AES-256-GCM"
  ciphertextB64: string
  nonceB64: string
  encryptedAt: string
}

interface PlaintextFallbackSecurityIntegrationSecretsEnvelope {
  kind: typeof SECURITY_INTEGRATION_SECRETS_KIND
  version: typeof SECURITY_INTEGRATION_SECRETS_VERSION
  storageMode: "plaintext-fallback"
  plaintext: SecurityIntegrationSecretValues
  savedAt: string
}

type StoredSecurityIntegrationSecretsEnvelope =
  | EncryptedSecurityIntegrationSecretsEnvelope
  | PlaintextFallbackSecurityIntegrationSecretsEnvelope

export class SecurityIntegrationSecretsError extends Error {
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
    this.name = "SecurityIntegrationSecretsError"
    this.status = options.status ?? 500
    this.code = options.code ?? "SECURITY_INTEGRATION_SECRETS_ERROR"
    this.details = options.details
  }
}

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

function validateUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return ""
  }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new SecurityIntegrationSecretsError("MISP base URL must be a valid URL.", {
      status: 400,
      code: "SECURITY_INTEGRATIONS_MISP_BASE_URL_INVALID",
    })
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SecurityIntegrationSecretsError("MISP base URL must start with http:// or https://.", {
      status: 400,
      code: "SECURITY_INTEGRATIONS_MISP_BASE_URL_INVALID",
    })
  }

  return trimmed.replace(/\/+$/u, "")
}

export function buildSecurityIntegrationSecretsContext(userId: string): string {
  return `security:integration-secrets:${userId}`
}

export function validateSecurityIntegrationSecretValues(values: unknown): SecurityIntegrationSecretValues {
  const record = asRecord(values)
  const normalized: SecurityIntegrationSecretValues = {}

  const mispBaseUrl = asNonEmptyString(record.misp_base_url)
  if (mispBaseUrl) {
    const url = validateUrl(mispBaseUrl)
    if (url) {
      normalized.misp_base_url = url
    }
  }

  const mispApiKey = asNonEmptyString(record.misp_api_key)
  if (mispApiKey) {
    normalized.misp_api_key = mispApiKey
  }

  const vtApiKey = asNonEmptyString(record.virustotal_api_key)
  if (vtApiKey) {
    normalized.virustotal_api_key = vtApiKey
  }

  return normalized
}

function parseStoredEnvelope(value: unknown): StoredSecurityIntegrationSecretsEnvelope | null {
  const record = asRecord(value)
  const kind = asNonEmptyString(record.kind)
  const version = record.version
  const storageMode = asNonEmptyString(record.storageMode)

  if (kind !== SECURITY_INTEGRATION_SECRETS_KIND || version !== SECURITY_INTEGRATION_SECRETS_VERSION) {
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
      kind: SECURITY_INTEGRATION_SECRETS_KIND,
      version: SECURITY_INTEGRATION_SECRETS_VERSION,
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
      kind: SECURITY_INTEGRATION_SECRETS_KIND,
      version: SECURITY_INTEGRATION_SECRETS_VERSION,
      storageMode: "plaintext-fallback",
      plaintext: validateSecurityIntegrationSecretValues(record.plaintext),
      savedAt: asNonEmptyString(record.savedAt) || new Date(0).toISOString(),
    }
  }

  return null
}

export function detectSecurityIntegrationSecretsStorageMode(stored: unknown): SecurityIntegrationSecretsStorageMode {
  if (!stored || (typeof stored === "object" && Object.keys(asRecord(stored)).length === 0)) {
    return "none"
  }

  const parsed = parseStoredEnvelope(stored)
  if (parsed) {
    return parsed.storageMode
  }

  return "unknown"
}

export async function storeSecurityIntegrationSecretsEnvelope(args: {
  userId: string
  values: SecurityIntegrationSecretValues
}): Promise<StoredSecurityIntegrationSecretsEnvelope> {
  const values = validateSecurityIntegrationSecretValues(args.values)
  const now = new Date().toISOString()
  const context = buildSecurityIntegrationSecretsContext(args.userId)

  if (!walletEnclaveEnabled()) {
    if (encryptionRequired()) {
      throw new SecurityIntegrationSecretsError(
        "Wallet enclave is disabled; encrypted security integration secrets are required.",
        {
          status: 503,
          code: "WALLET_ENCLAVE_DISABLED",
        },
      )
    }

    return {
      kind: SECURITY_INTEGRATION_SECRETS_KIND,
      version: SECURITY_INTEGRATION_SECRETS_VERSION,
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
      kind: SECURITY_INTEGRATION_SECRETS_KIND,
      version: SECURITY_INTEGRATION_SECRETS_VERSION,
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
        throw new SecurityIntegrationSecretsError("Wallet enclave encryption failed.", {
          status: error.status,
          code: error.code,
          details: error.details,
        })
      }

      throw new SecurityIntegrationSecretsError(`Wallet enclave encryption failed: ${(error as Error).message}`, {
        status: 503,
        code: "WALLET_ENCLAVE_ENCRYPTION_FAILED",
      })
    }

    return {
      kind: SECURITY_INTEGRATION_SECRETS_KIND,
      version: SECURITY_INTEGRATION_SECRETS_VERSION,
      storageMode: "plaintext-fallback",
      plaintext: values,
      savedAt: now,
    }
  }
}

export async function resolveSecurityIntegrationSecretsValues(args: {
  userId: string
  stored: unknown
}): Promise<SecurityIntegrationSecretValues> {
  const parsedEnvelope = parseStoredEnvelope(args.stored)
  if (parsedEnvelope?.storageMode === "plaintext-fallback") {
    return validateSecurityIntegrationSecretValues(parsedEnvelope.plaintext)
  }

  if (parsedEnvelope?.storageMode === "encrypted") {
    try {
      const decrypted = await decryptWithWalletEnclave({
        context: parsedEnvelope.context || buildSecurityIntegrationSecretsContext(args.userId),
        ciphertextB64: parsedEnvelope.ciphertextB64,
        nonceB64: parsedEnvelope.nonceB64,
      })

      const decoded = JSON.parse(fromBase64(decrypted.plaintextB64)) as unknown
      return validateSecurityIntegrationSecretValues(decoded)
    } catch (error) {
      if (error instanceof WalletEnclaveError) {
        throw new SecurityIntegrationSecretsError("Wallet enclave decryption failed.", {
          status: error.status,
          code: error.code,
          details: error.details,
        })
      }

      throw new SecurityIntegrationSecretsError(
        `Security integration secrets decryption failed: ${(error as Error).message}`,
        {
          status: 500,
          code: "SECURITY_INTEGRATION_SECRETS_DECRYPT_FAILED",
        },
      )
    }
  }

  return {}
}

export function summarizeSecurityIntegrationSecrets(args: {
  stored: unknown
  resolvedValues: SecurityIntegrationSecretValues
}): SecurityIntegrationSecretsSummary {
  const storageMode = detectSecurityIntegrationSecretsStorageMode(args.stored)
  const values = validateSecurityIntegrationSecretValues(args.resolvedValues)

  return {
    storageMode,
    mispBaseUrl: values.misp_base_url || null,
    hasMispKey: Boolean(values.misp_api_key),
    hasVtKey: Boolean(values.virustotal_api_key),
  }
}

export async function upsertSecurityIntegrationSecrets(args: {
  userId: string
  values: SecurityIntegrationSecretValues
}): Promise<SecurityIntegrationSecretsSummary> {
  const envelope = await storeSecurityIntegrationSecretsEnvelope({
    userId: args.userId,
    values: args.values,
  })

  const stored = await prisma.securityIntegrationSecrets.upsert({
    where: { userId: args.userId },
    create: {
      userId: args.userId,
      stored: envelope as unknown as Prisma.InputJsonValue,
    },
    update: {
      stored: envelope as unknown as Prisma.InputJsonValue,
    },
    select: { stored: true },
  })

  const resolved = await resolveSecurityIntegrationSecretsValues({
    userId: args.userId,
    stored: stored.stored,
  })

  return summarizeSecurityIntegrationSecrets({
    stored: stored.stored,
    resolvedValues: resolved,
  })
}

export async function getSecurityIntegrationSecretsSummary(args: {
  userId: string
}): Promise<{ summary: SecurityIntegrationSecretsSummary; stored: unknown; resolved: SecurityIntegrationSecretValues }> {
  const record = await prisma.securityIntegrationSecrets.findUnique({
    where: { userId: args.userId },
    select: { stored: true },
  })

  const stored = record?.stored ?? null
  const resolved = await resolveSecurityIntegrationSecretsValues({
    userId: args.userId,
    stored,
  })

  return {
    summary: summarizeSecurityIntegrationSecrets({ stored, resolvedValues: resolved }),
    stored,
    resolved,
  }
}

