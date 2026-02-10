import test from "node:test"
import assert from "node:assert/strict"
import {
  ensureRoomMemberIds,
  validateAutoReplyRecipientIds,
  parseRoomType,
} from "@/lib/bridge-agent-chat/validation"
import { BridgeAgentChatError } from "@/lib/bridge-agent-chat/types"

test("ensureRoomMemberIds enforces DM count and sorts deterministic ids", () => {
  const members = ensureRoomMemberIds({
    roomType: "dm",
    memberBridgeCrewIds: ["crew-b", "crew-a"],
  })

  assert.deepEqual(members, ["crew-a", "crew-b"])

  assert.throws(
    () =>
      ensureRoomMemberIds({
        roomType: "dm",
        memberBridgeCrewIds: ["crew-a"],
      }),
    (error: unknown) => {
      assert.ok(error instanceof BridgeAgentChatError)
      assert.equal(error.code, "INVALID_DM_MEMBER_COUNT")
      return true
    },
  )
})

test("ensureRoomMemberIds enforces group minimum", () => {
  assert.throws(
    () =>
      ensureRoomMemberIds({
        roomType: "group",
        memberBridgeCrewIds: ["crew-a", "crew-b"],
      }),
    (error: unknown) => {
      assert.ok(error instanceof BridgeAgentChatError)
      assert.equal(error.code, "INVALID_GROUP_MEMBER_COUNT")
      return true
    },
  )

  const members = ensureRoomMemberIds({
    roomType: "group",
    memberBridgeCrewIds: ["crew-a", "crew-b", "crew-c", "crew-c"],
  })

  assert.deepEqual(members, ["crew-a", "crew-b", "crew-c"])
})

test("validateAutoReplyRecipientIds enforces room membership and sender exclusion", () => {
  const accepted = validateAutoReplyRecipientIds({
    autoReply: true,
    senderBridgeCrewId: "crew-a",
    requestedRecipientBridgeCrewIds: ["crew-b", "crew-c", "crew-b"],
    roomMemberBridgeCrewIds: ["crew-a", "crew-b", "crew-c"],
  })
  assert.deepEqual(accepted, ["crew-b", "crew-c"])

  assert.throws(
    () =>
      validateAutoReplyRecipientIds({
        autoReply: true,
        senderBridgeCrewId: "crew-a",
        requestedRecipientBridgeCrewIds: ["crew-z"],
        roomMemberBridgeCrewIds: ["crew-a", "crew-b", "crew-c"],
      }),
    (error: unknown) => {
      assert.ok(error instanceof BridgeAgentChatError)
      assert.equal(error.code, "AUTO_REPLY_RECIPIENT_NOT_IN_ROOM")
      return true
    },
  )

  assert.throws(
    () =>
      validateAutoReplyRecipientIds({
        autoReply: true,
        senderBridgeCrewId: "crew-a",
        requestedRecipientBridgeCrewIds: ["crew-a"],
        roomMemberBridgeCrewIds: ["crew-a", "crew-b", "crew-c"],
      }),
    (error: unknown) => {
      assert.ok(error instanceof BridgeAgentChatError)
      assert.equal(error.code, "AUTO_REPLY_RECIPIENT_CANNOT_BE_SENDER")
      return true
    },
  )
})

test("parseRoomType rejects unknown values", () => {
  assert.equal(parseRoomType("dm"), "dm")
  assert.equal(parseRoomType("group"), "group")

  assert.throws(
    () => parseRoomType("broadcast"),
    (error: unknown) => {
      assert.ok(error instanceof BridgeAgentChatError)
      assert.equal(error.code, "INVALID_ROOM_TYPE")
      return true
    },
  )
})
