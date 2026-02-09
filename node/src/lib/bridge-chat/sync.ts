import type {
  BridgeCrewRole,
  BridgeMirrorDirection,
  BridgeMirrorJob,
  BridgeThread,
  Prisma,
  Session,
  SessionInteraction,
} from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getBridgeStationTemplates } from "@/lib/bridge/stations"
import { publishRealtimeEvent } from "@/lib/realtime/events"
import {
  bridgeChatRoleToInteractionType,
  interactionTypeToBridgeChatRole,
  isBridgeStationKey,
} from "@/lib/bridge-chat/mapping"

const BRIDGE_CHANNEL = "bridge-agent"
const BRIDGE_MIRROR_BASE_DELAY_MS = 1_000
export const BRIDGE_MIRROR_MAX_ATTEMPTS = 6

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {}
  }

  return value as Record<string, unknown>
}

function isUniqueConstraintError(error: unknown): boolean {
  return (error as { code?: string })?.code === "P2002"
}

function stationTemplateForKey(stationKey: BridgeCrewRole | string | null | undefined) {
  return getBridgeStationTemplates().find((template) => template.stationKey === stationKey)
}

function bridgeSessionMetadataForStation(stationKey: BridgeCrewRole): Prisma.InputJsonObject {
  const template = stationTemplateForKey(stationKey)
  const callsign = template?.callsign || stationKey.toUpperCase()
  const role = template?.role || "Bridge Specialist"

  return {
    bridge: {
      channel: BRIDGE_CHANNEL,
      stationKey,
      callsign,
      role,
      name: callsign,
    },
  }
}

function inferStationKeyFromMetadata(metadata: unknown): BridgeCrewRole | null {
  const record = asRecord(metadata)
  const bridge = asRecord(record.bridge)
  const stationKey = bridge.stationKey

  if (isBridgeStationKey(stationKey)) {
    return stationKey
  }

  return null
}

function defaultThreadTitle(stationKey?: BridgeCrewRole | string | null): string {
  const template = stationTemplateForKey(stationKey)
  if (template) {
    return `${template.callsign} Bridge Thread`
  }

  return "Bridge"
}

async function upsertThreadBySession(args: {
  sessionId: string
  userId: string | null
  stationKey: BridgeCrewRole | null
  title: string
}): Promise<BridgeThread> {
  const existing = await prisma.bridgeThread.findUnique({
    where: {
      sessionId: args.sessionId,
    },
  })

  if (existing) {
    return prisma.bridgeThread.update({
      where: {
        id: existing.id,
      },
      data: {
        title: args.title,
        userId: args.userId,
        stationKey: args.stationKey,
      },
    })
  }

  try {
    return await prisma.bridgeThread.create({
      data: {
        title: args.title,
        sessionId: args.sessionId,
        userId: args.userId,
        stationKey: args.stationKey,
      },
    })
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const race = await prisma.bridgeThread.findUnique({
        where: {
          sessionId: args.sessionId,
        },
      })
      if (race) {
        return race
      }
    }
    throw error
  }
}

async function ensureBridgeSessionForStation(args: {
  userId: string
  stationKey: BridgeCrewRole
}): Promise<Session> {
  const existing = await prisma.session.findFirst({
    where: {
      userId: args.userId,
      AND: [
        {
          metadata: {
            path: ["bridge", "channel"],
            equals: BRIDGE_CHANNEL,
          },
        },
        {
          metadata: {
            path: ["bridge", "stationKey"],
            equals: args.stationKey,
          },
        },
      ],
    },
    orderBy: {
      updatedAt: "desc",
    },
  })

  if (existing) {
    return existing
  }

  const title = defaultThreadTitle(args.stationKey)
  return prisma.session.create({
    data: {
      userId: args.userId,
      title,
      description: `Bridge conversation channel for ${title.replace(/\s+Bridge Thread$/, "")}`,
      mode: "plan",
      source: "web",
      status: "planning",
      metadata: bridgeSessionMetadataForStation(args.stationKey),
    },
  })
}

