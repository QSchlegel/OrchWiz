import test from "node:test"
import assert from "node:assert/strict"
import {
  BRIDGE_AGENT_CHAT_REPLY_MAX_ATTEMPTS,
  buildBridgeAgentChatReplyJobDedupeKey,
  computeBridgeAgentChatReplyRetrySchedule,
} from "@/lib/bridge-agent-chat/replies"

test("buildBridgeAgentChatReplyJobDedupeKey is deterministic for the same inputs", () => {
  const first = buildBridgeAgentChatReplyJobDedupeKey({
    roomId: "room-1",
    sourceMessageId: "msg-1",
    recipientBridgeCrewId: "crew-1",
  })

  const second = buildBridgeAgentChatReplyJobDedupeKey({
    roomId: "room-1",
    sourceMessageId: "msg-1",
    recipientBridgeCrewId: "crew-1",
  })

  const differentRecipient = buildBridgeAgentChatReplyJobDedupeKey({
    roomId: "room-1",
    sourceMessageId: "msg-1",
    recipientBridgeCrewId: "crew-2",
  })

  assert.equal(first, second)
  assert.notEqual(first, differentRecipient)
})

test("computeBridgeAgentChatReplyRetrySchedule uses exponential backoff", () => {
  const base = new Date("2026-02-10T10:00:00.000Z")

  const first = computeBridgeAgentChatReplyRetrySchedule({ attempts: 1, now: base })
  const second = computeBridgeAgentChatReplyRetrySchedule({ attempts: 2, now: base })
  const third = computeBridgeAgentChatReplyRetrySchedule({ attempts: 3, now: base })

  assert.equal(first.terminal, false)
  assert.equal(second.terminal, false)
  assert.equal(third.terminal, false)

  assert.equal(first.nextAttemptAt?.getTime(), base.getTime() + 1_000)
  assert.equal(second.nextAttemptAt?.getTime(), base.getTime() + 2_000)
  assert.equal(third.nextAttemptAt?.getTime(), base.getTime() + 4_000)
})

test("computeBridgeAgentChatReplyRetrySchedule marks terminal at max attempts", () => {
  const result = computeBridgeAgentChatReplyRetrySchedule({
    attempts: BRIDGE_AGENT_CHAT_REPLY_MAX_ATTEMPTS,
    now: new Date("2026-02-10T10:00:00.000Z"),
  })

  assert.equal(result.terminal, true)
  assert.equal(result.nextAttemptAt, null)
})
