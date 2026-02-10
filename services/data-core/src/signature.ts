import type { PoolClient } from "pg"
import type { DataCoreDb } from "./db.js"
import type { MemoryWriteEnvelope } from "./schema.js"
import { stableStringify, sha256Hex } from "./util.js"

export function canonicalSigningPayload(envelope: MemoryWriteEnvelope): string {
  const payload = {
    operation: envelope.operation,
    domain: envelope.domain,
    canonicalPath: envelope.canonicalPath,
    contentMarkdown: envelope.contentMarkdown || "",
    metadata: envelope.metadata,
    event: envelope.event,
  }

  return stableStringify(payload)
}

export function canonicalPayloadHash(envelope: MemoryWriteEnvelope): string {
  return sha256Hex(canonicalSigningPayload(envelope))
}

function shouldVerifyWithWalletEnclave(): boolean {
  const raw = process.env.DATA_CORE_WALLET_ENCLAVE_VERIFY
  if (!raw) return false
  const normalized = raw.trim().toLowerCase()
  if (["1", "true", "yes", "on"].includes(normalized)) return true
  if (["0", "false", "no", "off"].includes(normalized)) return false
  return false
}

async function verifySignatureWithWalletEnclave(envelope: MemoryWriteEnvelope): Promise<{ ok: boolean; reason?: string }> {
  if (!shouldVerifyWithWalletEnclave()) {
    return { ok: true }
  }

  const walletUrl = (process.env.WALLET_ENCLAVE_URL || "http://127.0.0.1:3377").replace(/\/+$/u, "")
  const sharedSecret = process.env.WALLET_ENCLAVE_SHARED_SECRET?.trim()
  const payload = canonicalSigningPayload(envelope)

  const response = await fetch(`${walletUrl}/v1/sign-data`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sharedSecret
        ? {
            "x-wallet-enclave-token": sharedSecret,
          }
        : {}),
    },
    body: JSON.stringify({
      chain: "cardano",
      keyRef: envelope.signature.keyRef,
      address: envelope.signature.address,
      payload,
      idempotencyKey: `verify:${envelope.event.idempotencyKey}`,
    }),
  }).catch(() => null)

  if (!response) {
    return { ok: false, reason: "Wallet enclave verification request failed" }
  }
  if (!response.ok) {
    return { ok: false, reason: `Wallet enclave rejected signature verify (${response.status})` }
  }

  const signed = (await response.json().catch(() => null)) as
    | {
        alg?: string
        address?: string
        payloadHash?: string
        signature?: string
      }
    | null

  if (!signed) {
    return { ok: false, reason: "Wallet enclave verification response missing payload" }
  }
  if ((signed.alg || "") !== envelope.signature.alg) {
    return { ok: false, reason: "Wallet enclave algorithm mismatch" }
  }
  if ((signed.address || "") !== envelope.signature.address) {
    return { ok: false, reason: "Wallet enclave address mismatch" }
  }
  if ((signed.payloadHash || "") !== envelope.signature.payloadHash) {
    return { ok: false, reason: "Wallet enclave payload hash mismatch" }
  }
  if ((signed.signature || "") !== envelope.signature.signature) {
    return { ok: false, reason: "Wallet enclave signature mismatch" }
  }

  return { ok: true }
}

interface SignerRecord {
  writer_type: string
  writer_id: string
  key_ref: string
  address: string
}

export async function loadSigner(args: {
  db: DataCoreDb
  client?: PoolClient
  writerType: string
  writerId: string
}): Promise<SignerRecord | null> {
  const sql = `
    SELECT writer_type, writer_id, key_ref, address
    FROM signer_registry
    WHERE writer_type = $1 AND writer_id = $2
    LIMIT 1
  `

  if (args.client) {
    const result = await args.client.query(sql, [args.writerType, args.writerId])
    return (result.rows[0] as SignerRecord | undefined) || null
  }

  const result = await args.db.query<SignerRecord>(sql, [args.writerType, args.writerId])
  return result.rows[0] || null
}

export async function verifyWriteSignature(args: {
  db: DataCoreDb
  client?: PoolClient
  envelope: MemoryWriteEnvelope
}): Promise<{ ok: boolean; reason?: string }> {
  const { envelope } = args
  const signer = await loadSigner({
    db: args.db,
    client: args.client,
    writerType: envelope.metadata.writerType,
    writerId: envelope.metadata.writerId,
  })

  if (!signer) {
    return { ok: false, reason: "Signer is not registered" }
  }

  if (signer.key_ref !== envelope.signature.keyRef) {
    return { ok: false, reason: "Signer keyRef mismatch" }
  }

  if (signer.address !== envelope.signature.address) {
    return { ok: false, reason: "Signer address mismatch" }
  }

  const payloadHash = canonicalPayloadHash(envelope)
  if (payloadHash !== envelope.signature.payloadHash) {
    return { ok: false, reason: "Payload hash mismatch" }
  }

  if (!envelope.signature.signature.trim()) {
    return { ok: false, reason: "Empty signature value" }
  }

  const enclaveVerification = await verifySignatureWithWalletEnclave(envelope)
  if (!enclaveVerification.ok) {
    return enclaveVerification
  }

  return { ok: true }
}
