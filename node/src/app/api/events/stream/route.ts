import { NextRequest, NextResponse } from "next/server"
import { subscribeRealtimeEvents, toSseChunk } from "@/lib/realtime/events"
import { AccessControlError, requireAccessActor, type AccessActor } from "@/lib/security/access-control"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  let actor: AccessActor
  try {
    actor = await requireAccessActor()
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const typesParam = request.nextUrl.searchParams.get("types")
  const typeFilter = new Set(
    (typesParam || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  )

  const encoder = new TextEncoder()
  let unsubscribe: (() => void) | null = null
  let heartbeat: ReturnType<typeof setInterval> | null = null

  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => {
        controller.enqueue(encoder.encode(chunk))
      }

      const cleanup = () => {
        if (heartbeat) {
          clearInterval(heartbeat)
          heartbeat = null
        }
        if (unsubscribe) {
          unsubscribe()
          unsubscribe = null
        }
      }

      send(`event: connected\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`)

      unsubscribe = subscribeRealtimeEvents((event) => {
        if (typeFilter.size > 0 && !typeFilter.has(event.type)) {
          return
        }

        if (!actor.isAdmin && event.userId !== actor.userId) {
          return
        }

        send(toSseChunk(event))
      })

      heartbeat = setInterval(() => {
        send(`event: heartbeat\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`)
      }, 20000)

      request.signal.addEventListener("abort", () => {
        cleanup()
        controller.close()
      })
    },
    cancel() {
      if (heartbeat) {
        clearInterval(heartbeat)
        heartbeat = null
      }
      if (unsubscribe) {
        unsubscribe()
        unsubscribe = null
      }
    },
  })

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
