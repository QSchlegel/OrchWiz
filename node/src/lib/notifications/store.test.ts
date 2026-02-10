import test from "node:test"
import assert from "node:assert/strict"
import {
  clearUnreadChannels,
  formatUnreadBadgeCount,
  incrementUnread,
  notificationUnreadStorageKey,
  sanitizeUnreadState,
  unreadCountForChannels,
  type NotificationUnreadState,
} from "./store"

test("sanitizeUnreadState drops invalid channels and non-positive counts", () => {
  const state = sanitizeUnreadState({
    sessions: 3,
    tasks: 0,
    "unknown.channel": 20,
    "bridge-chat": 4.9,
    applications: -5,
    projects: "5",
  })

  assert.deepEqual(state, {
    sessions: 3,
    "bridge-chat": 4,
  })
})

test("incrementUnread increments by at least one and preserves other channels", () => {
  const original: NotificationUnreadState = {
    sessions: 2,
    tasks: 1,
  }

  const next = incrementUnread(original, "sessions", 3)
  assert.deepEqual(next, {
    sessions: 5,
    tasks: 1,
  })

  const minIncrement = incrementUnread(next, "tasks", 0)
  assert.deepEqual(minIncrement, {
    sessions: 5,
    tasks: 2,
  })
})

test("clearUnreadChannels only clears requested leaf channels", () => {
  const state: NotificationUnreadState = {
    "personal.personal": 2,
    "personal.personal.context": 4,
    "personal.personal.permissions": 3,
    "vault.explorer": 1,
  }

  const cleared = clearUnreadChannels(state, ["personal.personal.context"])
  assert.deepEqual(cleared, {
    "personal.personal": 2,
    "personal.personal.permissions": 3,
    "vault.explorer": 1,
  })
})

test("unreadCountForChannels sums aggregate channels for sidebar items and groups", () => {
  const state: NotificationUnreadState = {
    commands: 2,
    hooks: 1,
    "permissions.allow": 3,
    "permissions.ask": 4,
    "permissions.deny": 5,
    "permissions.workspace": 6,
  }

  const permissionsItem = unreadCountForChannels(state, [
    "permissions.allow",
    "permissions.ask",
    "permissions.deny",
    "permissions.workspace",
  ])
  assert.equal(permissionsItem, 18)

  const arsenalGroup = unreadCountForChannels(state, [
    "commands",
    "hooks",
    "permissions.allow",
    "permissions.ask",
    "permissions.deny",
    "permissions.workspace",
  ])
  assert.equal(arsenalGroup, 21)
})

test("formatUnreadBadgeCount clamps at 99+", () => {
  assert.equal(formatUnreadBadgeCount(-1), null)
  assert.equal(formatUnreadBadgeCount(0), null)
  assert.equal(formatUnreadBadgeCount(1), "1")
  assert.equal(formatUnreadBadgeCount(99), "99")
  assert.equal(formatUnreadBadgeCount(100), "99+")
  assert.equal(formatUnreadBadgeCount(999), "99+")
})

test("notificationUnreadStorageKey isolates state by user", () => {
  const keyA = notificationUnreadStorageKey("user-a")
  const keyB = notificationUnreadStorageKey("user-b")

  assert.equal(keyA, "orchwiz:notifications:unread:user-a")
  assert.equal(keyB, "orchwiz:notifications:unread:user-b")
  assert.notEqual(keyA, keyB)
})

test("clearUnreadChannels returns original state when nothing changes", () => {
  const state: NotificationUnreadState = {
    sessions: 2,
  }

  const unchanged = clearUnreadChannels(state, ["tasks"])
  assert.equal(unchanged, state)
})
