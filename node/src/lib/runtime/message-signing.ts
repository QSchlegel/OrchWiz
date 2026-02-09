import crypto from "node:crypto"
import type { EnclaveSignDataResponse } from "@/lib/wallet-enclave/client"
import type { RuntimeSignatureBundle } from "@/lib/types/runtime"

export interface CanonicalBridgeMessagePayload {
  sessionId: string
  interactionType: "ai_response"
  bridgeCrewId: string
  bridgeStationKey: string
  provider: string
  content: string
  signedAt: string
}

export interface BridgeMessageSignatureMetadata {
  source: "runtime" | "enclave"
  chain: "cardano"
  keyRef: string
  address?: string
  key?: string
  signature: string
  algorithm: string
  payload: string
  payloadHash: string
  signedAt: string
  verified: boolean
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`
  }

  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort((a, b) => a.localeCompare(b))
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`
}

function hashSha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex")
}

export function buildCanonicalBridgeSigningPayload(input: CanonicalBridgeMessagePayload): {
  payload: CanonicalBridgeMessagePayload
  payloadJson: string
  payloadHash: string
} {
  const payload = {
    sessionId: input.sessionId,
    interactionType: "ai_response" as const,
    bridgeCrewId: input.bridgeCrewId,
    bridgeStationKey: input.bridgeStationKey,
    provider: input.provider,
    content: input.content,
    signedAt: input.signedAt,
  }

  const payloadJson = stableStringify(payload)
  return {
    payload,
    payloadJson,
    payloadHash: hashSha256Hex(payloadJson),
  }
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

export function validateRuntimeSignatureBundle(
  bundle: RuntimeSignatureBundle | null | undefined,
  payloadHash: string,
): bundle is RuntimeSignatureBundle {
  if (!bundle) return false
  if (!hasNonEmptyString(bundle.signature)) return false
  if (!hasNonEmptyString(bundle.keyRef)) return false
  if (!hasNonEmptyString(bundle.algorithm)) return false
  if (!hasNonEmptyString(bundle.signedAt)) return false
  if (!hasNonEmptyString(bundle.payloadHash)) return false
  if (bundle.payloadHash !== payloadHash) return false
  return true
}

export function signatureMetadataFromRuntimeBundle(
  bundle: RuntimeSignatureBundle,
  payloadJson: string,
): BridgeMessageSignatureMetadata {
  return {
    source: "runtime",
    chain: "cardano",
    keyRef: bundle.keyRef,
    address: bundle.address,
    key: bundle.key,
    signature: bundle.signature,
    algorithm: bundle.algorithm,
    payload: payloadJson,
    payloadHash: bundle.payloadHash,
    signedAt: bundle.signedAt,
    verified: true,
  }
}

export function signatureMetadataFromEnclave(
  response: EnclaveSignDataResponse,
  payloadJson: string,
  signedAt: string,
): BridgeMessageSignatureMetadata {
  return {
    source: "enclave",
    chain: "cardano",
    keyRef: response.keyRef,
    address: response.address,
    key: response.key,
    signature: response.signature,
    algorithm: response.alg,
    payload: payloadJson,
    payloadHash: response.payloadHash,
    signedAt,
    verified: true,
  }
}
