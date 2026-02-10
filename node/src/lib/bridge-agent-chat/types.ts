import type { BridgeAgentChatMessageKind, BridgeAgentChatRoomType } from "@prisma/client"
import type { AccessActor } from "@/lib/security/access-control"

export interface BridgeAgentChatShipAccess {
  id: string
  name: string
  userId: string
}

export class BridgeAgentChatError extends Error {
  status: number
  code: string
  details?: Record<string, unknown>

  constructor(message: string, status = 400, code = "BRIDGE_AGENT_CHAT_ERROR", details?: Record<string, unknown>) {
    super(message)
    this.name = "BridgeAgentChatError"
    this.status = status
    this.code = code
    this.details = details
  }
}

export interface BridgeAgentChatRoomMemberView {
  id: string
  bridgeCrewId: string
  sessionId: string
  role: string
  callsign: string
  name: string
  status: string
  createdAt: string
}

export interface BridgeAgentChatMessageSenderView {
  bridgeCrewId: string
  role: string
  callsign: string
  name: string
}

export interface BridgeAgentChatMessageView {
  id: string
  roomId: string
  kind: BridgeAgentChatMessageKind
  senderBridgeCrewId: string | null
  sender: BridgeAgentChatMessageSenderView | null
  content: string
  inReplyToMessageId: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

export interface BridgeAgentChatRoomView {
  id: string
  shipDeploymentId: string
  roomType: BridgeAgentChatRoomType
  title: string
  dmKey: string | null
  createdAt: string
  updatedAt: string
  members: BridgeAgentChatRoomMemberView[]
  lastMessage: BridgeAgentChatMessageView | null
}

export interface ListBridgeAgentChatRoomsArgs {
  actor: AccessActor
  shipDeploymentId: string
  memberBridgeCrewId?: string | null
  take?: number
}

export interface CreateBridgeAgentChatRoomInput {
  roomType: BridgeAgentChatRoomType | string
  title?: string | null
  memberBridgeCrewIds: string[]
  createdByBridgeCrewId?: string | null
}

export interface CreateBridgeAgentChatRoomArgs {
  actor: AccessActor
  shipDeploymentId: string
  input: CreateBridgeAgentChatRoomInput
}

export interface ListBridgeAgentChatMessagesArgs {
  actor: AccessActor
  shipDeploymentId: string
  roomId: string
  take?: number
  cursor?: string | null
}

export interface CreateBridgeAgentChatMessageInput {
  senderBridgeCrewId: string
  content: string
  autoReply?: boolean
  autoReplyRecipientBridgeCrewIds?: string[]
}

export interface CreateBridgeAgentChatMessageArgs {
  actor: AccessActor
  shipDeploymentId: string
  roomId: string
  input: CreateBridgeAgentChatMessageInput
}

export interface CreateBridgeAgentChatMessageResult {
  message: BridgeAgentChatMessageView
  queuedReplyJobs: number
  queuedReplyJobIds: string[]
}

export interface ListBridgeAgentChatMessagesResult {
  shipDeploymentId: string
  roomId: string
  nextCursor: string | null
  messages: BridgeAgentChatMessageView[]
}

export interface ListBridgeAgentChatRoomsResult {
  shipDeploymentId: string
  rooms: BridgeAgentChatRoomView[]
}

export interface CreateBridgeAgentChatRoomResult {
  shipDeploymentId: string
  room: BridgeAgentChatRoomView
  created: boolean
}
