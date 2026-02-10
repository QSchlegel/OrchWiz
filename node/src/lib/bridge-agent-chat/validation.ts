import type { BridgeAgentChatRoomType } from "@prisma/client"
import { BridgeAgentChatError } from "./types"

const BRIDGE_AGENT_CHAT_ROOM_TYPES: BridgeAgentChatRoomType[] = ["dm", "group"]

export function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function asBoolean(value: unknown): boolean {
  return value === true
}

export function parseTake(value: unknown, fallback = 40, max = 200): number {
  const raw = Number.parseInt(typeof value === "string" ? value : String(value ?? ""), 10)
  if (!Number.isFinite(raw)) {
    return fallback
  }

  return Math.max(1, Math.min(max, raw))
}

export function parseCursor(value: unknown): string | null {
  return asNonEmptyString(value)
}

export function parseRoomType(value: unknown): BridgeAgentChatRoomType {
  if (value === "dm" || value === "group") {
    return value
  }

  throw new BridgeAgentChatError(
    `roomType must be one of: ${BRIDGE_AGENT_CHAT_ROOM_TYPES.join(", ")}.`,
    400,
    "INVALID_ROOM_TYPE",
  )
}

export function parseMemberIdList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return [...new Set(value.map((entry) => asNonEmptyString(entry)).filter((entry): entry is string => Boolean(entry)))]
}

export function normalizeMessageContent(value: unknown, maxLength = 8_000): string {
  const content = asNonEmptyString(value)
  if (!content) {
    throw new BridgeAgentChatError("content is required", 400, "CONTENT_REQUIRED")
  }

  return content.slice(0, maxLength)
}

export function ensureRoomMemberIds(args: {
  roomType: BridgeAgentChatRoomType
  memberBridgeCrewIds: string[]
}): string[] {
  const ids = parseMemberIdList(args.memberBridgeCrewIds)

  if (args.roomType === "dm" && ids.length !== 2) {
    throw new BridgeAgentChatError(
      "DM rooms require exactly 2 bridge crew members.",
      400,
      "INVALID_DM_MEMBER_COUNT",
      {
        expected: 2,
        received: ids.length,
      },
    )
  }

  if (args.roomType === "group" && ids.length < 3) {
    throw new BridgeAgentChatError(
      "Group rooms require at least 3 bridge crew members.",
      400,
      "INVALID_GROUP_MEMBER_COUNT",
      {
        minimum: 3,
        received: ids.length,
      },
    )
  }

  return args.roomType === "dm" ? [...ids].sort((left, right) => left.localeCompare(right)) : ids
}

export function validateAutoReplyRecipientIds(args: {
  autoReply: boolean
  senderBridgeCrewId: string
  requestedRecipientBridgeCrewIds: string[]
  roomMemberBridgeCrewIds: string[]
}): string[] {
  if (!args.autoReply) {
    return []
  }

  const requested = parseMemberIdList(args.requestedRecipientBridgeCrewIds)
  if (requested.length === 0) {
    throw new BridgeAgentChatError(
      "autoReplyRecipientBridgeCrewIds are required when autoReply is true.",
      400,
      "AUTO_REPLY_RECIPIENTS_REQUIRED",
    )
  }

  const roomMembers = new Set(args.roomMemberBridgeCrewIds)
  const unknownRecipients = requested.filter((id) => !roomMembers.has(id))
  if (unknownRecipients.length > 0) {
    throw new BridgeAgentChatError(
      "autoReplyRecipientBridgeCrewIds must all be room members.",
      400,
      "AUTO_REPLY_RECIPIENT_NOT_IN_ROOM",
      {
        unknownRecipients,
      },
    )
  }

  if (requested.includes(args.senderBridgeCrewId)) {
    throw new BridgeAgentChatError(
      "autoReplyRecipientBridgeCrewIds cannot include the sender.",
      400,
      "AUTO_REPLY_RECIPIENT_CANNOT_BE_SENDER",
    )
  }

  return requested
}
