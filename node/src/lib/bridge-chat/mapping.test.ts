import test from "node:test"
import assert from "node:assert/strict"
import {
  bridgeChatRoleToInteractionType,
  interactionTypeToBridgeChatRole,
  isBridgeStationKey,
  normalizeBridgeChatRole,
} from "./mapping"

test("interactionTypeToBridgeChatRole maps interaction types to bridge roles", () => {
  assert.equal(interactionTypeToBridgeChatRole("user_input"), "user")
  assert.equal(interactionTypeToBridgeChatRole("ai_response"), "assistant")
  assert.equal(interactionTypeToBridgeChatRole("tool_use"), "system")
  assert.equal(interactionTypeToBridgeChatRole("error"), "system")
})

test("bridgeChatRoleToInteractionType maps bridge roles to interaction types", () => {
  assert.equal(bridgeChatRoleToInteractionType("user"), "user_input")
  assert.equal(bridgeChatRoleToInteractionType("assistant"), "ai_response")
  assert.equal(bridgeChatRoleToInteractionType("system"), "error")
})

test("normalizeBridgeChatRole and station key guards provide safe fallbacks", () => {
  assert.equal(normalizeBridgeChatRole("assistant"), "assistant")
  assert.equal(normalizeBridgeChatRole("not-a-role"), "user")
  assert.equal(normalizeBridgeChatRole(undefined, "system"), "system")

  assert.equal(isBridgeStationKey("xo"), true)
  assert.equal(isBridgeStationKey("cou"), true)
  assert.equal(isBridgeStationKey("invalid"), false)
})
