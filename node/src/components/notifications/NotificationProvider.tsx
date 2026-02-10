"use client"

import { createContext, useCallback, useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"
import { useSession } from "@/lib/auth-client"
import { useEventStream } from "@/lib/realtime/useEventStream"
import { allNavItems, matchesPath } from "@/components/sidebar"
import { channelFromLegacyRealtimeEventType } from "@/lib/notifications/channels"
import {
  clearUnreadChannels,
  incrementUnread,
  notificationUnreadStorageKey,
  sanitizeUnreadState,
  unreadCountForChannels,
  type NotificationUnreadState,
} from "@/lib/notifications/store"
import {
  asNotificationUpdatedPayload,
  type NotificationChannel,
} from "@/lib/types/notifications"

interface NotificationContextValue {
  unreadByChannel: NotificationUnreadState
  getUnread: (channels: NotificationChannel[]) => number
  clearChannels: (channels: NotificationChannel[]) => void
  registerActiveChannels: (channels: NotificationChannel[]) => () => void
}

export const NotificationContext = createContext<NotificationContextValue | null>(null)

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const userId = session?.user?.id || null
  const [unreadByChannel, setUnreadByChannel] = useState<NotificationUnreadState>({})

  const storageKey = userId ? notificationUnreadStorageKey(userId) : null

  useEffect(() => {
    if (!storageKey) {
      setUnreadByChannel({})
      return
    }

    try {
      const raw = window.localStorage.getItem(storageKey)
      if (!raw) {
        setUnreadByChannel({})
        return
      }

      setUnreadByChannel(sanitizeUnreadState(JSON.parse(raw)))
    } catch {
      setUnreadByChannel({})
    }
  }, [storageKey])

  useEffect(() => {
    if (!storageKey) {
      return
    }

    window.localStorage.setItem(storageKey, JSON.stringify(unreadByChannel))
  }, [storageKey, unreadByChannel])

  const clearChannels = useCallback((channels: NotificationChannel[]) => {
    setUnreadByChannel((current) => clearUnreadChannels(current, channels))
  }, [])

  const registerActiveChannels = useCallback((channels: NotificationChannel[]) => {
    setUnreadByChannel((current) => clearUnreadChannels(current, channels))
    return () => {
      // noop cleanup; active registration only clears on enter.
    }
  }, [])

  const handleRealtimeEvent = useCallback((event: { type: string; payload: unknown }) => {
    if (event.type === "notification.updated") {
      const payload = asNotificationUpdatedPayload(event.payload)
      if (!payload) {
        return
      }

      if (payload.action === "clear") {
        setUnreadByChannel((current) => clearUnreadChannels(current, [payload.channel]))
      } else {
        setUnreadByChannel((current) => incrementUnread(current, payload.channel))
      }
      return
    }

    const channel = channelFromLegacyRealtimeEventType(event.type)
    if (!channel) {
      return
    }

    setUnreadByChannel((current) => incrementUnread(current, channel))
  }, [])

  useEventStream({
    enabled: Boolean(userId),
    onEvent: handleRealtimeEvent,
  })

  useEffect(() => {
    if (!pathname) {
      return
    }

    const activeItem = allNavItems.find((item) => matchesPath(pathname, item.href))
    if (!activeItem || activeItem.channels.length !== 1) {
      return
    }

    setUnreadByChannel((current) => clearUnreadChannels(current, activeItem.channels))
  }, [pathname])

  const getUnread = useCallback(
    (channels: NotificationChannel[]) => unreadCountForChannels(unreadByChannel, channels),
    [unreadByChannel],
  )

  const value = useMemo<NotificationContextValue>(
    () => ({
      unreadByChannel,
      getUnread,
      clearChannels,
      registerActiveChannels,
    }),
    [unreadByChannel, getUnread, clearChannels, registerActiveChannels],
  )

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
}