async function importSessionInteractionsToThread(args: {
  sessionId: string
  threadId: string
}): Promise<void> {
  const interactions = await prisma.sessionInteraction.findMany({
    where: {
      sessionId: args.sessionId,
    },
    orderBy: {
      timestamp: "asc",
    },
  })

  for (const interaction of interactions) {
    await prisma.$transaction(async (tx) => {
      const existingLink = await tx.bridgeMirrorLink.findUnique({
        where: {
          interactionId: interaction.id,
        },
      })

      if (existingLink) {
        return
      }

      const message = await tx.bridgeMessage.create({
        data: {
          threadId: args.threadId,
          role: interactionTypeToBridgeChatRole(interaction.type),
          content: interaction.content,
          createdAt: interaction.timestamp,
        },
      })

      await tx.bridgeMirrorLink.create({
        data: {
          messageId: message.id,
          interactionId: interaction.id,
        },
      })
    })
  }
}

export async function ensureStationThreadsForUser(userId: string): Promise<BridgeThread[]> {
  const templates = getBridgeStationTemplates()

  for (const template of templates) {
    const stationKey = template.stationKey

    let thread = await prisma.bridgeThread.findFirst({
      where: {
        userId,
        stationKey,
      },
      orderBy: {
        updatedAt: "desc",
      },
    })

    if (!thread) {
      const session = await ensureBridgeSessionForStation({ userId, stationKey })
      thread = await upsertThreadBySession({
        sessionId: session.id,
        userId,
        stationKey,
        title: session.title?.trim() || defaultThreadTitle(stationKey),
      })
    }

    if (!thread.sessionId) {
      const session = await ensureBridgeSessionForStation({ userId, stationKey })
      thread = await prisma.bridgeThread.update({
        where: {
          id: thread.id,
        },
        data: {
          sessionId: session.id,
          title: thread.title || session.title || defaultThreadTitle(stationKey),
        },
      })
    }

    if (!thread.sessionId) {
      continue
    }

    await importSessionInteractionsToThread({
      sessionId: thread.sessionId,
      threadId: thread.id,
    })
  }

  return prisma.bridgeThread.findMany({
    where: {
      userId,
      stationKey: {
        in: templates.map((template) => template.stationKey),
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  })
}

export function sessionToThreadDedupeKey(interactionId: string): string {
  return `s2t:${interactionId}`
}

export function threadToSessionDedupeKey(messageId: string): string {
  return `t2s:${messageId}`
}

async function enqueueMirrorJob(args: {
  dedupeKey: string
  direction: BridgeMirrorDirection
  threadId?: string | null
  sessionId?: string | null
  messageId?: string | null
  interactionId?: string | null
}): Promise<void> {
  try {
    await prisma.bridgeMirrorJob.create({
      data: {
        dedupeKey: args.dedupeKey,
        direction: args.direction,
        status: "pending",
        attempts: 0,
        nextAttemptAt: new Date(),
        threadId: args.threadId || null,
        sessionId: args.sessionId || null,
        messageId: args.messageId || null,
        interactionId: args.interactionId || null,
      },
    })
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return
    }
    throw error
  }
}

export async function enqueueSessionToThreadMirrorJob(args: {
  interactionId: string
  sessionId: string
  threadId?: string | null
}): Promise<void> {
  await enqueueMirrorJob({
    dedupeKey: sessionToThreadDedupeKey(args.interactionId),
    direction: "session_to_thread",
    interactionId: args.interactionId,
    sessionId: args.sessionId,
    threadId: args.threadId || null,
  })
}

export async function enqueueThreadToSessionMirrorJob(args: {
  messageId: string
  threadId: string
}): Promise<void> {
  await enqueueMirrorJob({
    dedupeKey: threadToSessionDedupeKey(args.messageId),
    direction: "thread_to_session",
    messageId: args.messageId,
    threadId: args.threadId,
  })
}

export function computeRetrySchedule(args: {
  attempts: number
  now?: Date
  maxAttempts?: number
  baseDelayMs?: number
}): {
  terminal: boolean
  nextAttemptAt: Date | null
} {
  const maxAttempts = args.maxAttempts ?? BRIDGE_MIRROR_MAX_ATTEMPTS
  const now = args.now || new Date()
  if (args.attempts >= maxAttempts) {
    return {
      terminal: true,
      nextAttemptAt: null,
    }
  }

  const delayMs = Math.min(
    5 * 60 * 1000,
    (args.baseDelayMs ?? BRIDGE_MIRROR_BASE_DELAY_MS) * 2 ** Math.max(0, args.attempts - 1),
  )

  return {
    terminal: false,
    nextAttemptAt: new Date(now.getTime() + delayMs),
  }
}

async function ensureThreadForSession(args: {
  sessionId: string
  preferredThreadId?: string | null
}): Promise<BridgeThread> {
  if (args.preferredThreadId) {
    const preferred = await prisma.bridgeThread.findUnique({
      where: {
        id: args.preferredThreadId,
      },
    })

    if (preferred) {
      return preferred
    }
  }

  const existing = await prisma.bridgeThread.findFirst({
    where: {
      sessionId: args.sessionId,
    },
  })

  if (existing) {
    return existing
  }

  const session = await prisma.session.findUnique({
    where: {
      id: args.sessionId,
    },
  })

  if (!session) {
    throw new Error(`Session ${args.sessionId} not found for mirror sync.`)
  }

  const stationKey = inferStationKeyFromMetadata(session.metadata)
  const title = session.title?.trim() || defaultThreadTitle(stationKey)

  return upsertThreadBySession({
    sessionId: session.id,
    userId: session.userId,
    stationKey,
    title,
  })
}

async function ensureSessionForThread(thread: BridgeThread): Promise<Session> {
  if (thread.sessionId) {
    const existing = await prisma.session.findUnique({
      where: {
        id: thread.sessionId,
      },
    })
    if (existing) {
      return existing
    }
  }

  if (!thread.userId) {
    throw new Error(`Bridge thread ${thread.id} has no user owner; cannot mirror to session.`)
  }

  const stationKey = thread.stationKey && isBridgeStationKey(thread.stationKey) ? thread.stationKey : null
  let nextSession: Session | null = null

  if (stationKey) {
    const candidate = await ensureBridgeSessionForStation({
      userId: thread.userId,
      stationKey,
    })

    const candidateLinkedThread = await prisma.bridgeThread.findFirst({
      where: {
        sessionId: candidate.id,
      },
    })

    if (!candidateLinkedThread || candidateLinkedThread.id === thread.id) {
      nextSession = candidate
    }
  }

  if (!nextSession) {
    nextSession = await prisma.session.create({
      data: {
        userId: thread.userId,
        title: thread.title || defaultThreadTitle(stationKey),
        description: "Bridge conversation channel",
        mode: "plan",
        source: "web",
        status: "planning",
        metadata: stationKey
          ? bridgeSessionMetadataForStation(stationKey)
          : {
              bridge: {
                channel: BRIDGE_CHANNEL,
              },
            },
      },
    })
  }

  await prisma.bridgeThread.update({
    where: {
      id: thread.id,
    },
    data: {
      sessionId: nextSession.id,
      userId: thread.userId,
    },
  })

  return nextSession
}

async function processSessionToThreadJob(job: BridgeMirrorJob): Promise<void> {
  if (!job.interactionId) {
    throw new Error(`Bridge mirror job ${job.id} missing interactionId.`)
  }

  const interaction = await prisma.sessionInteraction.findUnique({
    where: {
      id: job.interactionId,
    },
  })

  if (!interaction) {
    throw new Error(`Session interaction ${job.interactionId} not found.`)
  }

  const thread = await ensureThreadForSession({
    sessionId: interaction.sessionId,
    preferredThreadId: job.threadId,
  })

  let messageId: string | null = null

  await prisma.$transaction(async (tx) => {
    const existing = await tx.bridgeMirrorLink.findUnique({
      where: {
        interactionId: interaction.id,
      },
    })

    if (existing) {
      messageId = existing.messageId
      return
    }

    const message = await tx.bridgeMessage.create({
      data: {
        threadId: thread.id,
        role: interactionTypeToBridgeChatRole(interaction.type),
        content: interaction.content,
        createdAt: interaction.timestamp,
      },
    })

    await tx.bridgeMirrorLink.create({
      data: {
        messageId: message.id,
        interactionId: interaction.id,
      },
    })

    messageId = message.id
  })

  publishRealtimeEvent({
    type: "bridge.updated",
    payload: {
      source: "session_to_thread",
      threadId: thread.id,
      sessionId: interaction.sessionId,
      stationKey: thread.stationKey,
      interactionId: interaction.id,
      messageId,
    },
  })
}

function buildMirroredSessionMetadata(args: {
  thread: BridgeThread
  sourceMessageId: string
}): Prisma.InputJsonObject {
  const bridge: Record<string, string> = {
    channel: BRIDGE_CHANNEL,
  }

  if (args.thread.stationKey) {
    bridge.stationKey = args.thread.stationKey
    const template = stationTemplateForKey(args.thread.stationKey)
    if (template) {
      bridge.callsign = template.callsign
      bridge.role = template.role
      bridge.name = template.callsign
    }
  }

  return {
    bridge,
    mirroredFrom: {
      type: "bridge-thread-message",
      threadId: args.thread.id,
      messageId: args.sourceMessageId,
    },
  } as Prisma.InputJsonObject
}

async function processThreadToSessionJob(job: BridgeMirrorJob): Promise<void> {
  if (!job.messageId) {
    throw new Error(`Bridge mirror job ${job.id} missing messageId.`)
  }

  const message = await prisma.bridgeMessage.findUnique({
    where: {
      id: job.messageId,
    },
    include: {
      thread: true,
    },
  })

  if (!message) {
    throw new Error(`Bridge message ${job.messageId} not found.`)
  }

  const thread = message.thread
  const session = await ensureSessionForThread(thread)

  let interactionId: string | null = null

  await prisma.$transaction(async (tx) => {
    const existing = await tx.bridgeMirrorLink.findUnique({
      where: {
        messageId: message.id,
      },
    })

    if (existing) {
      interactionId = existing.interactionId
      return
    }

    const interaction = await tx.sessionInteraction.create({
      data: {
        sessionId: session.id,
        type: bridgeChatRoleToInteractionType(message.role),
        content: message.content,
        metadata: buildMirroredSessionMetadata({
          thread,
          sourceMessageId: message.id,
        }),
        timestamp: message.createdAt,
      },
    })

    await tx.bridgeMirrorLink.create({
      data: {
        messageId: message.id,
        interactionId: interaction.id,
      },
    })

    interactionId = interaction.id
  })

  publishRealtimeEvent({
    type: "session.prompted",
    payload: {
      sessionId: session.id,
      interactionId,
      mirrored: true,
      source: "thread_to_session",
    },
  })

  publishRealtimeEvent({
    type: "bridge.updated",
    payload: {
      source: "thread_to_session",
      threadId: thread.id,
      sessionId: session.id,
      stationKey: thread.stationKey,
      messageId: message.id,
      interactionId,
    },
  })
}

async function processMirrorJob(job: BridgeMirrorJob): Promise<void> {
  if (job.direction === "session_to_thread") {
    await processSessionToThreadJob(job)
    return
  }

  await processThreadToSessionJob(job)
}

async function claimMirrorJob(job: BridgeMirrorJob): Promise<boolean> {
  const now = new Date()
  const result = await prisma.bridgeMirrorJob.updateMany({
    where: {
      id: job.id,
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

export async function drainBridgeMirrorJobs(options: { limit?: number } = {}): Promise<number> {
  const now = new Date()
  const limit = Math.max(1, Math.min(100, options.limit ?? 20))

  const jobs = await prisma.bridgeMirrorJob.findMany({
    where: {
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
    orderBy: {
      createdAt: "asc",
    },
    take: limit,
  })

  let processedCount = 0

  for (const job of jobs) {
    const claimed = await claimMirrorJob(job)
    if (!claimed) {
      continue
    }

    try {
      await processMirrorJob(job)
      await prisma.bridgeMirrorJob.update({
        where: {
          id: job.id,
        },
        data: {
          status: "completed",
          nextAttemptAt: null,
          lastError: null,
        },
      })
      processedCount += 1
    } catch (error) {
      const nextAttempts = job.attempts + 1
      const schedule = computeRetrySchedule({ attempts: nextAttempts })

      await prisma.bridgeMirrorJob.update({
        where: {
          id: job.id,
        },
        data: {
          status: "failed",
          attempts: nextAttempts,
          nextAttemptAt: schedule.nextAttemptAt,
          lastError: error instanceof Error ? error.message : "Unknown mirror failure",
        },
      })
    }
  }

  return processedCount
}

export async function drainBridgeMirrorJobsSafely(options: { limit?: number; label?: string } = {}): Promise<void> {
  try {
    await drainBridgeMirrorJobs(options)
  } catch (error) {
    const context = options.label ? ` (${options.label})` : ""
    console.error(`Bridge mirror drain failed${context}:`, error)
  }
}

export async function mirrorSessionInteractionsToThread(args: {
  sessionId: string
  interactions: SessionInteraction[]
  threadId?: string | null
}): Promise<void> {
  for (const interaction of args.interactions) {
    await enqueueSessionToThreadMirrorJob({
      interactionId: interaction.id,
      sessionId: args.sessionId,
      threadId: args.threadId || null,
    })
  }
}
