"use client"

import { useEffect } from "react"
import type { RealtimeEventType } from "@/lib/types/realtime"

interface UseEventStreamOptions {
  enabled?: boolean
  types?: RealtimeEventType[]
  onEvent: (event: { type: string; payload: unknown; timestamp: string; id: string }) => void
}

export function useEventStream({ enabled = true, types, onEvent }: UseEventStreamOptions) {
  useEffect(() => {
    if (!enabled) {
      return
    }

    const params = new URLSearchParams()
    if (types && types.length > 0) {
      params.set("types", types.join(","))
    }

    const url = params.toString() ? `/api/events/stream?${params.toString()}` : "/api/events/stream"
    const source = new EventSource(url)

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        onEvent(data)
      } catch (error) {
        console.error("Failed to parse SSE event payload:", error)
      }
    }

    source.onerror = (error) => {
      console.error("SSE connection error:", error)
    }

    return () => {
      source.close()
    }
  }, [enabled, onEvent, types])
}
