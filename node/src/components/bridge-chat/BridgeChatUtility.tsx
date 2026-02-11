"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { useSearchParams } from "next/navigation"
import { ArrowLeft, Loader2, Mic, Send, Signal, Volume2, VolumeX } from "lucide-react"
import { useEventStream } from "@/lib/realtime/useEventStream"
import {
  createSpeechRecognition,
  isTextInputElement,
  normalizeVoiceTranscript,
  resolveStationFromTranscript,
  speechRecognitionSupported,
  speechSynthesisSupported,
  SUBTITLE_FADE_MS,
  VOICE_UNDO_DELAY_MS,
} from "@/lib/bridge-chat/voice"
import { playBridgeTts, type BridgeTtsPlaybackHandle } from "@/lib/bridge-chat/tts"
import type { BridgeStationKey } from "@/lib/bridge/stations"

interface BridgeThreadRecord {
  id: string
  title: string
  stationKey: BridgeStationKey | null
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

interface SubtitleCue {
  id: string
  speaker: string
  text: string
  createdAt: number
}

interface BridgeChatUtilityProps {
  operatorLabel: string
}

const STATION_ORDER: BridgeStationKey[] = ["xo", "ops", "eng", "sec", "med", "cou"]

const QUICK_DIRECTIVES = ["Status check", "Risk summary", "Next actions", "Escalate blockers"]

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
    const aStation = a.stationKey ? (byStation.has(a.stationKey) ? byStation.get(a.stationKey)! : 99) : -1
    const bStation = b.stationKey ? (byStation.has(b.stationKey) ? byStation.get(b.stationKey)! : 99) : -1

    if (aStation !== bStation) {
      return aStation - bStation
    }

    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
}

function cueOpacity(cue: SubtitleCue): number {
  const elapsed = Date.now() - cue.createdAt
  if (elapsed >= SUBTITLE_FADE_MS) {
    return 0
  }

  return Math.max(0, 1 - elapsed / SUBTITLE_FADE_MS)
}

