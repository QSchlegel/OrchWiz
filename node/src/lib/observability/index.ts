import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import {
  createTraceGateway,
  type TraceGateway,
  type TraceEmitInput,
  type TraceDecryptInput,
  type DecryptedTraceView,
} from "./trace-gateway"

const gateway: TraceGateway = createTraceGateway({
  persist: async (input) => {
    const payload = JSON.parse(JSON.stringify(input.payload)) as Prisma.InputJsonValue
    const metadata =
      input.metadata === undefined
        ? undefined
        : (JSON.parse(JSON.stringify(input.metadata)) as Prisma.InputJsonValue)

    await prisma.observabilityTrace.upsert({
      where: {
        traceId: input.traceId,
      },
      create: {
        traceId: input.traceId,
        userId: input.userId ?? null,
        sessionId: input.sessionId ?? null,
        source: input.source ?? null,
        status: input.status ?? null,
        payload,
        metadata,
      },
      update: {
        userId: input.userId ?? null,
        sessionId: input.sessionId ?? null,
        source: input.source ?? null,
        status: input.status ?? null,
        payload,
        metadata,
      },
    })
  },
})

export async function emitTrace(input: TraceEmitInput): Promise<void> {
  await gateway.emitTrace(input)
}

export async function decryptTraceFields(input: TraceDecryptInput): Promise<DecryptedTraceView> {
  return gateway.decryptTraceFields(input)
}
