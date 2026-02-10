import { isNotificationChannel, type NotificationChannel } from "@/lib/types/notifications"

export type NotificationUnreadState = Partial<Record<NotificationChannel, number>>

export function notificationUnreadStorageKey(userId: string): string {
  return `orchwiz:notifications:unread:${userId}`
}

function asPositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null
  }

  const normalized = Math.floor(value)
  return normalized > 0 ? normalized : null
}

export function sanitizeUnreadState(value: unknown): NotificationUnreadState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  const next: NotificationUnreadState = {}
  for (const [key, raw] of Object.entries(value)) {
    if (!isNotificationChannel(key)) {
      continue
    }

    const count = asPositiveInteger(raw)
    if (count !== null) {
      next[key] = count
    }
  }

  return next
}

export function incrementUnread(
  state: NotificationUnreadState,
  channel: NotificationChannel,
  amount = 1,
): NotificationUnreadState {
  const incrementBy = Math.max(1, Math.floor(amount))
  const current = state[channel] || 0
  return {
    ...state,
    [channel]: current + incrementBy,
  }
}

export function clearUnreadChannels(
  state: NotificationUnreadState,
  channels: NotificationChannel[],
): NotificationUnreadState {
  if (channels.length === 0) {
    return state
  }

  let changed = false
  const next: NotificationUnreadState = { ...state }

  for (const channel of channels) {
    if (!next[channel]) {
      continue
    }

    delete next[channel]
    changed = true
  }

  return changed ? next : state
}

export function unreadCountForChannels(
  state: NotificationUnreadState,
  channels: NotificationChannel[],
): number {
  let total = 0

  for (const channel of channels) {
    total += state[channel] || 0
  }

  return total
}

export function formatUnreadBadgeCount(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) {
    return null
  }

  if (count > 99) {
    return "99+"
  }

  return String(Math.floor(count))
}
