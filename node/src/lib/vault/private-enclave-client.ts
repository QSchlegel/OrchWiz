import {
  decryptWithWalletEnclave,
  encryptWithWalletEnclave,
  requirePrivateMemoryEncryption,
  walletEnclaveEnabled,
  WalletEnclaveError,
} from "@/lib/wallet-enclave/client"
import {
  buildPrivateVaultEncryptionContext,
  PRIVATE_ENCRYPTION_ENVELOPE_KIND,
  PRIVATE_ENCRYPTION_ENVELOPE_VERSION,
  type PrivateVaultEncryptedEnvelope,
} from "./private-encryption"

export class PrivateVaultEncryptionError extends Error {
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
    this.name = "PrivateVaultEncryptionError"
    this.status = options.status ?? 500
    this.code = options.code ?? "PRIVATE_VAULT_ENCRYPTION_ERROR"
    this.details = options.details
  }
}

export function privateMemoryEncryptionRequired(): boolean {
  return requirePrivateMemoryEncryption()
}

function privateMemoryEncryptionEnabled(): boolean {
  return walletEnclaveEnabled()
}

function toBase64(plaintext: string): string {
  return Buffer.from(plaintext, "utf8").toString("base64")
}

function fromBase64(payload: string): string {
  return Buffer.from(payload, "base64").toString("utf8")
}

export async function encryptPrivateVaultContent(args: {
  relativePath: string
  plaintext: string
  enclaveUrl?: string
}): Promise<PrivateVaultEncryptedEnvelope> {
  const mustEncrypt = privateMemoryEncryptionRequired()
  if (!privateMemoryEncryptionEnabled()) {
    throw new PrivateVaultEncryptionError("Wallet enclave is disabled for private memory encryption.", {
      status: mustEncrypt ? 503 : 200,
      code: "WALLET_ENCLAVE_DISABLED",
    })
  }

  try {
    const context = buildPrivateVaultEncryptionContext(args.relativePath)
    const encrypted = await encryptWithWalletEnclave({
      context,
      plaintextB64: toBase64(args.plaintext),
      enclaveUrl: args.enclaveUrl,
    })

    return {
      kind: PRIVATE_ENCRYPTION_ENVELOPE_KIND,
      version: PRIVATE_ENCRYPTION_ENVELOPE_VERSION,
      alg: encrypted.alg,
      context,
      ciphertextB64: encrypted.ciphertextB64,
      nonceB64: encrypted.nonceB64,
      encryptedAt: new Date().toISOString(),
    }
  } catch (error) {
    if (error instanceof PrivateVaultEncryptionError) {
      throw error
    }

    if (error instanceof WalletEnclaveError) {
      throw new PrivateVaultEncryptionError("Wallet enclave encryption failed.", {
        status: error.status,
        code: error.code,
        details: error.details,
      })
    }

    throw new PrivateVaultEncryptionError(`Wallet enclave encryption failed: ${(error as Error).message}`)
  }
}

export async function decryptPrivateVaultContent(args: {
  envelope: PrivateVaultEncryptedEnvelope
  enclaveUrl?: string
}): Promise<string> {
  const mustDecrypt = privateMemoryEncryptionRequired()
  if (!privateMemoryEncryptionEnabled()) {
    throw new PrivateVaultEncryptionError("Wallet enclave is disabled for private memory decryption.", {
      status: mustDecrypt ? 503 : 200,
      code: "WALLET_ENCLAVE_DISABLED",
    })
  }

  try {
    const decrypted = await decryptWithWalletEnclave({
      context: args.envelope.context,
      ciphertextB64: args.envelope.ciphertextB64,
      nonceB64: args.envelope.nonceB64,
      enclaveUrl: args.enclaveUrl,
    })
    return fromBase64(decrypted.plaintextB64)
  } catch (error) {
    if (error instanceof PrivateVaultEncryptionError) {
      throw error
    }

    if (error instanceof WalletEnclaveError) {
      throw new PrivateVaultEncryptionError("Wallet enclave decryption failed.", {
        status: error.status,
        code: error.code,
        details: error.details,
      })
    }

    throw new PrivateVaultEncryptionError(`Wallet enclave decryption failed: ${(error as Error).message}`)
  }
}
