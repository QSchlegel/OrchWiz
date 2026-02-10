import test from "node:test"
import assert from "node:assert/strict"
import { sidebarNav } from "../../components/sidebar/sidebarNav"
import {
  LEGACY_EVENT_NOTIFICATION_CHANNEL_MAP,
  PERMISSIONS_TAB_NOTIFICATION_CHANNEL,
  PERSONAL_DETAIL_NOTIFICATION_CHANNEL,
  PERSONAL_TAB_NOTIFICATION_CHANNEL,
  SIDEBAR_NOTIFICATION_CHANNELS_BY_HREF,
  VAULT_TAB_NOTIFICATION_CHANNEL,
  channelFromLegacyRealtimeEventType,
  notificationChannelsForSidebarHref,
} from "./channels"
import type { NotificationChannel } from "../types/notifications"

function asSortedSet(values: NotificationChannel[]): NotificationChannel[] {
  return Array.from(new Set(values)).sort()
}

test("legacy realtime event mapping resolves expected channels", () => {
  assert.equal(channelFromLegacyRealtimeEventType("session.prompted"), "sessions")
  assert.equal(channelFromLegacyRealtimeEventType("task.updated"), "tasks")
  assert.equal(channelFromLegacyRealtimeEventType("bridge.updated"), "bridge-chat")
  assert.equal(channelFromLegacyRealtimeEventType("bridge.agent-chat.updated"), "bridge-chat")
  assert.equal(channelFromLegacyRealtimeEventType("agentsync.updated"), "personal.personal.agentsync")
  assert.equal(channelFromLegacyRealtimeEventType("notification.updated"), null)
  assert.equal(channelFromLegacyRealtimeEventType("unknown.event"), null)
})

test("legacy mapping contract includes expected fallback routes", () => {
  assert.equal(LEGACY_EVENT_NOTIFICATION_CHANNEL_MAP["webhook.received"], "github-prs")
  assert.equal(LEGACY_EVENT_NOTIFICATION_CHANNEL_MAP["docs.updated"], "docs")
  assert.equal(LEGACY_EVENT_NOTIFICATION_CHANNEL_MAP["command.executed"], "commands")
})

test("sidebar route channel aggregation resolves canonical channels", () => {
  assert.deepEqual(notificationChannelsForSidebarHref("/permissions"), [
    "permissions.allow",
    "permissions.ask",
    "permissions.deny",
    "permissions.workspace",
  ])

  assert.deepEqual(notificationChannelsForSidebarHref("/vault"), [
    "vault.topology",
    "vault.explorer",
    "vault.graph",
  ])

  assert.equal(notificationChannelsForSidebarHref("/does-not-exist").length, 0)
})

test("sidebar nav items receive channel mappings", () => {
  const permissionsItem = sidebarNav
    .flatMap((group) => group.items)
    .find((item) => item.href === "/permissions")
  assert.ok(permissionsItem)
  assert.deepEqual(permissionsItem?.channels, Object.values(PERMISSIONS_TAB_NOTIFICATION_CHANNEL))

  const personalItem = sidebarNav
    .flatMap((group) => group.items)
    .find((item) => item.href === "/personal")
  assert.ok(personalItem)
  assert.equal(personalItem?.channels.includes(PERSONAL_TAB_NOTIFICATION_CHANNEL.personal), true)
  assert.equal(personalItem?.channels.includes(PERSONAL_TAB_NOTIFICATION_CHANNEL.shared), true)
  assert.equal(
    personalItem?.channels.includes(PERSONAL_DETAIL_NOTIFICATION_CHANNEL.personal.context),
    true,
  )
  assert.equal(
    personalItem?.channels.includes(PERSONAL_DETAIL_NOTIFICATION_CHANNEL.shared.guidelines),
    true,
  )
  assert.equal(
    personalItem?.channels.includes(PERSONAL_DETAIL_NOTIFICATION_CHANNEL.personal.capabilities),
    true,
  )
  assert.equal(
    personalItem?.channels.includes(PERSONAL_DETAIL_NOTIFICATION_CHANNEL.shared.capabilities),
    true,
  )
})

test("sidebar group channel aggregation can be derived from child items", () => {
  const arsenal = sidebarNav.find((group) => group.key === "arsenal")
  assert.ok(arsenal)

  const channels = asSortedSet(arsenal!.items.flatMap((item) => item.channels))
  const expected = asSortedSet([
    "commands",
    "hooks",
    ...Object.values(PERMISSIONS_TAB_NOTIFICATION_CHANNEL),
  ])

  assert.deepEqual(channels, expected)
})

test("channel registries include full permissions, vault, and personal contracts", () => {
  assert.deepEqual(Object.values(PERMISSIONS_TAB_NOTIFICATION_CHANNEL), [
    "permissions.allow",
    "permissions.ask",
    "permissions.deny",
    "permissions.workspace",
  ])
  assert.deepEqual(Object.values(VAULT_TAB_NOTIFICATION_CHANNEL), [
    "vault.topology",
    "vault.explorer",
    "vault.graph",
  ])
  assert.deepEqual(Object.values(PERSONAL_TAB_NOTIFICATION_CHANNEL), [
    "personal.personal",
    "personal.shared",
  ])
  assert.equal(
    SIDEBAR_NOTIFICATION_CHANNELS_BY_HREF["/personal"]?.includes(
      PERSONAL_DETAIL_NOTIFICATION_CHANNEL.personal.permissions,
    ),
    true,
  )
  assert.equal(
    SIDEBAR_NOTIFICATION_CHANNELS_BY_HREF["/personal"]?.includes(
      PERSONAL_DETAIL_NOTIFICATION_CHANNEL.shared.permissions,
    ),
    true,
  )
})
