import type { BridgeAgentChatRoomType, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { publishRealtimeEvent } from "@/lib/realtime/events"
import { enqueueBridgeAgentChatReplyJobs } from "@/lib/bridge-agent-chat/replies"
import type {
  BridgeAgentChatMessageView,
  BridgeAgentChatRoomMemberView,
  BridgeAgentChatRoomView,
  CreateBridgeAgentChatMessageArgs,
  CreateBridgeAgentChatMessageResult,
  CreateBridgeAgentChatRoomArgs,
  CreateBridgeAgentChatRoomResult,
  ListBridgeAgentChatMessagesArgs,
  ListBridgeAgentChatMessagesResult,
  ListBridgeAgentChatRoomsArgs,
  ListBridgeAgentChatRoomsResult,
  BridgeAgentChatShipAccess,
} from "@/lib/bridge-agent-chat/types"
import { BridgeAgentChatError } from "@/lib/bridge-agent-chat/types"
import {
  asBoolean,
  asNonEmptyString,
  ensureRoomMemberIds,
  normalizeMessageContent,
  parseCursor,
  parseMemberIdList,
  parseRoomType,
  parseTake,
  validateAutoReplyRecipientIds,
} from "@/lib/bridge-agent-chat/validation"

const BRIDGE_CREW_ROLE_ORDER = ["xo", "ops", "eng", "sec", "med", "cou"]

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

function asJsonValue(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function buildDmKey(shipDeploymentId: string, memberBridgeCrewIds: string[]): string {
  return `${shipDeploymentId}:${[...memberBridgeCrewIds].sort((left, right) => left.localeCompare(right)).join(":")}`
}

function roleSortIndex(role: string): number {
  const index = BRIDGE_CREW_ROLE_ORDER.indexOf(role)
  return index >= 0 ? index : BRIDGE_CREW_ROLE_ORDER.length + 1
}

function sortMembersByBridgeRole<T extends { bridgeCrew: { role: string; callsign: string } }>(
  members: T[],
): T[] {
  return [...members].sort((left, right) => {
    const roleDelta = roleSortIndex(left.bridgeCrew.role) - roleSortIndex(right.bridgeCrew.role)
    if (roleDelta !== 0) {
      return roleDelta
    }

    return left.bridgeCrew.callsign.localeCompare(right.bridgeCrew.callsign)
  })
}

function roomTitleForCreate(args: {
  roomType: BridgeAgentChatRoomType
  title?: string | null
  members: Array<{ callsign: string }>
}): string {
  if (args.roomType === "dm") {
    const callsigns = [...args.members.map((member) => member.callsign)].sort((left, right) => left.localeCompare(right))
    return `${callsigns[0]} <> ${callsigns[1]}`
  }

  const explicit = asNonEmptyString(args.title)
  if (explicit) {
    return explicit
  }

  return "Bridge Crew Group"
}

function mapRoomMemberView(member: {
  id: string
  bridgeCrewId: string
  sessionId: string
  createdAt: Date
  bridgeCrew: {
    role: string
    callsign: string
    name: string
    status: string
  }
}): BridgeAgentChatRoomMemberView {
  return {
    id: member.id,
    bridgeCrewId: member.bridgeCrewId,
    sessionId: member.sessionId,
    role: member.bridgeCrew.role,
    callsign: member.bridgeCrew.callsign,
    name: member.bridgeCrew.name,
    status: member.bridgeCrew.status,
    createdAt: member.createdAt.toISOString(),
  }
}

function mapMessageView(message: {
  id: string
  roomId: string
  kind: "agent" | "system"
  senderBridgeCrewId: string | null
  content: string
  inReplyToMessageId: string | null
  metadata: unknown
  createdAt: Date
  senderBridgeCrew?: {
    id: string
    role: string
    callsign: string
    name: string
  } | null
}): BridgeAgentChatMessageView {
  return {
    id: message.id,
    roomId: message.roomId,
    kind: message.kind,
    senderBridgeCrewId: message.senderBridgeCrewId,
    sender: message.senderBridgeCrew
      ? {
          bridgeCrewId: message.senderBridgeCrew.id,
          role: message.senderBridgeCrew.role,
          callsign: message.senderBridgeCrew.callsign,
          name: message.senderBridgeCrew.name,
        }
      : null,
    content: message.content,
    inReplyToMessageId: message.inReplyToMessageId,
    metadata: asRecord(message.metadata),
    createdAt: message.createdAt.toISOString(),
  }
}

function mapRoomView(room: {
  id: string
  shipDeploymentId: string
  roomType: BridgeAgentChatRoomType
  title: string
  dmKey: string | null
  createdAt: Date
  updatedAt: Date
  members: Array<{
    id: string
    bridgeCrewId: string
    sessionId: string
    createdAt: Date
    bridgeCrew: {
      role: string
      callsign: string
      name: string
      status: string
    }
  }>
  messages: Array<{
    id: string
    roomId: string
    kind: "agent" | "system"
    senderBridgeCrewId: string | null
    content: string
    inReplyToMessageId: string | null
    metadata: unknown
    createdAt: Date
    senderBridgeCrew: {
      id: string
      role: string
      callsign: string
      name: string
    } | null
  }>
}): BridgeAgentChatRoomView {
  const sortedMembers = sortMembersByBridgeRole(room.members)
  const lastMessage = room.messages[0] ? mapMessageView(room.messages[0]) : null

  return {
    id: room.id,
    shipDeploymentId: room.shipDeploymentId,
    roomType: room.roomType,
    title: room.title,
    dmKey: room.dmKey,
    createdAt: room.createdAt.toISOString(),
    updatedAt: room.updatedAt.toISOString(),
    members: sortedMembers.map(mapRoomMemberView),
    lastMessage,
  }
}

async function resolveAccessibleShip(args: {
  actor: ListBridgeAgentChatRoomsArgs["actor"]
  shipDeploymentId: string
}): Promise<BridgeAgentChatShipAccess> {
  const ship = await prisma.agentDeployment.findUnique({
    where: {
      id: args.shipDeploymentId,
    },
    select: {
      id: true,
      name: true,
      userId: true,
      deploymentType: true,
    },
  })

  if (!ship || ship.deploymentType !== "ship") {
    throw new BridgeAgentChatError("Ship not found", 404, "SHIP_NOT_FOUND")
  }

  if (!args.actor.isAdmin && ship.userId !== args.actor.userId) {
    throw new BridgeAgentChatError("Ship not found", 404, "SHIP_NOT_FOUND")
  }

  return {
    id: ship.id,
    name: ship.name,
    userId: ship.userId,
  }
}

async function requireRoomForShip(args: {
  shipDeploymentId: string
  roomId: string
}): Promise<{
  id: string
  shipDeploymentId: string
  roomType: BridgeAgentChatRoomType
  title: string
  dmKey: string | null
  createdAt: Date
  updatedAt: Date
  members: Array<{
    id: string
    roomId: string
    bridgeCrewId: string
    sessionId: string
    createdAt: Date
    bridgeCrew: {
      id: string
      role: string
      callsign: string
      name: string
      status: string
      description: string | null
    }
  }>
}> {
  const room = await prisma.bridgeAgentChatRoom.findFirst({
    where: {
      id: args.roomId,
      shipDeploymentId: args.shipDeploymentId,
    },
    include: {
      members: {
        include: {
          bridgeCrew: {
            select: {
              id: true,
              role: true,
              callsign: true,
              name: true,
              status: true,
              description: true,
            },
          },
        },
      },
    },
  })

  if (!room) {
    throw new BridgeAgentChatError("Room not found", 404, "ROOM_NOT_FOUND")
  }

  return room
}

async function resolveActiveBridgeCrew(args: {
  shipDeploymentId: string
  memberBridgeCrewIds: string[]
}) {
  const bridgeCrew = await prisma.bridgeCrew.findMany({
    where: {
      deploymentId: args.shipDeploymentId,
      status: "active",
      id: {
        in: args.memberBridgeCrewIds,
      },
    },
    select: {
      id: true,
      role: true,
      callsign: true,
      name: true,
      description: true,
    },
  })

  const byId = new Map(bridgeCrew.map((member) => [member.id, member]))
  const missingIds = args.memberBridgeCrewIds.filter((memberId) => !byId.has(memberId))
  if (missingIds.length > 0) {
    throw new BridgeAgentChatError(
      "memberBridgeCrewIds must all be active bridge crew on the selected ship.",
      400,
      "INVALID_ROOM_MEMBERS",
      {
        missingIds,
      },
    )
  }

  return args.memberBridgeCrewIds.map((memberId) => byId.get(memberId)!)
}

async function loadRoomViewById(roomId: string): Promise<BridgeAgentChatRoomView> {
  const room = await prisma.bridgeAgentChatRoom.findUnique({
    where: {
      id: roomId,
    },
    include: {
      members: {
        include: {
          bridgeCrew: {
            select: {
              role: true,
              callsign: true,
              name: true,
              status: true,
            },
          },
        },
      },
      messages: {
        take: 1,
        orderBy: {
          createdAt: "desc",
        },
        include: {
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
    },
  })

  if (!room) {
    throw new BridgeAgentChatError("Room not found", 404, "ROOM_NOT_FOUND")
  }

  return mapRoomView(room)
}

export async function listShipBridgeAgentChatRooms(
  args: ListBridgeAgentChatRoomsArgs,
): Promise<ListBridgeAgentChatRoomsResult> {
  const ship = await resolveAccessibleShip({
    actor: args.actor,
    shipDeploymentId: args.shipDeploymentId,
  })

  const take = parseTake(args.take, 30, 120)
  const memberBridgeCrewId = asNonEmptyString(args.memberBridgeCrewId)

  const rooms = await prisma.bridgeAgentChatRoom.findMany({
    where: {
      shipDeploymentId: ship.id,
      ...(memberBridgeCrewId
        ? {
            members: {
              some: {
                bridgeCrewId: memberBridgeCrewId,
              },
            },
          }
        : {}),
    },
    orderBy: {
      updatedAt: "desc",
    },
    take,
    include: {
      members: {
        include: {
          bridgeCrew: {
            select: {
              role: true,
              callsign: true,
              name: true,
              status: true,
            },
          },
        },
      },
      messages: {
        take: 1,
        orderBy: {
          createdAt: "desc",
        },
        include: {
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
    },
  })

  return {
    shipDeploymentId: ship.id,
    rooms: rooms.map(mapRoomView),
  }
}

export async function createShipBridgeAgentChatRoom(
  args: CreateBridgeAgentChatRoomArgs,
): Promise<CreateBridgeAgentChatRoomResult> {
  const ship = await resolveAccessibleShip({
    actor: args.actor,
    shipDeploymentId: args.shipDeploymentId,
  })

  const roomType = parseRoomType(args.input.roomType)
  const memberBridgeCrewIds = ensureRoomMemberIds({
    roomType,
    memberBridgeCrewIds: parseMemberIdList(args.input.memberBridgeCrewIds),
  })

  if (args.input.createdByBridgeCrewId && !memberBridgeCrewIds.includes(args.input.createdByBridgeCrewId)) {
    throw new BridgeAgentChatError(
      "createdByBridgeCrewId must be included in memberBridgeCrewIds.",
      400,
      "CREATED_BY_NOT_IN_ROOM",
    )
  }

  const members = await resolveActiveBridgeCrew({
    shipDeploymentId: ship.id,
    memberBridgeCrewIds,
  })

  const roomTitle = roomTitleForCreate({
    roomType,
    title: args.input.title,
    members,
  })

  const dmKey = roomType === "dm" ? buildDmKey(ship.id, memberBridgeCrewIds) : null

  if (roomType === "dm" && dmKey) {
    const existing = await prisma.bridgeAgentChatRoom.findFirst({
      where: {
        shipDeploymentId: ship.id,
        dmKey,
      },
      select: {
        id: true,
      },
    })

    if (existing) {
      return {
        shipDeploymentId: ship.id,
        room: await loadRoomViewById(existing.id),
        created: false,
      }
    }
  }

  let createdRoomId: string
  let created = true

  try {
    const createdRoom = await prisma.$transaction(async (tx) => {
      const room = await tx.bridgeAgentChatRoom.create({
        data: {
          shipDeploymentId: ship.id,
          roomType,
          title: roomTitle,
          dmKey,
          createdByBridgeCrewId: args.input.createdByBridgeCrewId || null,
        },
      })

      for (const member of members) {
        const session = await tx.session.create({
          data: {
            userId: ship.userId,
            title: `${member.callsign} · ${roomTitle}`,
            description: `Bridge agent chat runtime session for ${member.callsign}.`,
            mode: "plan",
            source: "web",
            status: "planning",
            metadata: asJsonValue({
              agentChat: {
                roomId: room.id,
                roomType,
                shipDeploymentId: ship.id,
                bridgeCrewId: member.id,
                role: member.role,
                callsign: member.callsign,
                name: member.name,
              },
            }),
          },
          select: {
            id: true,
          },
        })

        await tx.bridgeAgentChatMember.create({
          data: {
            roomId: room.id,
            bridgeCrewId: member.id,
            sessionId: session.id,
          },
        })
      }

      return room
    })

    createdRoomId = createdRoom.id
  } catch (error) {
    const isUniqueError = (error as { code?: string })?.code === "P2002"
    if (!isUniqueError || roomType !== "dm" || !dmKey) {
      throw error
    }

    const existing = await prisma.bridgeAgentChatRoom.findFirst({
      where: {
        shipDeploymentId: ship.id,
        dmKey,
      },
      select: {
        id: true,
      },
    })

    if (!existing) {
      throw error
    }

    created = false
    createdRoomId = existing.id
  }

  const room = await loadRoomViewById(createdRoomId)

  publishRealtimeEvent({
    type: "bridge.agent-chat.updated",
    userId: ship.userId,
    payload: {
      kind: created ? "room.created" : "room.reused",
      shipDeploymentId: ship.id,
      roomId: room.id,
      roomType: room.roomType,
    },
  })

  return {
    shipDeploymentId: ship.id,
    room,
    created,
  }
}

export async function listShipBridgeAgentChatMessages(
  args: ListBridgeAgentChatMessagesArgs,
): Promise<ListBridgeAgentChatMessagesResult> {
  const ship = await resolveAccessibleShip({
    actor: args.actor,
    shipDeploymentId: args.shipDeploymentId,
  })

  const room = await requireRoomForShip({
    shipDeploymentId: ship.id,
    roomId: args.roomId,
  })

  const take = parseTake(args.take, 60, 200)
  const cursor = parseCursor(args.cursor)

  if (cursor) {
    const cursorMessage = await prisma.bridgeAgentChatMessage.findFirst({
      where: {
        id: cursor,
        roomId: room.id,
      },
      select: {
        id: true,
      },
    })

    if (!cursorMessage) {
      throw new BridgeAgentChatError("Invalid cursor for this room.", 400, "INVALID_CURSOR")
    }
  }

  const raw = await prisma.bridgeAgentChatMessage.findMany({
    where: {
      roomId: room.id,
    },
    include: {
      senderBridgeCrew: {
        select: {
          id: true,
          role: true,
          callsign: true,
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: take + 1,
    ...(cursor
      ? {
          cursor: {
            id: cursor,
          },
          skip: 1,
        }
      : {}),
  })

  const hasMore = raw.length > take
  const page = hasMore ? raw.slice(0, take) : raw
  const nextCursor = hasMore ? page[page.length - 1]?.id || null : null

  return {
    shipDeploymentId: ship.id,
    roomId: room.id,
    nextCursor,
    messages: [...page].reverse().map(mapMessageView),
  }
}

export async function createShipBridgeAgentChatMessage(
  args: CreateBridgeAgentChatMessageArgs,
): Promise<CreateBridgeAgentChatMessageResult> {
  const ship = await resolveAccessibleShip({
    actor: args.actor,
    shipDeploymentId: args.shipDeploymentId,
  })

  const room = await requireRoomForShip({
    shipDeploymentId: ship.id,
    roomId: args.roomId,
  })

  const senderBridgeCrewId = asNonEmptyString(args.input.senderBridgeCrewId)
  if (!senderBridgeCrewId) {
    throw new BridgeAgentChatError("senderBridgeCrewId is required", 400, "SENDER_REQUIRED")
  }

  const roomMemberById = new Map(room.members.map((member) => [member.bridgeCrewId, member]))
  const senderMembership = roomMemberById.get(senderBridgeCrewId)
  if (!senderMembership) {
    throw new BridgeAgentChatError(
      "senderBridgeCrewId must be an active room member.",
      400,
      "INVALID_SENDER",
    )
  }

  if (senderMembership.bridgeCrew.status !== "active") {
    throw new BridgeAgentChatError(
      "senderBridgeCrewId must be active.",
      400,
      "SENDER_INACTIVE",
    )
  }

  const content = normalizeMessageContent(args.input.content)
  const autoReply = asBoolean(args.input.autoReply)

  const activeRoomMemberBridgeCrewIds = room.members
    .filter((member) => member.bridgeCrew.status === "active")
    .map((member) => member.bridgeCrewId)

  const autoReplyRecipientBridgeCrewIds = validateAutoReplyRecipientIds({
    autoReply,
    senderBridgeCrewId,
    requestedRecipientBridgeCrewIds: parseMemberIdList(args.input.autoReplyRecipientBridgeCrewIds),
    roomMemberBridgeCrewIds: activeRoomMemberBridgeCrewIds,
  })

  const message = await prisma.$transaction(async (tx) => {
    const createdMessage = await tx.bridgeAgentChatMessage.create({
      data: {
        roomId: room.id,
        kind: "agent",
        senderBridgeCrewId,
        content,
        metadata: asJsonValue({
          autoReplyRequested: autoReply,
          autoReplyRecipientBridgeCrewIds,
        }),
      },
      include: {
        senderBridgeCrew: {
          select: {
            id: true,
            role: true,
            callsign: true,
            name: true,
          },
        },
      },
    })

    await tx.bridgeAgentChatRoom.update({
      where: {
        id: room.id,
      },
      data: {
        updatedAt: new Date(),
      },
    })

    return createdMessage
  })

  let queuedReplyJobs: Array<{ id: string }> = []
  if (autoReply && autoReplyRecipientBridgeCrewIds.length > 0) {
    queuedReplyJobs = await enqueueBridgeAgentChatReplyJobs({
      shipDeploymentId: ship.id,
      roomId: room.id,
      sourceMessageId: message.id,
      recipientBridgeCrewIds: autoReplyRecipientBridgeCrewIds,
    })
  }

  publishRealtimeEvent({
    type: "bridge.agent-chat.updated",
    userId: ship.userId,
    payload: {
      kind: "message.created",
      shipDeploymentId: ship.id,
      roomId: room.id,
      messageId: message.id,
      senderBridgeCrewId,
      autoReply,
      queuedReplyJobs: queuedReplyJobs.length,
      queuedReplyJobIds: queuedReplyJobs.map((job) => job.id),
    },
  })

  return {
    message: mapMessageView(message),
    queuedReplyJobs: queuedReplyJobs.length,
    queuedReplyJobIds: queuedReplyJobs.map((job) => job.id),
  }
}
