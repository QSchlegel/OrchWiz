import test from "node:test"
import assert from "node:assert/strict"
import type { NextRequest } from "next/server"
import { AccessControlError, type AccessActor } from "@/lib/security/access-control"
import { BridgeAgentChatError } from "@/lib/bridge-agent-chat/types"
import { handleGetMessages, handlePostMessages } from "./route"

const actor: AccessActor = {
  userId: "user-1",
  email: "captain@example.com",
  role: "captain",
  isAdmin: false,
}

function requestFor(url: string, init?: RequestInit): NextRequest {
  const request = new Request(url, init)
  return {
    ...request,
    headers: request.headers,
    json: request.json.bind(request),
    nextUrl: new URL(url),
  } as unknown as NextRequest
}

test("agent-chat messages GET returns unauthorized when actor resolution fails", async () => {
  const response = await handleGetMessages(
    requestFor("http://localhost/api/ships/ship-1/agent-chat/rooms/room-1/messages"),
    "ship-1",
    "room-1",
    {
      requireActor: async () => {
        throw new AccessControlError("Unauthorized", 401, "UNAUTHORIZED")
      },
      listMessages: async () => {
        throw new Error("should not run")
      },
      createMessage: async () => {
        throw new Error("should not run")
      },
      drainReplyJobs: async () => {
        throw new Error("should not run")
      },
    },
  )

  assert.equal(response.status, 401)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.code, "UNAUTHORIZED")
})

test("agent-chat messages GET returns room-not-found errors", async () => {
  const response = await handleGetMessages(
    requestFor("http://localhost/api/ships/ship-1/agent-chat/rooms/room-missing/messages"),
    "ship-1",
    "room-missing",
    {
      requireActor: async () => actor,
      listMessages: async () => {
        throw new BridgeAgentChatError("Room not found", 404, "ROOM_NOT_FOUND")
      },
      createMessage: async () => {
        throw new Error("should not run")
      },
      drainReplyJobs: async () => {
        throw new Error("should not run")
      },
    },
  )

  assert.equal(response.status, 404)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.code, "ROOM_NOT_FOUND")
})

test("agent-chat messages POST surfaces invalid sender validation", async () => {
  const response = await handlePostMessages(
    requestFor("http://localhost/api/ships/ship-1/agent-chat/rooms/room-1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        senderBridgeCrewId: "crew-z",
        content: "hello",
      }),
    }),
    "ship-1",
    "room-1",
    {
      requireActor: async () => actor,
      listMessages: async () => {
        throw new Error("should not run")
      },
      createMessage: async () => {
        throw new BridgeAgentChatError(
          "senderBridgeCrewId must be an active room member.",
          400,
          "INVALID_SENDER",
        )
      },
      drainReplyJobs: async () => {},
    },
  )

  assert.equal(response.status, 400)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.code, "INVALID_SENDER")
})

test("agent-chat messages POST surfaces invalid auto-reply recipient validation", async () => {
  const response = await handlePostMessages(
    requestFor("http://localhost/api/ships/ship-1/agent-chat/rooms/room-1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        senderBridgeCrewId: "crew-1",
        content: "hello",
        autoReply: true,
        autoReplyRecipientBridgeCrewIds: ["crew-x"],
      }),
    }),
    "ship-1",
    "room-1",
    {
      requireActor: async () => actor,
      listMessages: async () => {
        throw new Error("should not run")
      },
      createMessage: async () => {
        throw new BridgeAgentChatError(
          "autoReplyRecipientBridgeCrewIds must all be room members.",
          400,
          "AUTO_REPLY_RECIPIENT_NOT_IN_ROOM",
        )
      },
      drainReplyJobs: async () => {},
    },
  )

  assert.equal(response.status, 400)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.code, "AUTO_REPLY_RECIPIENT_NOT_IN_ROOM")
})
