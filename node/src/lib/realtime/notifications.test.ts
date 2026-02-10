import test from "node:test"
import assert from "node:assert/strict"
import { asNotificationUpdatedPayload } from "../types/notifications"
import { publishNotificationUpdated, publishNotificationUpdatedMany } from "./notifications"

test("publishNotificationUpdated emits notification.updated with default increment action", () => {
  const event = publishNotificationUpdated({
    userId: "user-1",
    channel: "projects",
    entityId: "project-1",
  })

  assert.ok(event)
  assert.equal(event?.type, "notification.updated")
  assert.equal(event?.userId, "user-1")
  assert.deepEqual(event?.payload, {
    userId: "user-1",
    channel: "projects",
    action: "increment",
    entityId: "project-1",
  })
})

test("publishNotificationUpdated supports clear action", () => {
  const event = publishNotificationUpdated({
    userId: "user-2",
    channel: "permissions.allow",
    action: "clear",
  })

  assert.ok(event)
  assert.equal(event?.type, "notification.updated")
  assert.deepEqual(event?.payload, {
    userId: "user-2",
    channel: "permissions.allow",
    action: "clear",
  })
})

test("publishNotificationUpdated ignores invalid channels", () => {
  const event = publishNotificationUpdated({
    userId: "user-1",
    channel: "not-a-real-channel" as any,
  })

  assert.equal(event, null)
})

test("publishNotificationUpdatedMany de-duplicates and trims user ids", () => {
  const events = publishNotificationUpdatedMany({
    userIds: ["user-1", " user-1 ", "", "user-2", "user-2"],
    channel: "hooks",
    entityId: "hook-123",
  })

  assert.equal(events.length, 2)
  assert.deepEqual(
    events.map((event) => event.userId).sort(),
    ["user-1", "user-2"],
  )
  for (const event of events) {
    assert.equal(event.type, "notification.updated")
    assert.deepEqual(event.payload, {
      userId: event.userId,
      channel: "hooks",
      action: "increment",
      entityId: "hook-123",
    })
  }
})

test("asNotificationUpdatedPayload parses valid payload and rejects invalid channels", () => {
  const parsed = asNotificationUpdatedPayload({
    channel: "quartermaster.chat",
    action: "increment",
    entityId: "ship-1",
    userId: "user-1",
  })

  assert.deepEqual(parsed, {
    channel: "quartermaster.chat",
    action: "increment",
    entityId: "ship-1",
    userId: "user-1",
  })

  const invalid = asNotificationUpdatedPayload({
    channel: "invalid.channel",
    action: "increment",
  })
  assert.equal(invalid, null)
})
