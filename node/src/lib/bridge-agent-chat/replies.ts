import crypto from "node:crypto"
import type { BridgeAgentChatReplyJob, BridgeCrewRole, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { executeSessionPrompt } from "@/lib/runtime/session-prompt"
import { publishRealtimeEvent } from "@/lib/realtime/events"

const BRIDGE_AGENT_CHAT_REPLY_BASE_DELAY_MS = 1_000
export const BRIDGE_AGENT_CHAT_REPLY_MAX_ATTEMPTS = 6

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

function asJsonValue(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function isUniqueConstraintError(error: unknown): boolean {
  return (error as { code?: string })?.code === "P2002"
}

function asBridgeCrewRole(value: unknown): BridgeCrewRole | null {
  if (
    value === "xo" ||
    value === "ops" ||
    value === "eng" ||
    value === "sec" ||
    value === "med" ||
    value === "cou"
  ) {
    return value
  }

  return null
}

function dedupeIds(values: string[]): string[] {
  return [...new Set(values.map((entry) => entry.trim()).filter((entry) => entry.length > 0))]
}

function buildAgentReplyPrompt(args: {
  shipName: string
  roomTitle: string
  recipientCallsign: string
  recipientRole: string
  senderCallsign: string
  senderRole: string
  participantSummary: string
  sourceContent: string
}): string {
  return [
    `You are ${args.recipientCallsign} (${args.recipientRole}) on ship ${args.shipName}.`,
    `Bridge agent chat room: ${args.roomTitle}.`,
    `Participants: ${args.participantSummary}.`,
    "Reply to the incoming message with concise, actionable coordination guidance.",
    "Use at most 8 short lines and include explicit next action + risk state.",
    "",
    `Incoming message from ${args.senderCallsign} (${args.senderRole}):`,
    args.sourceContent,
  ].join("\n")
}

export function buildBridgeAgentChatReplyJobDedupeKey(args: {
  roomId: string
  sourceMessageId: string
  recipientBridgeCrewId: string
}): string {
  return crypto
    .createHash("sha256")
    .update(`${args.roomId}:${args.sourceMessageId}:${args.recipientBridgeCrewId}`)
    .digest("hex")
}

export function computeBridgeAgentChatReplyRetrySchedule(args: {
  attempts: number
  now?: Date
  maxAttemptsOverride?: number
  baseDelayMsOverride?: number
}): {
  terminal: boolean
  nextAttemptAt: Date | null
} {
  const cap = args.maxAttemptsOverride ?? BRIDGE_AGENT_CHAT_REPLY_MAX_ATTEMPTS
  const now = args.now || new Date()

  if (args.attempts >= cap) {
    return {
      terminal: true,
      nextAttemptAt: null,
    }
  }

  const delayMs = Math.min(
    5 * 60 * 1000,
    (args.baseDelayMsOverride ?? BRIDGE_AGENT_CHAT_REPLY_BASE_DELAY_MS) * 2 ** Math.max(0, args.attempts - 1),
  )

  return {
    terminal: false,
    nextAttemptAt: new Date(now.getTime() + delayMs),
  }
}

export async function enqueueBridgeAgentChatReplyJobs(args: {
  shipDeploymentId: string
  roomId: string
  sourceMessageId: string
  recipientBridgeCrewIds: string[]
}): Promise<BridgeAgentChatReplyJob[]> {
  const recipientBridgeCrewIds = dedupeIds(args.recipientBridgeCrewIds)
  if (recipientBridgeCrewIds.length === 0) {
    return []
  }

  const [shipDeployment, memberships] = await Promise.all([
    prisma.agentDeployment.findUnique({
      where: {
        id: args.shipDeploymentId,
      },
      select: {
        id: true,
        userId: true,
      },
    }),
    prisma.bridgeAgentChatMember.findMany({
      where: {
        roomId: args.roomId,
        bridgeCrewId: {
          in: recipientBridgeCrewIds,
        },
      },
      select: {
        bridgeCrewId: true,
        sessionId: true,
      },
    }),
  ])

  const sessionByRecipient = new Map<string, string>()
  for (const membership of memberships) {
    sessionByRecipient.set(membership.bridgeCrewId, membership.sessionId)
  }

  const missingRecipients = recipientBridgeCrewIds.filter((bridgeCrewId) => !sessionByRecipient.has(bridgeCrewId))
  if (missingRecipients.length > 0) {
    throw new Error(`Reply recipients are missing room session bindings: ${missingRecipients.join(", ")}`)
  }

  const created: BridgeAgentChatReplyJob[] = []

  for (const recipientBridgeCrewId of recipientBridgeCrewIds) {
    const recipientSessionId = sessionByRecipient.get(recipientBridgeCrewId)
    if (!recipientSessionId) {
      continue
    }

    try {
      const job = await prisma.bridgeAgentChatReplyJob.create({
        data: {
          dedupeKey: buildBridgeAgentChatReplyJobDedupeKey({
            roomId: args.roomId,
            sourceMessageId: args.sourceMessageId,
            recipientBridgeCrewId,
          }),
          shipDeploymentId: args.shipDeploymentId,
          roomId: args.roomId,
          sourceMessageId: args.sourceMessageId,
          recipientBridgeCrewId,
          recipientSessionId,
          status: "pending",
          attempts: 0,
          nextAttemptAt: new Date(),
        },
      })
      created.push(job)
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        continue
      }
      throw error
    }
  }

  if (created.length > 0) {
    publishRealtimeEvent({
      type: "bridge.agent-chat.updated",
      ...(shipDeployment?.userId
        ? {
            userId: shipDeployment.userId,
          }
        : {}),
      payload: {
        kind: "reply.enqueued",
        shipDeploymentId: args.shipDeploymentId,
        roomId: args.roomId,
        sourceMessageId: args.sourceMessageId,
        count: created.length,
        replyJobIds: created.map((job) => job.id),
      },
    })
  }

  return created
}

async function claimBridgeAgentChatReplyJob(job: BridgeAgentChatReplyJob): Promise<boolean> {
  const now = new Date()
  const result = await prisma.bridgeAgentChatReplyJob.updateMany({
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

async function processBridgeAgentChatReplyJob(job: BridgeAgentChatReplyJob): Promise<void> {
  const loaded = await prisma.bridgeAgentChatReplyJob.findUnique({
    where: {
      id: job.id,
    },
    include: {
      shipDeployment: {
        select: {
          id: true,
          name: true,
          userId: true,
        },
      },
      room: {
        select: {
          id: true,
          title: true,
          shipDeploymentId: true,
          members: {
            include: {
              bridgeCrew: {
                select: {
                  id: true,
                  role: true,
                  callsign: true,
                  name: true,
                  description: true,
                  status: true,
                },
              },
            },
          },
        },
      },
      sourceMessage: {
        select: {
          id: true,
          content: true,
          senderBridgeCrewId: true,
          senderBridgeCrew: {
            select: {
              id: true,
              role: true,
              callsign: true,
              name: true,
            },
          },
        },
      },
      recipientBridgeCrew: {
        select: {
          id: true,
          role: true,
          callsign: true,
          name: true,
          status: true,
        },
      },
      recipientSession: {
        select: {
          id: true,
        },
      },
    },
  })

  if (!loaded) {
    throw new Error(`Reply job ${job.id} not found.`)
  }

  if (!loaded.recipientSession) {
    throw new Error(`Reply job ${job.id} has no valid recipient session.`)
  }

  if (loaded.recipientBridgeCrew.status !== "active") {
    throw new Error(`Recipient bridge crew ${loaded.recipientBridgeCrew.id} is not active.`)
  }

  const recipientRole = asBridgeCrewRole(loaded.recipientBridgeCrew.role)
  if (!recipientRole) {
    throw new Error(`Recipient bridge crew ${loaded.recipientBridgeCrew.id} has invalid role.`)
  }

  const participants = loaded.room.members
    .map((member) => member.bridgeCrew)
    .filter((bridgeCrew) => bridgeCrew.status === "active")

  const participantSummary = participants
    .map((member) => `${member.callsign} (${member.name})`)
    .join(", ")

  const cameoCandidates = participants
    .filter((member) => member.id !== loaded.recipientBridgeCrew.id)
    .map((member) => ({
      stationKey: asBridgeCrewRole(member.role),
      callsign: member.callsign,
      role: member.name,
      name: member.callsign,
      focus: member.description || undefined,
    }))
    .filter((candidate): candidate is {
      stationKey: BridgeCrewRole
      callsign: string
      role: string
      name: string
      focus: string | undefined
    } => Boolean(candidate.stationKey))

  const sender = loaded.sourceMessage.senderBridgeCrew
  const senderCallsign = sender?.callsign || "UNKNOWN"
  const senderRole = sender?.name || "Bridge Crew"

  const runtimePrompt = buildAgentReplyPrompt({
    shipName: loaded.shipDeployment.name || loaded.shipDeployment.id,
    roomTitle: loaded.room.title,
    recipientCallsign: loaded.recipientBridgeCrew.callsign,
    recipientRole: loaded.recipientBridgeCrew.name,
    senderCallsign,
    senderRole,
    participantSummary,
    sourceContent: loaded.sourceMessage.content,
  })

  const runtimeResult = await executeSessionPrompt({
    userId: loaded.shipDeployment.userId,
    sessionId: loaded.recipientSession.id,
    prompt: runtimePrompt,
    metadata: {
      bridge: {
        channel: "bridge-agent",
        stationKey: recipientRole,
        callsign: loaded.recipientBridgeCrew.callsign,
        role: loaded.recipientBridgeCrew.name,
        name: loaded.recipientBridgeCrew.callsign,
        bridgeCrewId: loaded.recipientBridgeCrew.id,
        shipDeploymentId: loaded.shipDeployment.id,
        cameoCandidates,
        missionContext: {
          operator: "Bridge Agent Chat",
          stardate: new Date().toISOString(),
          workItems: [
            {
              name: `Respond in room ${loaded.room.title}`,
            },
          ],
        },
      },
      agentChat: {
        roomId: loaded.room.id,
        shipDeploymentId: loaded.shipDeployment.id,
        sourceMessageId: loaded.sourceMessage.id,
        sourceSenderBridgeCrewId: loaded.sourceMessage.senderBridgeCrewId,
      },
    },
  })

  const metadataRecord = asRecord(runtimeResult.responseInteraction.metadata)

  const responseMessage = await prisma.$transaction(async (tx) => {
    const message = await tx.bridgeAgentChatMessage.create({
      data: {
        roomId: loaded.room.id,
        kind: "agent",
        senderBridgeCrewId: loaded.recipientBridgeCrew.id,
        content: runtimeResult.responseInteraction.content,
        inReplyToMessageId: loaded.sourceMessage.id,
        metadata: asJsonValue({
          provider: runtimeResult.provider,
          fallbackUsed: runtimeResult.fallbackUsed,
          signature: runtimeResult.signature,
          sessionId: loaded.recipientSession.id,
          userInteractionId: runtimeResult.interaction.id,
          aiInteractionId: runtimeResult.responseInteraction.id,
          ...(Object.keys(metadataRecord).length > 0 ? metadataRecord : {}),
        }),
      },
    })

    await tx.bridgeAgentChatRoom.update({
      where: {
        id: loaded.room.id,
      },
      data: {
        updatedAt: new Date(),
      },
    })

    await tx.bridgeAgentChatReplyJob.update({
      where: {
        id: loaded.id,
      },
      data: {
        status: "completed",
        nextAttemptAt: null,
        lastError: null,
        outputMessageId: message.id,
        completedAt: new Date(),
      },
    })

    return message
  })

  publishRealtimeEvent({
    type: "bridge.agent-chat.updated",
    userId: loaded.shipDeployment.userId,
    payload: {
      kind: "reply.completed",
      shipDeploymentId: loaded.shipDeployment.id,
      roomId: loaded.room.id,
      sourceMessageId: loaded.sourceMessage.id,
      messageId: responseMessage.id,
      replyJobId: loaded.id,
      recipientBridgeCrewId: loaded.recipientBridgeCrew.id,
    },
  })
}

export async function drainBridgeAgentChatReplyJobs(options: {
  limit?: number
  shipDeploymentId?: string
} = {}): Promise<number> {
  const now = new Date()
  const limit = Math.max(1, Math.min(100, options.limit ?? 20))

  const jobs = await prisma.bridgeAgentChatReplyJob.findMany({
    where: {
      ...(options.shipDeploymentId ? { shipDeploymentId: options.shipDeploymentId } : {}),
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

  let processed = 0

  for (const job of jobs) {
    const claimed = await claimBridgeAgentChatReplyJob(job)
    if (!claimed) {
      continue
    }

    try {
      await processBridgeAgentChatReplyJob(job)
      processed += 1
    } catch (error) {
      const lastError = error instanceof Error ? error.message : "Unknown bridge agent chat reply failure"
      const attempts = job.attempts + 1
      const schedule = computeBridgeAgentChatReplyRetrySchedule({ attempts })

      const updated = await prisma.bridgeAgentChatReplyJob.update({
        where: {
          id: job.id,
        },
        data: {
          status: "failed",
          attempts,
          nextAttemptAt: schedule.nextAttemptAt,
          lastError,
          completedAt: schedule.terminal ? new Date() : null,
        },
        include: {
          shipDeployment: {
            select: {
              userId: true,
            },
          },
        },
      })

      if (schedule.terminal) {
        publishRealtimeEvent({
          type: "bridge.agent-chat.updated",
          userId: updated.shipDeployment.userId,
          payload: {
            kind: "reply.failed",
            shipDeploymentId: updated.shipDeploymentId,
            roomId: updated.roomId,
            sourceMessageId: updated.sourceMessageId,
            replyJobId: updated.id,
            recipientBridgeCrewId: updated.recipientBridgeCrewId,
            error: lastError,
          },
        })
      }
    }
  }

  return processed
}

export async function drainBridgeAgentChatReplyJobsSafely(options: {
  limit?: number
  shipDeploymentId?: string
  label?: string
} = {}): Promise<void> {
  try {
    await drainBridgeAgentChatReplyJobs(options)
  } catch (error) {
    const suffix = options.label ? ` (${options.label})` : ""
    console.error(`Bridge agent chat reply drain failed${suffix}:`, error)
  }
}
