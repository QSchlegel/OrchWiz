import test from "node:test"
import assert from "node:assert/strict"
import type { NextRequest } from "next/server"
import { AccessControlError, type AccessActor } from "@/lib/security/access-control"
import { BridgeAgentChatError } from "@/lib/bridge-agent-chat/types"
import { handleGetRooms, handlePostRooms } from "./route"

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

function sampleRoom(created = true) {
  return {
    shipDeploymentId: "ship-1",
    created,
    room: {
      id: "room-1",
      shipDeploymentId: "ship-1",
      roomType: "dm" as const,
      title: "XO-CB01 <> OPS-ARX",
      dmKey: "ship-1:crew-1:crew-2",
      createdAt: "2026-02-10T10:00:00.000Z",
      updatedAt: "2026-02-10T10:00:00.000Z",
      members: [],
      lastMessage: null,
    },
  }
}

test("agent-chat rooms GET returns unauthorized when actor resolution fails", async () => {
  const response = await handleGetRooms(
    requestFor("http://localhost/api/ships/ship-1/agent-chat/rooms"),
    "ship-1",
    {
      requireActor: async () => {
        throw new AccessControlError("Unauthorized", 401, "UNAUTHORIZED")
      },
      listRooms: async () => {
        throw new Error("should not run")
      },
      createRoom: async () => {
        throw new Error("should not run")
      },
    },
  )

  assert.equal(response.status, 401)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.error, "Unauthorized")
  assert.equal(payload.code, "UNAUTHORIZED")
})

test("agent-chat rooms GET returns not found when ship is missing", async () => {
  const response = await handleGetRooms(
    requestFor("http://localhost/api/ships/ship-missing/agent-chat/rooms"),
    "ship-missing",
    {
      requireActor: async () => actor,
      listRooms: async () => {
        throw new BridgeAgentChatError("Ship not found", 404, "SHIP_NOT_FOUND")
      },
      createRoom: async () => {
        throw new Error("should not run")
      },
    },
  )

  assert.equal(response.status, 404)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.code, "SHIP_NOT_FOUND")
})

test("agent-chat rooms POST returns 200 when DM already exists (idempotent)", async () => {
  const response = await handlePostRooms(
    requestFor("http://localhost/api/ships/ship-1/agent-chat/rooms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        roomType: "dm",
        memberBridgeCrewIds: ["crew-1", "crew-2"],
      }),
    }),
    "ship-1",
    {
      requireActor: async () => actor,
      listRooms: async () => {
        throw new Error("should not run")
      },
      createRoom: async () => sampleRoom(false),
    },
  )

  assert.equal(response.status, 200)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.created, false)
})

test("agent-chat rooms POST surfaces invalid membership validation errors", async () => {
  const response = await handlePostRooms(
    requestFor("http://localhost/api/ships/ship-1/agent-chat/rooms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        roomType: "group",
        memberBridgeCrewIds: ["crew-1", "crew-x", "crew-y"],
      }),
    }),
    "ship-1",
    {
      requireActor: async () => actor,
      listRooms: async () => {
        throw new Error("should not run")
      },
      createRoom: async () => {
        throw new BridgeAgentChatError(
          "memberBridgeCrewIds must all be active bridge crew on the selected ship.",
          400,
          "INVALID_ROOM_MEMBERS",
          { missingIds: ["crew-x"] },
        )
      },
    },
  )

  assert.equal(response.status, 400)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.code, "INVALID_ROOM_MEMBERS")
})
