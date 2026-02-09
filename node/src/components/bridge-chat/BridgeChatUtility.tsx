"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowLeft, Loader2, Send, Signal } from "lucide-react"
import { useEventStream } from "@/lib/realtime/useEventStream"

interface BridgeThreadRecord {
  id: string
  title: string
  stationKey: "xo" | "ops" | "eng" | "sec" | "med" | "cou" | null
  sessionId: string | null
  createdAt: string
  updatedAt: string
}

interface BridgeMessageRecord {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  createdAt: string
}

interface BridgeChatUtilityProps {
  operatorLabel: string
}

const STATION_ORDER: Array<NonNullable<BridgeThreadRecord["stationKey"]>> = ["xo", "ops", "eng", "sec", "med", "cou"]

const QUICK_DIRECTIVES = [
  "Status check",
  "Risk summary",
  "Next actions",
  "Escalate blockers",
]

function stationLabel(stationKey: BridgeThreadRecord["stationKey"]): string {
  return stationKey ? stationKey.toUpperCase() : "GEN"
}

function roleLabel(message: BridgeMessageRecord, operatorLabel: string): string {
  if (message.role === "user") {
    return operatorLabel
  }
  if (message.role === "assistant") {
    return "Bridge"
  }
  return "System"
}

function sortThreads(threads: BridgeThreadRecord[]): BridgeThreadRecord[] {
  const byStation = new Map(STATION_ORDER.map((key, index) => [key, index]))

  return [...threads].sort((a, b) => {
    const aStation = a.stationKey && byStation.has(a.stationKey) ? byStation.get(a.stationKey)! : 99
    const bStation = b.stationKey && byStation.has(b.stationKey) ? byStation.get(b.stationKey)! : 99

    if (aStation !== bStation) {
      return aStation - bStation
    }

    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
}

export function BridgeChatUtility({ operatorLabel }: BridgeChatUtilityProps) {
  const [threads, setThreads] = useState<BridgeThreadRecord[]>([])
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<BridgeMessageRecord[]>([])
  const [composer, setComposer] = useState("")
  const [isThreadsLoading, setIsThreadsLoading] = useState(true)
  const [isMessagesLoading, setIsMessagesLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) || null,
    [threads, selectedThreadId],
  )

  const loadThreads = useCallback(async () => {
    setIsThreadsLoading(true)
    try {
      const response = await fetch("/api/threads?view=station")
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const payload = await response.json()
      const nextThreads = Array.isArray(payload?.threads)
        ? sortThreads(payload.threads as BridgeThreadRecord[])
        : []

      setThreads(nextThreads)
      setSelectedThreadId((current) => {
        if (current && nextThreads.some((thread) => thread.id === current)) {
          return current
        }
        return nextThreads[0]?.id || null
      })
      setError(null)
    } catch (loadError) {
      console.error("Failed to load bridge-chat threads:", loadError)
      setError("Unable to load bridge threads")
    } finally {
      setIsThreadsLoading(false)
    }
  }, [])

  const loadMessages = useCallback(async (threadId: string) => {
    setIsMessagesLoading(true)
    try {
      const response = await fetch(`/api/threads/${threadId}/messages`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const payload = await response.json()
      const nextMessages = Array.isArray(payload?.messages)
        ? (payload.messages as BridgeMessageRecord[])
        : []
      setMessages(nextMessages)
      setError(null)
    } catch (loadError) {
      console.error("Failed to load bridge-chat messages:", loadError)
      setMessages([])
      setError("Unable to load thread transcript")
    } finally {
      setIsMessagesLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadThreads()
  }, [loadThreads])

  useEffect(() => {
    if (!selectedThreadId) {
      setMessages([])
      return
    }

    void loadMessages(selectedThreadId)
  }, [selectedThreadId, loadMessages])

  const sendMessage = useCallback(
    async (content: string) => {
      if (!selectedThreadId || !content.trim() || isSending) {
        return
      }

      const trimmed = content.trim()
      setIsSending(true)
      try {
        const response = await fetch(`/api/threads/${selectedThreadId}/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            role: "user",
            content: trimmed,
          }),
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        setComposer("")
        await loadMessages(selectedThreadId)
      } catch (sendError) {
        console.error("Failed to send bridge-chat message:", sendError)
        setComposer(trimmed)
        setError("Unable to send message")
      } finally {
        setIsSending(false)
      }
    },
    [selectedThreadId, isSending, loadMessages],
  )

  useEventStream({
    enabled: Boolean(selectedThreadId),
    types: ["bridge.updated", "session.prompted"],
    onEvent: (event) => {
      const payload = event.payload && typeof event.payload === "object"
        ? (event.payload as Record<string, unknown>)
        : {}

      const payloadThreadId = typeof payload.threadId === "string" ? payload.threadId : null
      const payloadSessionId = typeof payload.sessionId === "string" ? payload.sessionId : null
      const shouldRefreshSelected =
        (payloadThreadId && payloadThreadId === selectedThreadId) ||
        (payloadSessionId && selectedThread?.sessionId && payloadSessionId === selectedThread.sessionId) ||
        event.type === "session.prompted"

      if (shouldRefreshSelected && selectedThreadId) {
        void loadMessages(selectedThreadId)
      }

      if (event.type === "bridge.updated") {
        void loadThreads()
      }
    },
  })

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-3xl flex-col pb-[calc(132px+env(safe-area-inset-bottom))]">
        <header className="sticky top-0 z-30 border-b border-cyan-400/20 bg-slate-950/95 px-4 pb-3 pt-4 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/bridge"
              className="inline-flex items-center gap-2 rounded-full border border-cyan-400/35 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-100"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Bridge
            </Link>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/35 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-100">
              <Signal className="h-3.5 w-3.5" />
              Live
            </span>
          </div>

          <div className="mt-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-300/80">Bridge Chat</p>
            <p className="mt-1 text-sm text-slate-300">Operator {operatorLabel}</p>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {isThreadsLoading ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading stations
              </div>
            ) : (
              threads.map((thread) => {
                const active = thread.id === selectedThreadId
                return (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => setSelectedThreadId(thread.id)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      active
                        ? "border-cyan-300/60 bg-cyan-500/20 text-cyan-100"
                        : "border-slate-700 bg-slate-900 text-slate-300"
                    }`}
                  >
                    {stationLabel(thread.stationKey)}
                  </button>
                )
              })
            )}
          </div>
        </header>

        {error && (
          <div className="mx-4 mt-3 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            {error}
          </div>
        )}

        <section className="px-4 py-4">
          <div className="space-y-2">
            {!selectedThread && !isThreadsLoading && (
              <div className="rounded-xl border border-dashed border-slate-700 px-3 py-6 text-center text-sm text-slate-400">
                No bridge station thread available.
              </div>
            )}

            {selectedThread && messages.length === 0 && !isMessagesLoading && (
              <div className="rounded-xl border border-dashed border-cyan-400/30 bg-cyan-500/10 px-3 py-5 text-sm text-cyan-100">
                No messages yet. Send the first directive.
              </div>
            )}

            {isMessagesLoading && (
              <div className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                Updating transcript
              </div>
            )}

            {messages.map((message) => {
              const isUser = message.role === "user"
              const isSystem = message.role === "system"
              return (
                <article
                  key={message.id}
                  className={`rounded-2xl border px-3 py-2.5 ${
                    isUser
                      ? "border-cyan-300/35 bg-cyan-500/12 text-cyan-50"
                      : isSystem
                        ? "border-amber-300/40 bg-amber-500/10 text-amber-50"
                        : "border-slate-700 bg-slate-900/70 text-slate-100"
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.14em] text-slate-300">
                    <span>{roleLabel(message, operatorLabel)}</span>
                    <span>{new Date(message.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
                </article>
              )
            })}
          </div>
        </section>
      </div>

      <section className="fixed inset-x-0 bottom-0 z-40 border-t border-cyan-400/20 bg-slate-950/96 px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto w-full max-w-3xl space-y-2.5">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {QUICK_DIRECTIVES.map((directive) => (
              <button
                key={directive}
                type="button"
                onClick={() => void sendMessage(directive)}
                disabled={!selectedThread || isSending}
                className="shrink-0 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 disabled:opacity-60"
              >
                {directive}
              </button>
            ))}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault()
              void sendMessage(composer)
            }}
            className="flex items-end gap-2"
          >
            <textarea
              value={composer}
              onChange={(event) => setComposer(event.target.value)}
              rows={2}
              placeholder={selectedThread ? `Message ${stationLabel(selectedThread.stationKey)}...` : "Select station..."}
              disabled={!selectedThread || isSending}
              className="min-h-[52px] w-full resize-none rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/45 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!selectedThread || !composer.trim() || isSending}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-400/40 bg-cyan-500/15 text-cyan-100 disabled:opacity-60"
              aria-label="Send"
            >
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}