export function BridgeChatUtility({ operatorLabel }: BridgeChatUtilityProps) {
  const searchParams = useSearchParams()
  const voiceQueryEnabled = searchParams.get("voice") === "1" || searchParams.get("voice") === "true"

  const [threads, setThreads] = useState<BridgeThreadRecord[]>([])
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<BridgeMessageRecord[]>([])
  const [composer, setComposer] = useState("")

  const [isThreadsLoading, setIsThreadsLoading] = useState(true)
  const [isMessagesLoading, setIsMessagesLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [voiceMode, setVoiceMode] = useState(voiceQueryEnabled)
  const [speakReplies, setSpeakReplies] = useState(voiceQueryEnabled)
  const [bargeInMode, setBargeInMode] = useState<"interrupt" | "queue">("interrupt")
  const [transcriptCollapsed, setTranscriptCollapsed] = useState(voiceQueryEnabled)
  const [speechSupported, setSpeechSupported] = useState(false)
  const [isHoldingToTalk, setIsHoldingToTalk] = useState(false)
  const [liveTranscript, setLiveTranscript] = useState("")

  const [pendingVoiceSend, setPendingVoiceSend] = useState<{
    id: string
    text: string
    threadId: string
    stationKey: BridgeStationKey | null
    expiresAt: number
  } | null>(null)

  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([])

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const transcriptRef = useRef("")
  const undoTimerRef = useRef<number | null>(null)
  const subtitleTickerRef = useRef<number | null>(null)
  const seenAssistantMessageIdsRef = useRef<Set<string>>(new Set())
  const bootstrappedThreadSubtitleRef = useRef<Set<string>>(new Set())
  const activePlaybackRef = useRef<BridgeTtsPlaybackHandle | null>(null)
  const playbackQueueRef = useRef<Promise<void>>(Promise.resolve())
  const playbackGenerationRef = useRef(0)

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) || null,
    [threads, selectedThreadId],
  )
  const selectedStationKey = selectedThread?.stationKey || null

  const generalThread = useMemo(
    () => threads.find((thread) => thread.stationKey === null) || null,
    [threads],
  )

  const threadByStation = useMemo(() => {
    const map = new Map<BridgeStationKey, BridgeThreadRecord>()
    for (const thread of threads) {
      if (thread.stationKey && !map.has(thread.stationKey)) {
        map.set(thread.stationKey, thread)
      }
    }
    return map
  }, [threads])

  const orderedStationKeys = useMemo(() => {
    return STATION_ORDER.filter((stationKey) => threadByStation.has(stationKey))
  }, [threadByStation])

  const visibleMessages = useMemo(() => {
    if (!voiceMode || !transcriptCollapsed) {
      return messages
    }

    return messages.slice(-4)
  }, [messages, transcriptCollapsed, voiceMode])

  const visibleSubtitleCues = useMemo(() => {
    return subtitleCues
      .slice(-2)
      .filter((cue) => cueOpacity(cue) > 0.01)
      .map((cue) => ({ cue, opacity: cueOpacity(cue) }))
  }, [subtitleCues])

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

  const sendMessageToThread = useCallback(
    async (threadId: string, content: string) => {
      if (!threadId || !content.trim() || isSending) {
        return
      }

      setIsSending(true)
      try {
        const response = await fetch(`/api/threads/${threadId}/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            role: "user",
            content: content.trim(),
          }),
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        if (threadId !== selectedThreadId) {
          setSelectedThreadId(threadId)
        }

        setComposer("")
        await loadMessages(threadId)
      } catch (sendError) {
        console.error("Failed to send bridge-chat message:", sendError)
        setError("Unable to send message")
      } finally {
        setIsSending(false)
      }
    },
    [isSending, loadMessages, selectedThreadId],
  )

  const pushSubtitleCue = useCallback((speaker: string, text: string) => {
    setSubtitleCues((current) => [
      ...current,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        speaker,
        text,
        createdAt: Date.now(),
      },
    ].slice(-2))
  }, [])

  const resetPlaybackQueue = useCallback(() => {
    playbackGenerationRef.current += 1
    playbackQueueRef.current = Promise.resolve()
  }, [])

  const stopAssistantPlayback = useCallback(() => {
    if (activePlaybackRef.current) {
      activePlaybackRef.current.stop()
      activePlaybackRef.current = null
    }

    if (speechSynthesisSupported()) {
      window.speechSynthesis.cancel()
    }
  }, [])

  const speakWithBrowserSynthesis = useCallback((content: string) => {
    if (!speechSynthesisSupported()) {
      return Promise.resolve()
    }

    return new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(content)
      utterance.rate = 1
      utterance.pitch = 1
      utterance.volume = 1
      utterance.lang = "en-US"
      utterance.onend = () => resolve()
      utterance.onerror = () => resolve()
      window.speechSynthesis.speak(utterance)
    })
  }, [])

  const playAssistantMessage = useCallback(
    async (content: string, stationKey: BridgeStationKey | null, generation: number) => {
      if (!voiceMode || !speakReplies || generation !== playbackGenerationRef.current) {
        return
      }

      try {
        const playback = await playBridgeTts({
          text: content,
          stationKey,
          surface: "bridge-chat",
        })

        if (!voiceMode || !speakReplies || generation !== playbackGenerationRef.current) {
          playback.stop()
          return
        }

        activePlaybackRef.current = playback
        await playback.done.catch(() => {})
        if (activePlaybackRef.current === playback) {
          activePlaybackRef.current = null
        }
      } catch {
        if (!voiceMode || !speakReplies || generation !== playbackGenerationRef.current) {
          return
        }
        await speakWithBrowserSynthesis(content)
      }
    },
    [speakReplies, speakWithBrowserSynthesis, voiceMode],
  )

  const speakAssistantMessage = useCallback(
    (content: string, stationKey: BridgeStationKey | null) => {
      if (!voiceMode || !speakReplies) {
        return
      }

      if (bargeInMode === "interrupt") {
        resetPlaybackQueue()
        stopAssistantPlayback()
        const generation = playbackGenerationRef.current
        void playAssistantMessage(content, stationKey, generation)
        return
      }

      const generation = playbackGenerationRef.current
      playbackQueueRef.current = playbackQueueRef.current
        .catch(() => {})
        .then(() => playAssistantMessage(content, stationKey, generation))
    },
    [bargeInMode, playAssistantMessage, resetPlaybackQueue, speakReplies, stopAssistantPlayback, voiceMode],
  )

  const commitPendingVoiceSend = useCallback(() => {
    if (!pendingVoiceSend) {
      return
    }

    const payload = pendingVoiceSend
    setPendingVoiceSend(null)

    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current)
      undoTimerRef.current = null
    }

    void sendMessageToThread(payload.threadId, payload.text)
  }, [pendingVoiceSend, sendMessageToThread])

  const queueVoiceSend = useCallback(
    (text: string) => {
      const normalized = normalizeVoiceTranscript(text)
      if (!normalized) {
        return
      }

      const stationKey = resolveStationFromTranscript({
        transcript: normalized,
        availableStationKeys: orderedStationKeys,
        fallbackStationKey: "xo",
      })
      const targetThread = threadByStation.get(stationKey) || selectedThread || threads[0] || null

      if (!targetThread) {
        setError("No bridge station thread available for voice routing")
        return
      }

      if (undoTimerRef.current) {
        window.clearTimeout(undoTimerRef.current)
      }

      const pending = {
        id: `${Date.now()}`,
        text: normalized,
        threadId: targetThread.id,
        stationKey: targetThread.stationKey,
        expiresAt: Date.now() + VOICE_UNDO_DELAY_MS,
      }

      setPendingVoiceSend(pending)
      undoTimerRef.current = window.setTimeout(() => {
        setPendingVoiceSend((current) => {
          if (!current || current.id !== pending.id) {
            return current
          }

          void sendMessageToThread(current.threadId, current.text)
          return null
        })
        undoTimerRef.current = null
      }, VOICE_UNDO_DELAY_MS)
    },
    [orderedStationKeys, selectedThread, sendMessageToThread, threadByStation, threads],
  )

  const startVoiceCapture = useCallback(() => {
    if (!voiceMode || !speechSupported || isHoldingToTalk) {
      return
    }

    const recognition = createSpeechRecognition()
    if (!recognition) {
      return
    }

    transcriptRef.current = ""
    setLiveTranscript("")
    setIsHoldingToTalk(true)

    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = "en-US"

    recognition.onresult = (event) => {
      let interim = ""
      let final = ""

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const transcript = result[0]?.transcript || ""
        if (result.isFinal) {
          final += ` ${transcript}`
        } else {
          interim += ` ${transcript}`
        }
      }

      const persisted = normalizeVoiceTranscript(`${transcriptRef.current} ${final}`)
      transcriptRef.current = persisted
      setLiveTranscript(normalizeVoiceTranscript(`${persisted} ${interim}`))
    }

    recognition.onerror = () => {
      setIsHoldingToTalk(false)
    }

    recognition.onend = () => {
      recognitionRef.current = null
      setIsHoldingToTalk(false)
    }

    recognitionRef.current = recognition

    try {
      recognition.start()
    } catch (error) {
      console.error("Failed to start speech recognition:", error)
      recognitionRef.current = null
      setIsHoldingToTalk(false)
    }
  }, [isHoldingToTalk, speechSupported, voiceMode])

  const endVoiceCapture = useCallback(() => {
    if (!isHoldingToTalk) {
      return
    }

    setIsHoldingToTalk(false)
    recognitionRef.current?.stop()

    window.setTimeout(() => {
      const transcript = normalizeVoiceTranscript(transcriptRef.current || liveTranscript)
      transcriptRef.current = ""
      setLiveTranscript("")
      queueVoiceSend(transcript)
    }, 150)
  }, [isHoldingToTalk, liveTranscript, queueVoiceSend])

  useEffect(() => {
    setSpeechSupported(speechRecognitionSupported())
  }, [])

  useEffect(() => {
    setVoiceMode(voiceQueryEnabled)
    if (voiceQueryEnabled) {
      setSpeakReplies(true)
      setTranscriptCollapsed(true)
    }
  }, [voiceQueryEnabled])

  useEffect(() => {
    void loadThreads()
  }, [loadThreads])

  useEffect(() => {
    if (!selectedThreadId) {
      setMessages([])
      return
    }

    void loadMessages(selectedThreadId)
  }, [loadMessages, selectedThreadId])

  useEffect(() => {
    if (!selectedThreadId) {
      return
    }

    if (!bootstrappedThreadSubtitleRef.current.has(selectedThreadId)) {
      for (const message of messages) {
        if (message.role === "assistant") {
          seenAssistantMessageIdsRef.current.add(message.id)
        }
      }
      bootstrappedThreadSubtitleRef.current.add(selectedThreadId)
      return
    }

    for (const message of messages) {
      if (message.role !== "assistant") {
        continue
      }

      if (seenAssistantMessageIdsRef.current.has(message.id)) {
        continue
      }

      seenAssistantMessageIdsRef.current.add(message.id)
      pushSubtitleCue("BRIDGE", message.content)
      speakAssistantMessage(message.content, selectedStationKey)
    }
  }, [messages, pushSubtitleCue, selectedStationKey, selectedThreadId, speakAssistantMessage])

  useEffect(() => {
    if (voiceMode && speakReplies) {
      return
    }

    resetPlaybackQueue()
    stopAssistantPlayback()
  }, [resetPlaybackQueue, speakReplies, stopAssistantPlayback, voiceMode])

  useEffect(() => {
    resetPlaybackQueue()
    stopAssistantPlayback()
  }, [resetPlaybackQueue, selectedThreadId, stopAssistantPlayback])

  useEffect(() => {
    if (!voiceMode) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || isTextInputElement(event.target)) {
        return
      }

      event.preventDefault()
      startVoiceCapture()
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space" || isTextInputElement(event.target)) {
        return
      }

      event.preventDefault()
      endVoiceCapture()
    }

    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)

    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
    }
  }, [endVoiceCapture, startVoiceCapture, voiceMode])

  useEffect(() => {
    subtitleTickerRef.current = window.setInterval(() => {
      setSubtitleCues((current) => current.filter((cue) => cueOpacity(cue) > 0.01))
    }, 300)

    return () => {
      if (subtitleTickerRef.current) {
        window.clearInterval(subtitleTickerRef.current)
      }
      if (undoTimerRef.current) {
        window.clearTimeout(undoTimerRef.current)
      }
      recognitionRef.current?.stop()
      stopAssistantPlayback()
      resetPlaybackQueue()
    }
  }, [resetPlaybackQueue, stopAssistantPlayback])

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
      <div className="mx-auto flex w-full max-w-3xl flex-col pb-[calc(152px+env(safe-area-inset-bottom))]">
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

          <div className="mt-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-300/80">Bridge Chat</p>
              <p className="mt-1 text-sm text-slate-300">Operator {operatorLabel}</p>
            </div>

            <span className={`rounded-full border px-3 py-1 text-xs ${voiceMode ? "border-cyan-300/45 bg-cyan-500/15 text-cyan-100" : "border-slate-600 bg-slate-900 text-slate-300"}`}>
              Voice {voiceMode ? "On" : "Off"}
            </span>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {isThreadsLoading ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading channels
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

        {voiceMode && (
          <section className="mx-4 mt-3 space-y-2 rounded-xl border border-cyan-400/25 bg-slate-900/65 px-3 py-2.5">
            {!speechSupported && (
              <p className="text-sm text-amber-100">Voice capture is unavailable in this browser. Type to send.</p>
            )}

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setSpeakReplies((current) => !current)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${
                  speakReplies ? "border-cyan-300/45 bg-cyan-500/15 text-cyan-100" : "border-slate-600 bg-slate-900 text-slate-300"
                }`}
              >
                {speakReplies ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                Speak replies
              </button>

              <label className="inline-flex items-center gap-2 rounded-full border border-slate-600 bg-slate-900 px-2.5 py-1 text-slate-200">
                Barge-in
                <select
                  value={bargeInMode}
                  onChange={(event) => setBargeInMode(event.target.value === "queue" ? "queue" : "interrupt")}
                  className="bg-transparent text-xs outline-none"
                >
                  <option value="interrupt">Interrupt</option>
                  <option value="queue">Queue</option>
                </select>
              </label>

              <button
                type="button"
                onMouseDown={startVoiceCapture}
                onMouseUp={endVoiceCapture}
                onMouseLeave={endVoiceCapture}
                onTouchStart={startVoiceCapture}
                onTouchEnd={endVoiceCapture}
                disabled={!speechSupported}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 ${
                  isHoldingToTalk
                    ? "border-cyan-200/70 bg-cyan-500/26 text-cyan-50"
                    : "border-cyan-300/45 bg-cyan-500/15 text-cyan-100"
                } disabled:opacity-60`}
              >
                <Mic className="h-3.5 w-3.5" />
                Hold to Talk (Space)
              </button>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-2 text-sm text-slate-200">
              {isHoldingToTalk ? liveTranscript || "Listening…" : "Voice idle"}
            </div>

            {visibleSubtitleCues.length > 0 && (
              <div className="space-y-1 rounded-lg border border-cyan-300/25 bg-slate-950/70 px-2.5 py-2">
                {visibleSubtitleCues.map(({ cue, opacity }) => (
                  <p key={cue.id} className="text-sm text-slate-100" style={{ opacity }}>
                    <span className="mr-2 text-[10px] uppercase tracking-[0.12em] text-cyan-200">[{cue.speaker}]</span>
                    {cue.text}
                  </p>
                ))}
              </div>
            )}

            {pendingVoiceSend && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cyan-300/35 bg-cyan-500/12 px-2.5 py-2 text-sm">
                <div className="text-cyan-100">
                  Queueing to {stationLabel(pendingVoiceSend.stationKey)}: {pendingVoiceSend.text}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (undoTimerRef.current) {
                        window.clearTimeout(undoTimerRef.current)
                        undoTimerRef.current = null
                      }
                      setPendingVoiceSend(null)
                    }}
                    className="rounded-md border border-cyan-200/40 bg-cyan-500/15 px-2 py-1 text-xs text-cyan-100"
                  >
                    Undo
                  </button>
                  <button
                    type="button"
                    onClick={commitPendingVoiceSend}
                    className="rounded-md border border-cyan-200/40 bg-cyan-500/20 px-2 py-1 text-xs text-cyan-100"
                  >
                    Send now
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        <section className="px-4 py-4">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setTranscriptCollapsed((current) => !current)}
              className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-200"
            >
              Transcript {transcriptCollapsed ? "Expand" : "Collapse"}
            </button>

            {voiceMode && (
              <span className="text-xs text-slate-400">Voice send has {VOICE_UNDO_DELAY_MS / 1000}s undo</span>
            )}
          </div>

          <div className="space-y-2">
            {!selectedThread && !isThreadsLoading && (
              <div className="rounded-xl border border-dashed border-slate-700 px-3 py-6 text-center text-sm text-slate-400">
                No bridge thread available.
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

            {visibleMessages.map((message) => {
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
            {generalThread && (
              <button
                type="button"
                onClick={() => setSelectedThreadId(generalThread.id)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${
                  selectedThreadId === generalThread.id
                    ? "border-cyan-300/60 bg-cyan-500/20 text-cyan-100"
                    : "border-slate-700 bg-slate-900 text-slate-200"
                }`}
              >
                General (Codex CLI)
              </button>
            )}
            {QUICK_DIRECTIVES.map((directive) => (
              <button
                key={directive}
                type="button"
                onClick={() => selectedThreadId && void sendMessageToThread(selectedThreadId, directive)}
                disabled={!selectedThread || isSending}
                className="shrink-0 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 disabled:opacity-60"
              >
                {directive}
              </button>
            ))}
          </div>

          <form
            onSubmit={(event: FormEvent) => {
              event.preventDefault()
              if (!selectedThreadId) {
                return
              }
              void sendMessageToThread(selectedThreadId, composer)
            }}
            className="flex items-end gap-2"
          >
            <textarea
              value={composer}
              onChange={(event) => setComposer(event.target.value)}
              rows={2}
              placeholder={selectedThread ? `Message ${stationLabel(selectedThread.stationKey)}...` : "Select channel..."}
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
