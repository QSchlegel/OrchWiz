"use client"

import { useEffect, useMemo, useRef } from "react"
import type { RealtimeEventType } from "@/lib/types/realtime"

interface UseEventStreamOptions {
  enabled?: boolean
  types?: RealtimeEventType[]
  onEvent: (event: { type: string; payload: unknown; timestamp: string; id: string }) => void
}

export function useEventStream({ enabled = true, types, onEvent }: UseEventStreamOptions) {
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  const typeKey = useMemo(() => {
    if (!types || types.length === 0) {
      return ""
    }
    return Array.from(new Set(types)).sort().join(",")
  }, [types])

  useEffect(() => {
    if (!enabled) {
      return
    }

    const params = new URLSearchParams()
    if (typeKey.length > 0) {
      params.set("types", typeKey)
    }

    const url = params.toString() ? `/api/events/stream?${params.toString()}` : "/api/events/stream"
    const source = new EventSource(url)
    const filteredTypes = typeKey.length > 0 ? typeKey.split(",").filter(Boolean) : []

    const handleMessage = (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data)
        onEventRef.current(data)
      } catch (error) {
        console.error("Failed to parse SSE event payload:", error)
      }
    }

    source.onmessage = handleMessage
    for (const eventType of filteredTypes) {
      source.addEventListener(eventType, handleMessage as unknown as EventListener)
    }

    source.onerror = (error) => {
      console.error("SSE connection error:", error)
    }

    return () => {
      for (const eventType of filteredTypes) {
        source.removeEventListener(eventType, handleMessage as unknown as EventListener)
      }
      source.close()
    }
  }, [enabled, typeKey])
}
