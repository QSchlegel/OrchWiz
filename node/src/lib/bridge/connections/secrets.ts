import {
  decryptWithWalletEnclave,
  encryptWithWalletEnclave,
  requirePrivateMemoryEncryption,
  walletEnclaveEnabled,
  WalletEnclaveError,
} from "@/lib/wallet-enclave/client"
import type { BridgeConnectionProvider } from "@prisma/client"
import {
  validateBridgeConnectionCredentials,
  type BridgeConnectionCredentials,
} from "./validation"

export interface EncryptedBridgeConnectionCredentials {
  storageMode: "encrypted"
  context: string
  alg: "AES-256-GCM"
  ciphertextB64: string
  nonceB64: string
  encryptedAt: string
}

export interface PlaintextFallbackBridgeConnectionCredentials {
  storageMode: "plaintext-fallback"
  plaintext: Record<string, unknown>
  savedAt: string
}

export type StoredBridgeConnectionCredentials =
  | EncryptedBridgeConnectionCredentials
  | PlaintextFallbackBridgeConnectionCredentials

export class BridgeConnectionSecretsError extends Error {
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
    this.name = "BridgeConnectionSecretsError"
    this.status = options.status ?? 500
    this.code = options.code ?? "BRIDGE_CONNECTION_SECRETS_ERROR"
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

export function buildBridgeConnectionCredentialsContext(connectionId: string): string {
  return `bridge:connection:${connectionId}:credentials`
}

function parseStoredCredentials(value: unknown): StoredBridgeConnectionCredentials | null {
  const record = asRecord(value)
  const storageMode = asNonEmptyString(record.storageMode)

  if (storageMode === "encrypted") {
    const context = asNonEmptyString(record.context)
    const alg = asNonEmptyString(record.alg)
    const ciphertextB64 = asNonEmptyString(record.ciphertextB64)
    const nonceB64 = asNonEmptyString(record.nonceB64)
    const encryptedAt = asNonEmptyString(record.encryptedAt)

    if (!context || !alg || !ciphertextB64 || !nonceB64 || !encryptedAt || alg !== "AES-256-GCM") {
      return null
    }

    return {
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
      storageMode: "plaintext-fallback",
      plaintext: asRecord(record.plaintext),
      savedAt: asNonEmptyString(record.savedAt) || new Date(0).toISOString(),
    }
  }

  return null
}

export function summarizeStoredBridgeConnectionCredentials(value: unknown): {
  storageMode: "encrypted" | "plaintext-fallback" | "unknown"
  hasCredentials: boolean
} {
  const parsed = parseStoredCredentials(value)
  if (!parsed) {
    return {
      storageMode: "unknown",
      hasCredentials: false,
    }
  }

  if (parsed.storageMode === "plaintext-fallback") {
    return {
      storageMode: "plaintext-fallback",
      hasCredentials: Object.keys(parsed.plaintext).length > 0,
    }
  }

  return {
    storageMode: "encrypted",
    hasCredentials: true,
  }
}

export async function storeBridgeConnectionCredentials(args: {
  connectionId: string
  credentials: BridgeConnectionCredentials
}): Promise<StoredBridgeConnectionCredentials> {
  const context = buildBridgeConnectionCredentialsContext(args.connectionId)
  const now = new Date().toISOString()

  if (!walletEnclaveEnabled()) {
    if (encryptionRequired()) {
      throw new BridgeConnectionSecretsError(
        "Wallet enclave is disabled; encrypted bridge connection credentials are required.",
        {
          status: 503,
          code: "WALLET_ENCLAVE_DISABLED",
        },
      )
    }

    return {
      storageMode: "plaintext-fallback",
      plaintext: args.credentials as Record<string, unknown>,
      savedAt: now,
    }
  }

  try {
    const encrypted = await encryptWithWalletEnclave({
      context,
      plaintextB64: toBase64(JSON.stringify(args.credentials)),
    })

    return {
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
        throw new BridgeConnectionSecretsError("Wallet enclave encryption failed.", {
          status: error.status,
          code: error.code,
          details: error.details,
        })
      }

      throw new BridgeConnectionSecretsError(
        `Wallet enclave encryption failed: ${(error as Error).message}`,
      )
    }

    return {
      storageMode: "plaintext-fallback",
      plaintext: args.credentials as Record<string, unknown>,
      savedAt: now,
    }
  }
}

export async function resolveBridgeConnectionCredentials(args: {
  provider: BridgeConnectionProvider
  connectionId: string
  stored: unknown
}): Promise<BridgeConnectionCredentials> {
  const parsed = parseStoredCredentials(args.stored)

  if (parsed?.storageMode === "plaintext-fallback") {
    return validateBridgeConnectionCredentials(args.provider, parsed.plaintext)
  }

  if (parsed?.storageMode === "encrypted") {
    try {
      const decrypted = await decryptWithWalletEnclave({
        context: parsed.context || buildBridgeConnectionCredentialsContext(args.connectionId),
        ciphertextB64: parsed.ciphertextB64,
        nonceB64: parsed.nonceB64,
      })
      const plaintextJson = fromBase64(decrypted.plaintextB64)
      const decoded = JSON.parse(plaintextJson) as unknown
      return validateBridgeConnectionCredentials(args.provider, decoded)
    } catch (error) {
      if (error instanceof WalletEnclaveError) {
        throw new BridgeConnectionSecretsError("Wallet enclave decryption failed.", {
          status: error.status,
          code: error.code,
          details: error.details,
        })
      }

      throw new BridgeConnectionSecretsError(
        `Bridge connection credential decryption failed: ${(error as Error).message}`,
      )
    }
  }

  // Compatibility fallback for legacy/unwrapped JSON credentials.
  return validateBridgeConnectionCredentials(args.provider, args.stored)
}
