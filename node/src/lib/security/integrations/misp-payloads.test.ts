import test from "node:test"
import assert from "node:assert/strict"
import { buildMispAddAttributePayload, buildMispCreateEventPayload } from "./misp"

test("buildMispCreateEventPayload matches required MISP Event shape", () => {
  const payload = buildMispCreateEventPayload({
    info: "OrchWiz IR: Test (abc)",
    threat_level_id: 2,
    analysis: 0,
    distribution: 0,
    published: false,
    date: "2026-02-13",
  })

  assert.ok(payload.Event)
  assert.equal(payload.Event.info, "OrchWiz IR: Test (abc)")
  assert.equal(payload.Event.threat_level_id, 2)
  assert.equal(payload.Event.analysis, 0)
  assert.equal(payload.Event.distribution, 0)
  assert.equal(payload.Event.published, false)
  assert.equal(payload.Event.date, "2026-02-13")
})

test("buildMispAddAttributePayload matches required MISP Attribute shape", () => {
  const payload = buildMispAddAttributePayload({
    eventId: "123",
    value: "1.2.3.4",
    category: "Network activity",
    type: "ip-dst",
    comment: "context",
  })

  assert.equal(payload.event_id, "123")
  assert.equal(payload.value, "1.2.3.4")
  assert.equal(payload.category, "Network activity")
  assert.equal(payload.type, "ip-dst")
  assert.equal(payload.comment, "context")
})

