import assert from "node:assert/strict"
import test from "node:test"
import { buildInitialXoMessages, buildPasskeySoftGateReply } from "./xo-window-state"

test("buildInitialXoMessages seeds starter and help transcript", () => {
  const messages = buildInitialXoMessages()

  assert.equal(messages.length, 3)
  assert.deepEqual(
    messages.map((message) => message.id),
    ["xo-start", "xo-help-user", "xo-help-assistant"],
  )
  assert.equal(messages[0].role, "assistant")
  assert.equal(messages[1].role, "user")
  assert.equal(messages[1].content, "/help")
})

test("buildInitialXoMessages includes command list in seeded help reply", () => {
  const messages = buildInitialXoMessages()
  const helpReply = messages[2]?.content || ""

  assert.ok(helpReply.includes("Bridge commands:"))
  assert.ok(helpReply.includes("/help"))
  assert.ok(helpReply.includes("/docs <topic>"))
  assert.ok(helpReply.includes("/register"))
})

test("buildPasskeySoftGateReply references passkey unlock", () => {
  const reply = buildPasskeySoftGateReply()

  assert.ok(reply.length > 0)
  assert.ok(reply.toLowerCase().includes("passkey"))
  assert.ok(reply.toLowerCase().includes("unlock"))
})
