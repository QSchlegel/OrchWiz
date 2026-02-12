import crypto from "node:crypto"
import type {
  BridgeConnection,
  BridgeDispatchDelivery,
  BridgeDispatchSource,
  BridgeDispatchStatus,
  Prisma,
} from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { publishRealtimeEvent } from "@/lib/realtime/events"
import { resolveBridgeDispatchRuntime } from "./dispatch-runtime"
import { dispatchBridgeConnectionViaRuntime } from "./runtime-adapter"
import { resolveBridgeConnectionCredentials } from "./secrets"

const BRIDGE_DISPATCH_RETRY_BASE_MS = 1_000
const BRIDGE_DISPATCH_MAX_ATTEMPTS = 6
const BRIDGE_DISPATCH_RETAIN_COUNT = 500

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

function asJsonValue(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function readPositiveInt(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] || "", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

function retryBaseMs(): number {
  return readPositiveInt("BRIDGE_DISPATCH_RETRY_BASE_MS", BRIDGE_DISPATCH_RETRY_BASE_MS)
}

function maxAttempts(): number {
  return readPositiveInt("BRIDGE_DISPATCH_MAX_ATTEMPTS", BRIDGE_DISPATCH_MAX_ATTEMPTS)
}

function retainCount(): number {
  return readPositiveInt("BRIDGE_DISPATCH_RETAIN_COUNT", BRIDGE_DISPATCH_RETAIN_COUNT)
}

export function computeBridgeDispatchRetrySchedule(args: {
  attempts: number
  now?: Date
  maxAttemptsOverride?: number
  baseDelayMsOverride?: number
}): {
  terminal: boolean
  nextAttemptAt: Date | null
} {
  const cap = args.maxAttemptsOverride ?? maxAttempts()
  const now = args.now || new Date()

  if (args.attempts >= cap) {
    return {
      terminal: true,
      nextAttemptAt: null,
    }
  }

  const delayMs = Math.min(
    5 * 60 * 1000,
    (args.baseDelayMsOverride ?? retryBaseMs()) * 2 ** Math.max(0, args.attempts - 1),
  )

  return {
    terminal: false,
    nextAttemptAt: new Date(now.getTime() + delayMs),
  }
}

function buildDeliveryDedupeKey(input: {
  deploymentId: string
  connectionId: string
  source: BridgeDispatchSource
  message: string
  payload: Record<string, unknown>
}): string {
  return crypto
    .createHash("sha256")
    .update(
      `${input.deploymentId}:${input.connectionId}:${input.source}:${Date.now()}:${JSON.stringify(input.payload)}:${input.message}`,
    )
    .digest("hex")
}

function sanitizeConnectionIds(value: string[] | undefined): string[] {
  if (!value || value.length === 0) {
    return []
  }

  return [...new Set(value.map((entry) => entry.trim()).filter((entry) => entry.length > 0))]
}

export async function enqueueBridgeDispatchDeliveries(args: {
  deploymentId: string
  source: BridgeDispatchSource
  message: string
  payload?: Record<string, unknown>
  metadata?: Record<string, unknown>
  connectionIds?: string[]
  autoRelayOnly?: boolean
  includeDisabled?: boolean
}): Promise<BridgeDispatchDelivery[]> {
  const message = args.message.trim()
  if (!message) {
    return []
  }

  const connectionIds = sanitizeConnectionIds(args.connectionIds)
  const where: Prisma.BridgeConnectionWhereInput = {
    deploymentId: args.deploymentId,
    ...(args.includeDisabled ? {} : { enabled: true }),
    ...(args.autoRelayOnly ? { autoRelay: true } : {}),
    ...(connectionIds.length > 0 ? { id: { in: connectionIds } } : {}),
  }

  const connections = await prisma.bridgeConnection.findMany({
    where,
    orderBy: {
      createdAt: "asc",
    },
  })

  if (connections.length === 0) {
    return []
  }

  const payload = args.payload || {}
  const metadata = args.metadata || {}
  const deploymentOwner = await prisma.agentDeployment.findUnique({
    where: {
      id: args.deploymentId,
    },
    select: {
      userId: true,
    },
  })

  const created = await prisma.$transaction(async (tx) => {
    const rows: BridgeDispatchDelivery[] = []

    for (const connection of connections) {
      const snapshot = {
        ...payload,
        connector: {
          id: connection.id,
          name: connection.name,
          provider: connection.provider,
          destination: connection.destination,
          config: asRecord(connection.config),
        },
        metadata,
      }

      rows.push(
        await tx.bridgeDispatchDelivery.create({
          data: {
            deploymentId: args.deploymentId,
            connectionId: connection.id,
            source: args.source,
            status: "pending",
            dedupeKey: buildDeliveryDedupeKey({
              deploymentId: args.deploymentId,
              connectionId: connection.id,
              source: args.source,
              message,
              payload: snapshot,
            }),
            message,
            payload: asJsonValue(snapshot),
            nextAttemptAt: new Date(),
          },
        }),
      )
    }

    return rows
  })

  publishRealtimeEvent({
    type: "bridge.comms.updated",
    ...(deploymentOwner?.userId
      ? {
          userId: deploymentOwner.userId,
        }
      : {}),
    payload: {
      kind: "dispatch.enqueued",
      deploymentId: args.deploymentId,
      source: args.source,
      count: created.length,
      deliveryIds: created.map((item) => item.id),
    },
  })

  return created
}

async function claimBridgeDispatchDelivery(delivery: BridgeDispatchDelivery): Promise<boolean> {
  const now = new Date()
  const result = await prisma.bridgeDispatchDelivery.updateMany({
    where: {
      id: delivery.id,
      AND: [
        {
          OR: [{ status: "pending" }, { status: "failed" }],
        },
        {
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
        },
      ],
    },
    data: {
      status: "processing",
    },
  })

  return result.count === 1
}

async function runBridgeDispatchDelivery(
  delivery: BridgeDispatchDelivery & { connection: BridgeConnection },
): Promise<{
  providerMessageId: string | null
  resultPayload: Record<string, unknown>
}> {
  const credentials = await resolveBridgeConnectionCredentials({
    provider: delivery.connection.provider,
    connectionId: delivery.connection.id,
    stored: delivery.connection.credentials,
  })

  const payload = asRecord(delivery.payload)
  const runtimeId = resolveBridgeDispatchRuntime(asRecord(payload.runtime).id)
  const bridgeContext = asRecord(payload.bridgeContext)

  const dispatchResult = await dispatchBridgeConnectionViaRuntime({
    runtimeId,
    input: {
      deliveryId: delivery.id,
      provider: delivery.connection.provider,
      destination: delivery.connection.destination,
      message: delivery.message,
      config: asRecord(delivery.connection.config),
      credentials,
      metadata: {
        deliveryId: delivery.id,
        deploymentId: delivery.deploymentId,
        connectionId: delivery.connection.id,
        connectionName: delivery.connection.name,
        source: delivery.source,
        runtime: {
          id: runtimeId,
        },
        ...(Object.keys(bridgeContext).length > 0
          ? {
              bridgeContext,
            }
          : {}),
        payload,
      },
    },
  })

  if (!dispatchResult.ok) {
    const reason =
      asNonEmptyString(dispatchResult.payload.error) ||
      asNonEmptyString(asRecord(dispatchResult.payload.error).message) ||
      `Dispatch failed with status ${dispatchResult.status}`
    throw new Error(reason)
  }

  return {
    providerMessageId: dispatchResult.providerMessageId,
    resultPayload: dispatchResult.payload,
  }
}

export async function pruneBridgeDispatchDeliveries(args: {
  deploymentId: string
  keepLatest?: number
}): Promise<number> {
  const keepLatest = Math.max(1, args.keepLatest ?? retainCount())
  const stale = await prisma.bridgeDispatchDelivery.findMany({
    where: {
      deploymentId: args.deploymentId,
      status: {
        in: ["completed", "failed"],
      },
    },
    select: {
      id: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    skip: keepLatest,
  })

  if (stale.length === 0) {
    return 0
  }

  const result = await prisma.bridgeDispatchDelivery.deleteMany({
    where: {
      id: {
        in: stale.map((entry) => entry.id),
      },
    },
  })

  return result.count
}

export async function drainBridgeDispatchQueue(options: {
  limit?: number
  deploymentId?: string
} = {}): Promise<number> {
  const now = new Date()
  const limit = Math.max(1, Math.min(100, options.limit ?? 20))

  const jobs = await prisma.bridgeDispatchDelivery.findMany({
    where: {
      ...(options.deploymentId ? { deploymentId: options.deploymentId } : {}),
      OR: [
        {
          status: "pending",
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
        },
        {
          status: "failed",
          nextAttemptAt: {
            lte: now,
          },
        },
      ],
    },
    include: {
      connection: true,
      deployment: {
        select: {
          userId: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
    take: limit,
  })

  let processed = 0

  for (const job of jobs) {
    const claimed = await claimBridgeDispatchDelivery(job)
    if (!claimed) {
      continue
    }

    try {
      const success = await runBridgeDispatchDelivery(job)
      const deliveredAt = new Date()

      await prisma.$transaction(async (tx) => {
        await tx.bridgeDispatchDelivery.update({
          where: {
            id: job.id,
          },
          data: {
            status: "completed",
            deliveredAt,
            nextAttemptAt: null,
            providerMessageId: success.providerMessageId,
            result: asJsonValue(success.resultPayload),
            lastError: null,
          },
        })

        await tx.bridgeConnection.update({
          where: {
            id: job.connectionId,
          },
          data: {
            lastDeliveryAt: deliveredAt,
            lastDeliveryStatus: "completed",
            lastError: null,
          },
        })
      })

      publishRealtimeEvent({
        type: "bridge.comms.updated",
        userId: job.deployment.userId,
        payload: {
          kind: "dispatch.completed",
          deploymentId: job.deploymentId,
          connectionId: job.connectionId,
          deliveryId: job.id,
          source: job.source,
          status: "completed",
        },
      })

      await pruneBridgeDispatchDeliveries({ deploymentId: job.deploymentId })
      processed += 1
    } catch (error) {
      const attempts = job.attempts + 1
      const schedule = computeBridgeDispatchRetrySchedule({ attempts })
      const terminalStatus: BridgeDispatchStatus = schedule.terminal ? "failed" : "failed"
      const lastError = (error as Error).message || "Unknown bridge dispatch failure"

      await prisma.bridgeDispatchDelivery.update({
        where: {
          id: job.id,
        },
        data: {
          status: terminalStatus,
          attempts,
          nextAttemptAt: schedule.nextAttemptAt,
          lastError,
        },
      })

      if (schedule.terminal) {
        await prisma.bridgeConnection.update({
          where: {
            id: job.connectionId,
          },
          data: {
            lastDeliveryStatus: "failed",
            lastError,
          },
        })

        publishRealtimeEvent({
          type: "bridge.comms.updated",
          userId: job.deployment.userId,
          payload: {
            kind: "dispatch.failed",
            deploymentId: job.deploymentId,
            connectionId: job.connectionId,
            deliveryId: job.id,
            source: job.source,
            status: "failed",
            error: lastError,
          },
        })

        await pruneBridgeDispatchDeliveries({ deploymentId: job.deploymentId })
      }
    }
  }

  return processed
}

export async function drainBridgeDispatchQueueSafely(options: {
  limit?: number
  deploymentId?: string
  label?: string
} = {}): Promise<void> {
  try {
    await drainBridgeDispatchQueue(options)
  } catch (error) {
    const suffix = options.label ? ` (${options.label})` : ""
    console.error(`Bridge dispatch drain failed${suffix}:`, error)
  }
}

export async function listBridgeDispatchDeliveries(args: {
  deploymentId: string
  take?: number
}): Promise<Array<BridgeDispatchDelivery & { connection: BridgeConnection }>> {
  const take = Math.max(1, Math.min(100, args.take ?? 20))
  return prisma.bridgeDispatchDelivery.findMany({
    where: {
      deploymentId: args.deploymentId,
    },
    include: {
      connection: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take,
  })
}
