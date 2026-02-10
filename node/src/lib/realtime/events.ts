import crypto from "node:crypto"
import type { RealtimeEvent } from "@/lib/types/realtime"

type EventListener = (event: RealtimeEvent) => void

interface EventBus {
  listeners: Set<EventListener>
}

declare global {
  // eslint-disable-next-line no-var
  var __orchwizEventBus: EventBus | undefined
}

function getEventBus(): EventBus {
  if (!globalThis.__orchwizEventBus) {
    globalThis.__orchwizEventBus = {
      listeners: new Set<EventListener>(),
    }
  }
  return globalThis.__orchwizEventBus
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function resolveEventUserId(event: { userId?: string; payload: unknown }): string | undefined {
  const explicit = asNonEmptyString(event.userId)
  if (explicit) {
    return explicit
  }

  if (event.payload && typeof event.payload === "object") {
    const candidate = asNonEmptyString((event.payload as Record<string, unknown>).userId)
    if (candidate) {
      return candidate
    }
  }

  return undefined
}

export function subscribeRealtimeEvents(listener: EventListener): () => void {
  const bus = getEventBus()
  bus.listeners.add(listener)
  return () => {
    bus.listeners.delete(listener)
  }
}

export function publishRealtimeEvent<T = unknown>(event: Omit<RealtimeEvent<T>, "id" | "timestamp">): RealtimeEvent<T> {
  const userId = resolveEventUserId({
    userId: event.userId,
    payload: event.payload,
  })

  const fullEvent: RealtimeEvent<T> = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...event,
    ...(userId
      ? {
          userId,
        }
      : {}),
  }

  const bus = getEventBus()
  for (const listener of bus.listeners) {
    try {
      listener(fullEvent)
    } catch (error) {
      console.error("Realtime listener failed:", error)
    }
  }

  return fullEvent
}

export function toSseChunk(event: RealtimeEvent): string {
  return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
}
