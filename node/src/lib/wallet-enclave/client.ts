interface EnclaveApiErrorShape {
  error?: {
    code?: string
    message?: string
    details?: unknown
    requestId?: string
  }
}

interface EnclaveRequestOptions {
  enclaveUrl?: string
  timeoutMs?: number
}

export interface EnclaveSignDataResponse {
  chain: "cardano"
  keyRef: string
  address: string
  payloadHash: string
  key: string
  signature: string
  alg: "cip8-ed25519"
}

export interface EnclaveEncryptResponse {
  context: string
  ciphertextB64: string
  nonceB64: string
  alg: "AES-256-GCM"
}

export interface EnclaveDecryptResponse {
  context: string
  plaintextB64: string
  alg: "AES-256-GCM"
}

export interface EnclaveAddressResponse {
  chain: "cardano"
  keyRef: string
  address: string
}

export class WalletEnclaveError extends Error {
  status: number
  code: string
  details?: unknown
  requestId?: string

  constructor(
    message: string,
    options: {
      status?: number
      code?: string
      details?: unknown
      requestId?: string
    } = {},
  ) {
    super(message)
    this.name = "WalletEnclaveError"
    this.status = options.status ?? 500
    this.code = options.code ?? "WALLET_ENCLAVE_ERROR"
    this.details = options.details
    this.requestId = options.requestId
  }
}

function envFlag(name: string, fallback = true): boolean {
  const value = process.env[name]
  if (value === undefined) {
    return fallback
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false
  }
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true
  }

  return fallback
}

export function walletEnclaveEnabled(): boolean {
  return envFlag("WALLET_ENCLAVE_ENABLED", true)
}

export function requireBridgeSignatures(): boolean {
  return envFlag("WALLET_ENCLAVE_REQUIRE_BRIDGE_SIGNATURES", true)
}

export function requirePrivateMemoryEncryption(): boolean {
  return envFlag("WALLET_ENCLAVE_REQUIRE_PRIVATE_MEMORY_ENCRYPTION", true)
}

function defaultTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.WALLET_ENCLAVE_TIMEOUT_MS || "4000", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 4000
  }
  return parsed
}

function baseUrl(override?: string): string {
  const raw = override || process.env.WALLET_ENCLAVE_URL || "http://127.0.0.1:3377"
  return raw.replace(/\/+$/u, "")
}

function authHeader(): Record<string, string> {
  const sharedSecret = process.env.WALLET_ENCLAVE_SHARED_SECRET
  if (!sharedSecret || !sharedSecret.trim()) {
    return {}
  }

  return {
    "x-wallet-enclave-token": sharedSecret,
  }
}

async function requestEnclave<T>(
  path: string,
  body: Record<string, unknown>,
  options: EnclaveRequestOptions = {},
): Promise<T> {
  if (!walletEnclaveEnabled()) {
    throw new WalletEnclaveError("Wallet enclave is disabled", {
      status: 503,
      code: "WALLET_ENCLAVE_DISABLED",
    })
  }

  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(`${baseUrl(options.enclaveUrl)}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeader(),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (error) {
    const message =
      (error as Error).name === "AbortError"
        ? `Wallet enclave request timed out after ${timeoutMs}ms`
        : `Wallet enclave request failed: ${(error as Error).message}`

    throw new WalletEnclaveError(message, {
      status: 503,
      code: "WALLET_ENCLAVE_UNREACHABLE",
    })
  } finally {
    clearTimeout(timer)
  }

  const payload = (await response.json().catch(() => ({}))) as EnclaveApiErrorShape & T

  if (!response.ok) {
    throw new WalletEnclaveError(payload.error?.message || "Wallet enclave rejected request", {
      status: response.status,
      code: payload.error?.code || "WALLET_ENCLAVE_REJECTED",
      details: payload.error?.details,
      requestId: payload.error?.requestId,
    })
  }

  return payload as T
}

export async function getWalletAddress(args: {
  keyRef: string
  enclaveUrl?: string
  timeoutMs?: number
}): Promise<EnclaveAddressResponse> {
  return requestEnclave<EnclaveAddressResponse>(
    "/v1/addr",
    {
      chain: "cardano",
      keyRef: args.keyRef,
    },
    {
      enclaveUrl: args.enclaveUrl,
      timeoutMs: args.timeoutMs,
    },
  )
}

export async function signMessagePayload(args: {
  keyRef: string
  payload: string
  address?: string
  idempotencyKey?: string
  enclaveUrl?: string
  timeoutMs?: number
}): Promise<EnclaveSignDataResponse> {
  return requestEnclave<EnclaveSignDataResponse>(
    "/v1/sign-data",
    {
      chain: "cardano",
      keyRef: args.keyRef,
      payload: args.payload,
      address: args.address,
      idempotencyKey: args.idempotencyKey,
    },
    {
      enclaveUrl: args.enclaveUrl,
      timeoutMs: args.timeoutMs,
    },
  )
}

export async function encryptWithWalletEnclave(args: {
  context: string
  plaintextB64: string
  enclaveUrl?: string
  timeoutMs?: number
}): Promise<EnclaveEncryptResponse> {
  return requestEnclave<EnclaveEncryptResponse>(
    "/v1/crypto/encrypt",
    {
      context: args.context,
      plaintextB64: args.plaintextB64,
    },
    {
      enclaveUrl: args.enclaveUrl,
      timeoutMs: args.timeoutMs,
    },
  )
}

export async function decryptWithWalletEnclave(args: {
  context: string
  ciphertextB64: string
  nonceB64: string
  enclaveUrl?: string
  timeoutMs?: number
}): Promise<EnclaveDecryptResponse> {
  return requestEnclave<EnclaveDecryptResponse>(
    "/v1/crypto/decrypt",
    {
      context: args.context,
      ciphertextB64: args.ciphertextB64,
      nonceB64: args.nonceB64,
    },
    {
      enclaveUrl: args.enclaveUrl,
      timeoutMs: args.timeoutMs,
    },
  )
}
