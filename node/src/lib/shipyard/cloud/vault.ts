import {
  decryptWithWalletEnclave,
  encryptWithWalletEnclave,
  walletEnclaveEnabled,
  WalletEnclaveError,
} from "@/lib/wallet-enclave/client"

const CLOUD_SECRET_ENVELOPE_KIND = "orchwiz.shipyard.cloud.secret"
const CLOUD_SECRET_ENVELOPE_VERSION = 1 as const

export interface EncryptedCloudSecretEnvelope {
  kind: typeof CLOUD_SECRET_ENVELOPE_KIND
  version: typeof CLOUD_SECRET_ENVELOPE_VERSION
  storageMode: "encrypted"
  context: string
  alg: "AES-256-GCM"
  ciphertextB64: string
  nonceB64: string
  encryptedAt: string
}

export class ShipyardCloudVaultError extends Error {
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
    this.name = "ShipyardCloudVaultError"
    this.status = options.status ?? 500
    this.code = options.code ?? "SHIPYARD_CLOUD_VAULT_ERROR"
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

function parseEnvelope(value: unknown): EncryptedCloudSecretEnvelope | null {
  const record = asRecord(value)
  const kind = asNonEmptyString(record.kind)
  const version = record.version
  const storageMode = asNonEmptyString(record.storageMode)

  if (
    kind !== CLOUD_SECRET_ENVELOPE_KIND
    || version !== CLOUD_SECRET_ENVELOPE_VERSION
    || storageMode !== "encrypted"
  ) {
    return null
  }

  const context = asNonEmptyString(record.context)
  const alg = asNonEmptyString(record.alg)
  const ciphertextB64 = asNonEmptyString(record.ciphertextB64)
  const nonceB64 = asNonEmptyString(record.nonceB64)
  const encryptedAt = asNonEmptyString(record.encryptedAt)

  if (!context || alg !== "AES-256-GCM" || !ciphertextB64 || !nonceB64 || !encryptedAt) {
    return null
  }

  return {
    kind: CLOUD_SECRET_ENVELOPE_KIND,
    version: CLOUD_SECRET_ENVELOPE_VERSION,
    storageMode: "encrypted",
    context,
    alg: "AES-256-GCM",
    ciphertextB64,
    nonceB64,
    encryptedAt,
  }
}

function requireWalletEnclave(): void {
  if (!walletEnclaveEnabled()) {
    throw new ShipyardCloudVaultError(
      "Wallet enclave is disabled; cloud secret storage requires encryption.",
      {
        status: 503,
        code: "WALLET_ENCLAVE_DISABLED",
      },
    )
  }
}

export function buildCloudCredentialContext(userId: string, provider: string): string {
  return `shipyard:cloud:${userId}:${provider}:credential`
}

export function buildCloudSshPrivateKeyContext(
  userId: string,
  provider: string,
  keyName: string,
): string {
  return `shipyard:cloud:${userId}:${provider}:ssh-key:${keyName}`
}

export async function encryptCloudSecretEnvelope(args: {
  context: string
  plaintext: string
}): Promise<EncryptedCloudSecretEnvelope> {
  requireWalletEnclave()

  const now = new Date().toISOString()

  try {
    const encrypted = await encryptWithWalletEnclave({
      context: args.context,
      plaintextB64: toBase64(args.plaintext),
    })

    return {
      kind: CLOUD_SECRET_ENVELOPE_KIND,
      version: CLOUD_SECRET_ENVELOPE_VERSION,
      storageMode: "encrypted",
      context: args.context,
      alg: encrypted.alg,
      ciphertextB64: encrypted.ciphertextB64,
      nonceB64: encrypted.nonceB64,
      encryptedAt: now,
    }
  } catch (error) {
    if (error instanceof WalletEnclaveError) {
      throw new ShipyardCloudVaultError("Wallet enclave encryption failed.", {
        status: error.status,
        code: error.code,
        details: error.details,
      })
    }

    throw new ShipyardCloudVaultError(`Wallet enclave encryption failed: ${(error as Error).message}`)
  }
}

export async function decryptCloudSecretEnvelope(args: {
  stored: unknown
  contextFallback: string
}): Promise<string> {
  requireWalletEnclave()

  const envelope = parseEnvelope(args.stored)
  if (!envelope) {
    throw new ShipyardCloudVaultError("Cloud secret envelope is invalid or missing.", {
      status: 400,
      code: "CLOUD_SECRET_ENVELOPE_INVALID",
    })
  }

  try {
    const decrypted = await decryptWithWalletEnclave({
      context: envelope.context || args.contextFallback,
      ciphertextB64: envelope.ciphertextB64,
      nonceB64: envelope.nonceB64,
    })

    return fromBase64(decrypted.plaintextB64)
  } catch (error) {
    if (error instanceof WalletEnclaveError) {
      throw new ShipyardCloudVaultError("Wallet enclave decryption failed.", {
        status: error.status,
        code: error.code,
        details: error.details,
      })
    }

    throw new ShipyardCloudVaultError(`Wallet enclave decryption failed: ${(error as Error).message}`)
  }
}

export async function storeCloudCredentialEnvelope(args: {
  userId: string
  provider: string
  token: string
}): Promise<EncryptedCloudSecretEnvelope> {
  const context = buildCloudCredentialContext(args.userId, args.provider)
  return encryptCloudSecretEnvelope({
    context,
    plaintext: JSON.stringify({ token: args.token }),
  })
}

export async function resolveCloudCredentialToken(args: {
  userId: string
  provider: string
  stored: unknown
}): Promise<string> {
  const plaintext = await decryptCloudSecretEnvelope({
    stored: args.stored,
    contextFallback: buildCloudCredentialContext(args.userId, args.provider),
  })

  const parsed = JSON.parse(plaintext) as Record<string, unknown>
  const token = asNonEmptyString(parsed.token)
  if (!token) {
    throw new ShipyardCloudVaultError("Cloud credential token is missing in stored envelope.", {
      status: 400,
      code: "CLOUD_CREDENTIAL_INVALID",
    })
  }

  return token
}

export async function storeCloudSshPrivateKeyEnvelope(args: {
  userId: string
  provider: string
  keyName: string
  privateKey: string
}): Promise<EncryptedCloudSecretEnvelope> {
  const context = buildCloudSshPrivateKeyContext(args.userId, args.provider, args.keyName)
  return encryptCloudSecretEnvelope({
    context,
    plaintext: JSON.stringify({ privateKey: args.privateKey }),
  })
}

export async function resolveCloudSshPrivateKey(args: {
  userId: string
  provider: string
  keyName: string
  stored: unknown
}): Promise<string> {
  const plaintext = await decryptCloudSecretEnvelope({
    stored: args.stored,
    contextFallback: buildCloudSshPrivateKeyContext(args.userId, args.provider, args.keyName),
  })

  const parsed = JSON.parse(plaintext) as Record<string, unknown>
  const privateKey = asNonEmptyString(parsed.privateKey)
  if (!privateKey) {
    throw new ShipyardCloudVaultError("Cloud SSH private key is missing in stored envelope.", {
      status: 400,
      code: "CLOUD_SSH_KEY_INVALID",
    })
  }

  return privateKey
}

export function summarizeCloudSecretEnvelope(stored: unknown): {
  storageMode: "encrypted" | "unknown"
  hasSecret: boolean
} {
  const parsed = parseEnvelope(stored)
  if (!parsed) {
    return {
      storageMode: "unknown",
      hasSecret: false,
    }
  }

  return {
    storageMode: "encrypted",
    hasSecret: true,
  }
}
