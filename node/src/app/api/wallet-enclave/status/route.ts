import { NextResponse } from "next/server"
import {
  walletEnclaveEnabled,
  requireBridgeSignatures,
  requirePrivateMemoryEncryption,
} from "@/lib/wallet-enclave/client"

export const dynamic = "force-dynamic"

async function probeEndpoint(
  baseUrl: string,
  path: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<{ reachable: boolean; status?: number; error?: string }> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2500)
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timer)
    // Any response (even 400/401) means the endpoint is reachable
    return { reachable: true, status: response.status }
  } catch {
    return { reachable: false }
  }
}

export async function GET() {
  const enabled = walletEnclaveEnabled()
  const enclaveUrl = (process.env.WALLET_ENCLAVE_URL || "http://127.0.0.1:3377").replace(/\/+$/u, "")
  const sharedSecret = process.env.WALLET_ENCLAVE_SHARED_SECRET || null
  const masterSecretSet = !!process.env.WALLET_ENCLAVE_MASTER_SECRET

  const config = {
    enabled,
    requireBridgeSignatures: requireBridgeSignatures(),
    requirePrivateMemoryEncryption: requirePrivateMemoryEncryption(),
    sharedSecretConfigured: !!sharedSecret?.trim(),
    masterSecretConfigured: masterSecretSet,
    timeoutMs: Number.parseInt(process.env.WALLET_ENCLAVE_TIMEOUT_MS || "4000", 10) || 4000,
  }

  if (!enabled) {
    return NextResponse.json({
      status: "disabled",
      url: enclaveUrl,
      config,
    })
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3000)

    const response = await fetch(`${enclaveUrl}/health`, {
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!response.ok) {
      return NextResponse.json({
        status: "unhealthy",
        url: enclaveUrl,
        httpStatus: response.status,
        config,
      })
    }

    const health = await response.json().catch(() => ({}))

    // Probe each v1 endpoint to report capabilities.
    // We send minimal invalid bodies — the enclave will respond with 400/401
    // but that still proves the endpoint is live.
    const authHeaders: Record<string, string> = sharedSecret?.trim()
      ? { "x-wallet-enclave-token": sharedSecret }
      : {}

    const [addr, sign, encrypt, decrypt] = await Promise.all([
      probeEndpoint(enclaveUrl, "/v1/addr", { chain: "cardano", keyRef: "__probe__" }, authHeaders),
      probeEndpoint(enclaveUrl, "/v1/sign-data", { chain: "cardano", keyRef: "__probe__", payload: "" }, authHeaders),
      probeEndpoint(enclaveUrl, "/v1/crypto/encrypt", { context: "__probe__", plaintextB64: "" }, authHeaders),
      probeEndpoint(enclaveUrl, "/v1/crypto/decrypt", { context: "__probe__", ciphertextB64: "", nonceB64: "" }, authHeaders),
    ])

    const endpoints = {
      addr: { path: "/v1/addr", reachable: addr.reachable, status: addr.status },
      signData: { path: "/v1/sign-data", reachable: sign.reachable, status: sign.status },
      encrypt: { path: "/v1/crypto/encrypt", reachable: encrypt.reachable, status: encrypt.status },
      decrypt: { path: "/v1/crypto/decrypt", reachable: decrypt.reachable, status: decrypt.status },
    }

    // Determine auth status: if probes get 401, the token is wrong or missing
    const anyUnauthorized = [addr, sign, encrypt, decrypt].some((e) => e.status === 401)
    const authStatus = anyUnauthorized ? "unauthorized" : "ok"

    // Crypto endpoints returning 400 (bad request) is healthy — it means the master secret is configured.
    // If they return a specific error about MASTER_SECRET, they're disabled.
    const cryptoAvailable = encrypt.reachable && encrypt.status !== 401

    return NextResponse.json({
      status: "running",
      url: enclaveUrl,
      health,
      config,
      auth: authStatus,
      endpoints,
      capabilities: {
        signing: addr.reachable && sign.reachable && !anyUnauthorized,
        crypto: cryptoAvailable && !anyUnauthorized,
      },
    })
  } catch {
    return NextResponse.json({
      status: "stopped",
      url: enclaveUrl,
      config,
    })
  }
}
