import { publishRealtimeEvent } from "@/lib/realtime/events"
import {
  isNotificationChannel,
  type NotificationChannel,
  type NotificationUpdateAction,
} from "@/lib/types/notifications"

interface PublishNotificationUpdatedInput {
  userId?: string
  channel: NotificationChannel
  action?: NotificationUpdateAction
  entityId?: string
}

interface PublishNotificationUpdatedManyInput {
  userIds: string[]
  channel: NotificationChannel
  action?: NotificationUpdateAction
  entityId?: string
}

export function publishNotificationUpdated(input: PublishNotificationUpdatedInput) {
  if (!isNotificationChannel(input.channel)) {
    return null
  }

  return publishRealtimeEvent({
    type: "notification.updated",
    ...(input.userId
      ? {
          userId: input.userId,
        }
      : {}),
    payload: {
      channel: input.channel,
      action: input.action || "increment",
      ...(input.entityId
        ? {
            entityId: input.entityId,
          }
        : {}),
      ...(input.userId
        ? {
            userId: input.userId,
          }
        : {}),
    },
  })
}

export function publishNotificationUpdatedMany(input: PublishNotificationUpdatedManyInput) {
  const uniqueUserIds = Array.from(new Set(input.userIds.map((id) => id.trim()).filter(Boolean)))

  const events = []
  for (const userId of uniqueUserIds) {
    const event = publishNotificationUpdated({
      userId,
      channel: input.channel,
      action: input.action,
      entityId: input.entityId,
    })

    if (event) {
      events.push(event)
    }
  }

  return events
}
