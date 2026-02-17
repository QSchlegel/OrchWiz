import { z } from "zod"

export const ChainSchema = z.literal("cardano")

export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  service: z.literal("wallet-enclave"),
  ts: z.string(),
})

export const AddrRequestSchema = z.object({
  chain: ChainSchema,
  keyRef: z.string().min(1),
})

export const AddrResponseSchema = z.object({
  chain: ChainSchema,
  keyRef: z.string(),
  address: z.string(),
})

export const SignDataRequestSchema = z.object({
  chain: ChainSchema,
  keyRef: z.string().min(1),
  payload: z.string().min(1),
  address: z.string().optional(),
  idempotencyKey: z.string().min(1).optional(),
})

export const SignDataResponseSchema = z.object({
  chain: ChainSchema,
  keyRef: z.string(),
  address: z.string(),
  payloadHash: z.string(),
  key: z.string(),
  signature: z.string(),
  alg: z.literal("cip8-ed25519"),
})

export const EncryptRequestSchema = z.object({
  context: z.string().min(1),
  plaintextB64: z.string().min(1),
})

export const EncryptResponseSchema = z.object({
  context: z.string(),
  ciphertextB64: z.string(),
  nonceB64: z.string(),
  alg: z.literal("AES-256-GCM"),
})

export const DecryptRequestSchema = z.object({
  context: z.string().min(1),
  ciphertextB64: z.string().min(1),
  nonceB64: z.string().min(1),
})

export const DecryptResponseSchema = z.object({
  context: z.string(),
  plaintextB64: z.string(),
  alg: z.literal("AES-256-GCM"),
})

export const SendAdaRequestSchema = z.object({
  chain: ChainSchema,
  keyRef: z.string().min(1),
  recipientAddress: z.string().min(1),
  lovelace: z.string().min(1).regex(/^\d+$/u, "lovelace must be a non-negative integer string"),
})

export const MintTokenRequestSchema = z.object({
  chain: ChainSchema,
  keyRef: z.string().min(1),
  assetName: z.string().min(1).max(32),
  quantity: z.string().min(1).regex(/^\d+$/u, "quantity must be a non-negative integer string"),
  recipientAddress: z.string().optional(),
})

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
  }),
})
