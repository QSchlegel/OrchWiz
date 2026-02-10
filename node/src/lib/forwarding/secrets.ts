import {
  decryptWithWalletEnclave,
  encryptWithWalletEnclave,
  requirePrivateMemoryEncryption,
  walletEnclaveEnabled,
  WalletEnclaveError,
} from "@/lib/wallet-enclave/client"

const FORWARDING_TARGET_API_KEY_PREFIX = "owz.forwarding.target-api-key.v1:"
const FORWARDING_TARGET_API_KEY_KIND = "orchwiz.forwarding.target-api-key"

interface ForwardingTargetApiKeyEncryptedEnvelope {
  kind: typeof FORWARDING_TARGET_API_KEY_KIND
  version: 1
  storageMode: "encrypted"
  context: string
  alg: "AES-256-GCM"
  ciphertextB64: string
  nonceB64: string
  encryptedAt: string
}

interface ForwardingTargetApiKeyPlaintextFallbackEnvelope {
  kind: typeof FORWARDING_TARGET_API_KEY_KIND
  version: 1
  storageMode: "plaintext-fallback"
  plaintext: string
  savedAt: string
}

type ForwardingTargetApiKeyEnvelope =
  | ForwardingTargetApiKeyEncryptedEnvelope
  | ForwardingTargetApiKeyPlaintextFallbackEnvelope

type ForwardingTargetApiKeyStorageMode =
  | "none"
  | "encrypted"
  | "plaintext-fallback"
  | "legacy-plaintext"
  | "unknown"

type ParsedStoredTargetApiKey =
  | { type: "none" }
  | { type: "legacy"; value: string }
  | { type: "encoded"; envelope: ForwardingTargetApiKeyEnvelope }
  | { type: "invalid-encoded" }

export interface ForwardingTargetApiKeySummary {
  storageMode: ForwardingTargetApiKeyStorageMode
  hasValue: boolean
  maskedValue: string | null
}

export class ForwardingSecretsError extends Error {
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
    this.name = "ForwardingSecretsError"
    this.status = options.status ?? 500
    this.code = options.code ?? "FORWARDING_SECRETS_ERROR"
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

function encodeEnvelope(envelope: ForwardingTargetApiKeyEnvelope): string {
  return `${FORWARDING_TARGET_API_KEY_PREFIX}${Buffer.from(
    JSON.stringify(envelope),
    "utf8",
  ).toString("base64")}`
}

function parseEnvelope(value: string): ForwardingTargetApiKeyEnvelope | null {
  if (!value.startsWith(FORWARDING_TARGET_API_KEY_PREFIX)) {
    return null
  }

  const encoded = value.slice(FORWARDING_TARGET_API_KEY_PREFIX.length)
  const decoded = fromBase64(encoded)
  const parsed = asRecord(JSON.parse(decoded) as unknown)

  if (
    parsed.kind !== FORWARDING_TARGET_API_KEY_KIND
    || parsed.version !== 1
    || typeof parsed.storageMode !== "string"
  ) {
    return null
  }

  if (parsed.storageMode === "encrypted") {
    const context = asNonEmptyString(parsed.context)
    const alg = asNonEmptyString(parsed.alg)
    const ciphertextB64 = asNonEmptyString(parsed.ciphertextB64)
    const nonceB64 = asNonEmptyString(parsed.nonceB64)
    const encryptedAt = asNonEmptyString(parsed.encryptedAt)

    if (!context || !alg || !ciphertextB64 || !nonceB64 || !encryptedAt || alg !== "AES-256-GCM") {
      return null
    }

    return {
      kind: FORWARDING_TARGET_API_KEY_KIND,
      version: 1,
      storageMode: "encrypted",
      context,
      alg: "AES-256-GCM",
      ciphertextB64,
      nonceB64,
      encryptedAt,
    }
  }

  if (parsed.storageMode === "plaintext-fallback") {
    const plaintext = asNonEmptyString(parsed.plaintext)
    if (!plaintext) {
      return null
    }

    return {
      kind: FORWARDING_TARGET_API_KEY_KIND,
      version: 1,
      storageMode: "plaintext-fallback",
      plaintext,
      savedAt: asNonEmptyString(parsed.savedAt) || new Date(0).toISOString(),
    }
  }

  return null
}

function parseStoredTargetApiKey(value: string | null | undefined): ParsedStoredTargetApiKey {
  const normalized = asNonEmptyString(value)
  if (!normalized) {
    return { type: "none" }
  }

  if (!normalized.startsWith(FORWARDING_TARGET_API_KEY_PREFIX)) {
    return {
      type: "legacy",
      value: normalized,
    }
  }

  try {
    const envelope = parseEnvelope(normalized)
    if (!envelope) {
      return { type: "invalid-encoded" }
    }

    return {
      type: "encoded",
      envelope,
    }
  } catch {
    return { type: "invalid-encoded" }
  }
}

function encryptionRequired(): boolean {
  return requirePrivateMemoryEncryption()
}

function maskSecret(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return "********"
  }
  const suffix = trimmed.slice(-4)
  return `********${suffix}`
}

