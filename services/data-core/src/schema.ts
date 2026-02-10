import { z } from "zod"

export const memoryDomainSchema = z.enum(["orchwiz", "ship", "agent-public"])
export type MemoryDomain = z.infer<typeof memoryDomainSchema>

export const operationSchema = z.enum(["upsert", "delete", "move", "merge"])
export type MemoryOperation = z.infer<typeof operationSchema>

export const signatureEnvelopeSchema = z.object({
  chain: z.literal("cardano"),
  alg: z.literal("cip8-ed25519"),
  keyRef: z.string().min(1),
  address: z.string().min(1),
  key: z.string().optional(),
  signature: z.string().min(1),
  payloadHash: z.string().min(8),
  signedAt: z.string().datetime(),
})

export const writeMetadataSchema = z.object({
  tags: z.array(z.string()).optional(),
  citations: z.array(z.string()).optional(),
  source: z.enum(["agent", "user", "system"]),
  writerType: z.enum(["agent", "user", "system"]),
  writerId: z.string().min(1),
  fromCanonicalPath: z.string().optional(),
})

export const eventSchema = z.object({
  sourceCoreId: z.string().min(1),
  sourceSeq: z.number().int().nonnegative(),
  occurredAt: z.string().datetime(),
  idempotencyKey: z.string().min(8).max(256),
})

export const memoryWriteEnvelopeSchema = z.object({
  operation: operationSchema,
  domain: memoryDomainSchema,
  canonicalPath: z.string().min(1),
  contentMarkdown: z.string().optional(),
  metadata: writeMetadataSchema,
  event: eventSchema,
  signature: signatureEnvelopeSchema,
})

export type MemoryWriteEnvelope = z.infer<typeof memoryWriteEnvelopeSchema>

export const signerUpsertSchema = z.object({
  writerType: z.enum(["agent", "user", "system"]),
  writerId: z.string().min(1),
  keyRef: z.string().min(1),
  address: z.string().min(1),
  key: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const queryRequestSchema = z.object({
  query: z.string().trim().min(1),
  domain: memoryDomainSchema.optional(),
  prefix: z.string().optional(),
  mode: z.enum(["hybrid", "lexical"]).optional(),
  k: z.number().int().min(1).max(100).optional(),
})

export const moveRequestSchema = z.object({
  operation: z.literal("move"),
  domain: memoryDomainSchema,
  canonicalPath: z.string().min(1),
  fromCanonicalPath: z.string().min(1),
  metadata: writeMetadataSchema,
  event: eventSchema,
  signature: signatureEnvelopeSchema,
  contentMarkdown: z.string().optional(),
})

export const syncEventsRequestSchema = z.object({
  sourceCoreId: z.string().min(1),
  events: z.array(memoryWriteEnvelopeSchema).max(500),
})
