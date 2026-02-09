import crypto from "node:crypto"
import { z } from "zod"

const eventTypeSchema = z.enum([
  "session",
  "task",
  "command_execution",
  "verification",
  "action",
  "deployment",
  "application",
  "bridge_station",
  "system_status",
])

export const forwardingEventInputSchema = z.object({
  eventType: eventTypeSchema,
  dedupeKey: z.string().min(8).max(256).optional(),
  occurredAt: z
    .union([z.string().datetime(), z.number().int().nonnegative()])
    .optional(),
  payload: z.record(z.string(), z.unknown()),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type ForwardingEventInput = z.infer<typeof forwardingEventInputSchema>

export function parseForwardingEventInput(input: unknown): ForwardingEventInput {
  return forwardingEventInputSchema.parse(input)
}

export function resolveOccurredAt(input: ForwardingEventInput): Date {
  if (typeof input.occurredAt === "string") {
    return new Date(input.occurredAt)
  }

  if (typeof input.occurredAt === "number") {
    return new Date(input.occurredAt)
  }

  return new Date()
}

export function buildDedupeKey(sourceNodeId: string, event: ForwardingEventInput, occurredAt: Date): string {
  if (event.dedupeKey) {
    return event.dedupeKey
  }

  return crypto
    .createHash("sha256")
    .update(`${sourceNodeId}:${event.eventType}:${occurredAt.toISOString()}:${JSON.stringify(event.payload)}`)
    .digest("hex")
}