export function buildForwardingTargetApiKeyContext(configId: string): string {
  return `forwarding:config:${configId}:target-api-key`
}

export function summarizeStoredForwardingTargetApiKey(
  value: string | null | undefined,
): ForwardingTargetApiKeySummary {
  const parsed = parseStoredTargetApiKey(value)

  if (parsed.type === "none") {
    return {
      storageMode: "none",
      hasValue: false,
      maskedValue: null,
    }
  }

  if (parsed.type === "legacy") {
    return {
      storageMode: "legacy-plaintext",
      hasValue: true,
      maskedValue: maskSecret(parsed.value),
    }
  }

  if (parsed.type === "invalid-encoded") {
    return {
      storageMode: "unknown",
      hasValue: false,
      maskedValue: null,
    }
  }

  if (parsed.envelope.storageMode === "plaintext-fallback") {
    return {
      storageMode: "plaintext-fallback",
      hasValue: true,
      maskedValue: maskSecret(parsed.envelope.plaintext),
    }
  }

  return {
    storageMode: "encrypted",
    hasValue: true,
    maskedValue: "********",
  }
}

export async function storeForwardingTargetApiKey(args: {
  configId: string
  targetApiKey: string
}): Promise<string> {
  const targetApiKey = asNonEmptyString(args.targetApiKey)
  if (!targetApiKey) {
    throw new ForwardingSecretsError("targetApiKey must be a non-empty string.", {
      status: 400,
      code: "FORWARDING_TARGET_API_KEY_REQUIRED",
    })
  }

  const now = new Date().toISOString()
  const context = buildForwardingTargetApiKeyContext(args.configId)

  if (!walletEnclaveEnabled()) {
    if (encryptionRequired()) {
      throw new ForwardingSecretsError(
        "Wallet enclave is disabled; encrypted forwarding target API keys are required.",
        {
          status: 503,
          code: "WALLET_ENCLAVE_DISABLED",
        },
      )
    }

    return encodeEnvelope({
      kind: FORWARDING_TARGET_API_KEY_KIND,
      version: 1,
      storageMode: "plaintext-fallback",
      plaintext: targetApiKey,
      savedAt: now,
    })
  }

  try {
    const encrypted = await encryptWithWalletEnclave({
      context,
      plaintextB64: toBase64(targetApiKey),
    })

    return encodeEnvelope({
      kind: FORWARDING_TARGET_API_KEY_KIND,
      version: 1,
      storageMode: "encrypted",
      context,
      alg: encrypted.alg,
      ciphertextB64: encrypted.ciphertextB64,
      nonceB64: encrypted.nonceB64,
      encryptedAt: now,
    })
  } catch (error) {
    if (encryptionRequired()) {
      if (error instanceof WalletEnclaveError) {
        throw new ForwardingSecretsError("Wallet enclave encryption failed.", {
          status: error.status,
          code: error.code,
          details: error.details,
        })
      }

      throw new ForwardingSecretsError(`Wallet enclave encryption failed: ${(error as Error).message}`)
    }

    return encodeEnvelope({
      kind: FORWARDING_TARGET_API_KEY_KIND,
      version: 1,
      storageMode: "plaintext-fallback",
      plaintext: targetApiKey,
      savedAt: now,
    })
  }
}

export async function resolveForwardingTargetApiKey(args: {
  configId: string
  stored: string | null | undefined
}): Promise<string | null> {
  const parsed = parseStoredTargetApiKey(args.stored)

  if (parsed.type === "none") {
    return null
  }

  if (parsed.type === "legacy") {
    return parsed.value
  }

  if (parsed.type === "invalid-encoded") {
    throw new ForwardingSecretsError("Forwarding target API key envelope is malformed.", {
      status: 422,
      code: "FORWARDING_TARGET_API_KEY_MALFORMED",
    })
  }

  if (parsed.envelope.storageMode === "plaintext-fallback") {
    return parsed.envelope.plaintext
  }

  try {
    const decrypted = await decryptWithWalletEnclave({
      context: parsed.envelope.context || buildForwardingTargetApiKeyContext(args.configId),
      ciphertextB64: parsed.envelope.ciphertextB64,
      nonceB64: parsed.envelope.nonceB64,
    })
    const plaintext = asNonEmptyString(fromBase64(decrypted.plaintextB64))
    if (!plaintext) {
      throw new ForwardingSecretsError("Forwarding target API key decryption returned empty value.", {
        status: 422,
        code: "FORWARDING_TARGET_API_KEY_EMPTY",
      })
    }

    return plaintext
  } catch (error) {
    if (error instanceof ForwardingSecretsError) {
      throw error
    }

    if (error instanceof WalletEnclaveError) {
      throw new ForwardingSecretsError("Wallet enclave decryption failed.", {
        status: error.status,
        code: error.code,
        details: error.details,
      })
    }

    throw new ForwardingSecretsError(
      `Forwarding target API key decryption failed: ${(error as Error).message}`,
    )
  }
}
