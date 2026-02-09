"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Send, Volume2 } from "lucide-react"
import { useSession } from "@/lib/auth-client"
import { useShipSelection } from "@/lib/shipyard/useShipSelection"
import { useEventStream } from "@/lib/realtime/useEventStream"
import type {
  BridgeCallRoundPostResponse,
  BridgeCallRoundView,
  BridgeCallRoundsGetResponse,
  BridgeCallShipSummary,
  BridgeCallStationSummary,
} from "@/lib/bridge-call/types"
import type { BridgeStationKey } from "@/lib/bridge/stations"
import {
  createSpeechRecognition,
  normalizeVoiceTranscript,
  speechRecognitionSupported,
  speechSynthesisSupported,
  SUBTITLE_CYCLE_MS,
  VOICE_UNDO_DELAY_MS,
} from "@/lib/bridge-chat/voice"
import { ActiveSpeakerMobile } from "@/components/bridge-call/ActiveSpeakerMobile"
import { CallControlsBar } from "@/components/bridge-call/CallControlsBar"
import { OfficerGrid } from "@/components/bridge-call/OfficerGrid"
import { RoundTimelinePanel } from "@/components/bridge-call/RoundTimelinePanel"
import { SubtitleLane, type SubtitleCue } from "@/components/bridge-call/SubtitleLane"

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {}
  }

  return value as Record<string, unknown>
}

function cueTextForResult(roundResult: BridgeCallRoundView["officerResults"][number]): string {
  if (roundResult.summary && roundResult.summary.trim()) {
    return roundResult.summary
  }

  if (roundResult.status === "offline") {
    return "Station offline."
  }

  if (roundResult.status === "failed") {
    return roundResult.error || "No response from station."
  }

  return `${roundResult.callsign} acknowledged.`
}

function normalizeStationKey(value: unknown): BridgeStationKey | null {
  if (
    value === "xo" ||
    value === "ops" ||
    value === "eng" ||
    value === "sec" ||
    value === "med" ||
    value === "cou"
  ) {
    return value
  }

  return null
}

export default function BridgeCallPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const { selectedShipDeploymentId, setSelectedShipDeploymentId } = useShipSelection()

  const [availableShips, setAvailableShips] = useState<BridgeCallShipSummary[]>([])
  const [stations, setStations] = useState<BridgeCallStationSummary[]>([])
  const [rounds, setRounds] = useState<BridgeCallRoundView[]>([])
  const [directive, setDirective] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isDispatching, setIsDispatching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [queue, setQueue] = useState({ active: false, pending: 0 })

  const [connected] = useState(true)
  const [micMuted, setMicMuted] = useState(true)
  const [speakerOn, setSpeakerOn] = useState(true)
  const [subtitlesOn, setSubtitlesOn] = useState(true)
  const [speechSupported, setSpeechSupported] = useState(false)
  const [isHoldingToTalk, setIsHoldingToTalk] = useState(false)
  const [interimVoiceText, setInterimVoiceText] = useState("")
  const [pendingVoiceDirective, setPendingVoiceDirective] = useState<{
    id: string
    text: string
    expiresAt: number
  } | null>(null)

  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([])
  const [speakingStationKey, setSpeakingStationKey] = useState<BridgeStationKey | null>(null)
  const [leadStationKey, setLeadStationKey] = useState<BridgeStationKey | null>(null)
  const [pinnedStationKey, setPinnedStationKey] = useState<BridgeStationKey | null>(null)
  const [isTimelineCollapsed, setIsTimelineCollapsed] = useState(false)
  const [isMobileLayout, setIsMobileLayout] = useState(false)
  const [autoCycleIndex, setAutoCycleIndex] = useState(0)

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const latestTranscriptRef = useRef("")
  const undoTimerRef = useRef<number | null>(null)
  const revealTimerIdsRef = useRef<number[]>([])
  const processedRoundIdsRef = useRef<Set<string>>(new Set())
  const bootstrappedRoundsRef = useRef(false)

  const selectedShip = useMemo(() => {
    if (!selectedShipDeploymentId) {
      return null
    }

    return availableShips.find((ship) => ship.id === selectedShipDeploymentId) || null
  }, [availableShips, selectedShipDeploymentId])

  const mobileCycleOrder = useMemo(() => {
    const preferred: BridgeStationKey[] = ["xo", "ops", "eng", "sec", "med", "cou"]
    const lead = leadStationKey && preferred.includes(leadStationKey)
      ? [leadStationKey, ...preferred.filter((key) => key !== leadStationKey)]
      : preferred

    const available = new Set(stations.map((station) => station.stationKey))
    return lead.filter((stationKey) => available.has(stationKey))
  }, [stations, leadStationKey])

  const activeMobileStationKey = useMemo(() => {
    if (pinnedStationKey) {
      return pinnedStationKey
    }

    if (speakingStationKey) {
      return speakingStationKey
    }

    if (mobileCycleOrder.length === 0) {
      return null
    }

    return mobileCycleOrder[autoCycleIndex % mobileCycleOrder.length]
  }, [autoCycleIndex, mobileCycleOrder, pinnedStationKey, speakingStationKey])

  const addSubtitleCue = useCallback((speaker: string, text: string) => {
    const cue: SubtitleCue = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      speaker,
      text,
      createdAt: Date.now(),
    }

    setSubtitleCues((current) => [...current, cue].slice(-2))
  }, [])

  const speakLeadCue = useCallback(
    (speaker: string, text: string) => {
      if (!speakerOn || !speechSynthesisSupported()) {
        return
      }

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1
      utterance.pitch = 1
      utterance.volume = 1
      utterance.lang = "en-US"

      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(utterance)
      addSubtitleCue(speaker, text)
    },
    [addSubtitleCue, speakerOn],
  )

  const revealRound = useCallback(
    (round: BridgeCallRoundView) => {
      if (processedRoundIdsRef.current.has(round.id)) {
        return
      }

      processedRoundIdsRef.current.add(round.id)
      const lead = normalizeStationKey(round.leadStationKey)
      setLeadStationKey(lead)

      const successful = round.officerResults.filter((result) => result.status === "success")
      const leadResult = successful.find((result) => result.stationKey === lead) || successful[0] || null
      const remainder = successful.filter((result) => result.id !== leadResult?.id)
      const queue = [leadResult, ...remainder].filter(
        (item): item is NonNullable<typeof leadResult> => Boolean(item),
      )

      if (queue.length === 0) {
        if (round.summary) {
          addSubtitleCue("SYSTEM", round.summary)
        }
        return
      }

      revealTimerIdsRef.current.forEach((timerId) => window.clearTimeout(timerId))
      revealTimerIdsRef.current = []

      queue.forEach((result, index) => {
        const timerId = window.setTimeout(() => {
          setSpeakingStationKey(result.stationKey)
          const cueText = cueTextForResult(result)

          if (index === 0) {
            speakLeadCue(result.callsign, cueText)
          } else {
            addSubtitleCue(result.callsign, cueText)
          }

          window.setTimeout(() => {
            setSpeakingStationKey((current) => (current === result.stationKey ? null : current))
          }, 650)
        }, index * SUBTITLE_CYCLE_MS)

        revealTimerIdsRef.current.push(timerId)
      })
    },
    [addSubtitleCue, speakLeadCue],
  )

  const loadRounds = useCallback(async () => {
    if (!session?.user?.id) {
      return
    }

    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedShipDeploymentId) {
        params.set("shipDeploymentId", selectedShipDeploymentId)
      }

      const response = await fetch(`/api/bridge-call/rounds${params.toString() ? `?${params.toString()}` : ""}`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const payload = (await response.json()) as BridgeCallRoundsGetResponse
      const nextShips = Array.isArray(payload.availableShips) ? payload.availableShips : []
      const nextStations = Array.isArray(payload.stations) ? payload.stations : []
      const nextRounds = Array.isArray(payload.rounds) ? payload.rounds : []

      setAvailableShips(nextShips)
      setStations(nextStations)
      setRounds(nextRounds)
      setQueue(payload.queue || { active: false, pending: 0 })

      const resolvedShipId = typeof payload.selectedShipDeploymentId === "string" ? payload.selectedShipDeploymentId : null
      if (resolvedShipId !== selectedShipDeploymentId) {
        setSelectedShipDeploymentId(resolvedShipId)
      }

      if (!bootstrappedRoundsRef.current) {
        processedRoundIdsRef.current = new Set(nextRounds.map((round) => round.id))
        bootstrappedRoundsRef.current = true
      } else {
        const orderedNewRounds = [...nextRounds]
          .filter((round) => !processedRoundIdsRef.current.has(round.id))
          .reverse()

        orderedNewRounds.forEach((round) => revealRound(round))
      }

      setError(null)
    } catch (loadError) {
      console.error("Failed to load bridge call rounds:", loadError)
      setError("Unable to load bridge call state")
    } finally {
      setIsLoading(false)
    }
  }, [revealRound, selectedShipDeploymentId, session?.user?.id, setSelectedShipDeploymentId])

  const dispatchDirective = useCallback(
    async (text: string) => {
      if (!text.trim() || isDispatching) {
        return
      }

      setIsDispatching(true)
      try {
        const response = await fetch("/api/bridge-call/rounds", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            directive: text,
            shipDeploymentId: selectedShipDeploymentId,
            source: "operator",
          }),
        })

        if (!response.ok) {
          const payload = asRecord(await response.json().catch(() => ({})))
          const message = typeof payload.error === "string" ? payload.error : `HTTP ${response.status}`
          throw new Error(message)
        }

        const payload = (await response.json()) as BridgeCallRoundPostResponse
        const nextRound = payload.round

        setRounds((current) => [nextRound, ...current].slice(0, 200))
        setQueue(payload.queue || { active: false, pending: 0 })
        revealRound(nextRound)
        setError(null)
      } catch (dispatchError) {
        console.error("Bridge call dispatch failed:", dispatchError)
        setError(dispatchError instanceof Error ? dispatchError.message : "Unable to dispatch directive")
      } finally {
        setIsDispatching(false)
      }
    },
    [isDispatching, revealRound, selectedShipDeploymentId],
  )

  const commitPendingVoiceDirective = useCallback(() => {
    if (!pendingVoiceDirective) {
      return
    }

    const text = pendingVoiceDirective.text
    setPendingVoiceDirective(null)
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current)
      undoTimerRef.current = null
    }

    void dispatchDirective(text)
  }, [dispatchDirective, pendingVoiceDirective])

  const queueVoiceDirective = useCallback((text: string) => {
    const normalized = normalizeVoiceTranscript(text)
    if (!normalized) {
      return
    }

    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current)
      undoTimerRef.current = null
    }

    const next = {
      id: `${Date.now()}`,
      text: normalized,
      expiresAt: Date.now() + VOICE_UNDO_DELAY_MS,
    }

    setPendingVoiceDirective(next)
    undoTimerRef.current = window.setTimeout(() => {
      setPendingVoiceDirective((current) => {
        if (!current || current.id !== next.id) {
          return current
        }

        void dispatchDirective(current.text)
        return null
      })
      undoTimerRef.current = null
    }, VOICE_UNDO_DELAY_MS)
  }, [dispatchDirective])

  const startHoldToTalk = useCallback(() => {
    if (!speechSupported || micMuted || isHoldingToTalk) {
      return
    }

    const recognition = createSpeechRecognition()
    if (!recognition) {
      return
    }

    latestTranscriptRef.current = ""
    setInterimVoiceText("")
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

      const combined = normalizeVoiceTranscript(`${latestTranscriptRef.current} ${final} ${interim}`)
      const persisted = normalizeVoiceTranscript(`${latestTranscriptRef.current} ${final}`)
      latestTranscriptRef.current = persisted || combined
      setInterimVoiceText(combined)
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
      console.error("Speech recognition failed to start:", error)
      recognitionRef.current = null
      setIsHoldingToTalk(false)
    }
  }, [isHoldingToTalk, micMuted, speechSupported])

  const endHoldToTalk = useCallback(() => {
    if (!isHoldingToTalk) {
      return
    }

    setIsHoldingToTalk(false)
    recognitionRef.current?.stop()

    window.setTimeout(() => {
      const transcript = normalizeVoiceTranscript(latestTranscriptRef.current || interimVoiceText)
      latestTranscriptRef.current = ""
      setInterimVoiceText("")
      queueVoiceDirective(transcript)
    }, 160)
  }, [interimVoiceText, isHoldingToTalk, queueVoiceDirective])

  const handleTypedDispatch = useCallback(
    (event: FormEvent) => {
      event.preventDefault()
      const text = directive.trim()
      if (!text) {
        return
      }

      setDirective("")
      void dispatchDirective(text)
    },
    [directive, dispatchDirective],
  )

  useEffect(() => {
    setSpeechSupported(speechRecognitionSupported())
  }, [])

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1023px)")
    const sync = () => setIsMobileLayout(mediaQuery.matches)
    sync()
    mediaQuery.addEventListener("change", sync)
    return () => mediaQuery.removeEventListener("change", sync)
  }, [])

  useEffect(() => {
    processedRoundIdsRef.current = new Set()
    bootstrappedRoundsRef.current = false
    setLeadStationKey(null)
    setSpeakingStationKey(null)
    setSubtitleCues([])
  }, [selectedShipDeploymentId])

  useEffect(() => {
    if (!isMobileLayout || pinnedStationKey || speakingStationKey || mobileCycleOrder.length <= 1) {
      return
    }

    const interval = window.setInterval(() => {
      setAutoCycleIndex((current) => (current + 1) % mobileCycleOrder.length)
    }, 4200)

    return () => window.clearInterval(interval)
  }, [isMobileLayout, mobileCycleOrder.length, pinnedStationKey, speakingStationKey])

  useEffect(() => {
    void loadRounds()
  }, [loadRounds])

  useEventStream({
    enabled: Boolean(session),
    types: ["bridge-call.round.updated"],
    onEvent: (event) => {
      if (event.type === "bridge-call.round.updated") {
        void loadRounds()
      }
    },
  })

  useEffect(() => {
    return () => {
      revealTimerIdsRef.current.forEach((timerId) => window.clearTimeout(timerId))
      if (undoTimerRef.current) {
        window.clearTimeout(undoTimerRef.current)
      }
      recognitionRef.current?.stop()
    }
  }, [])

  const latestRound = rounds[0] || null

  return (
    <main className="bridge-call-page min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-4 pb-8 pt-5 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-cyan-300/35 bg-slate-950/80 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-200/80">Bridge Call</p>
              <h1 className="mt-1 text-2xl font-semibold">Officer Video Roundtable</h1>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label className="inline-flex items-center gap-2 rounded-full border border-slate-400/35 bg-slate-900/70 px-3 py-1">
                <span className="uppercase tracking-[0.14em] text-slate-300">Hull</span>
                <select
                  value={selectedShipDeploymentId || ""}
                  onChange={(event) => setSelectedShipDeploymentId(event.target.value || null)}
                  className="min-w-[170px] bg-transparent text-xs font-medium text-slate-100 outline-none"
                >
                  {availableShips.length === 0 ? (
                    <option value="">No ships</option>
                  ) : (
                    <>
                      <option value="">Auto-route active hull</option>
                      {availableShips.map((ship) => (
                        <option key={ship.id} value={ship.id}>
                          {ship.name} ({ship.status})
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </label>

              <span className="rounded-full border border-cyan-300/35 bg-cyan-500/12 px-3 py-1">{session?.user?.email || "Operator"}</span>
              <span className="rounded-full border border-slate-400/35 bg-slate-900/70 px-3 py-1">
                Queue {queue.pending} pending
              </span>
              {selectedShip && (
                <span className="rounded-full border border-slate-400/35 bg-slate-900/70 px-3 py-1">{selectedShip.name}</span>
              )}
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-xl border border-rose-400/35 bg-rose-500/12 px-4 py-2 text-sm text-rose-100">{error}</div>
        )}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="space-y-4">
            <CallControlsBar
              connected={connected}
              micMuted={micMuted}
              speakerOn={speakerOn}
              subtitlesOn={subtitlesOn}
              speechSupported={speechSupported}
              isHoldingToTalk={isHoldingToTalk}
              onToggleMic={() => setMicMuted((current) => !current)}
              onToggleSpeaker={() => setSpeakerOn((current) => !current)}
              onToggleSubtitles={() => setSubtitlesOn((current) => !current)}
              onHoldStart={startHoldToTalk}
              onHoldEnd={endHoldToTalk}
              onEndCall={() => router.push("/bridge")}
            />

            {!speechSupported && (
              <div className="rounded-xl border border-amber-300/35 bg-amber-500/12 px-3 py-2 text-sm text-amber-100">
                Speech recognition is not available in this browser. Type directives below.
              </div>
            )}

            <SubtitleLane cues={subtitleCues} enabled={subtitlesOn} />

            {pendingVoiceDirective && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-300/35 bg-cyan-500/12 px-3 py-2">
                <div className="text-sm text-cyan-50">
                  Voice directive queued: <span className="font-medium">{pendingVoiceDirective.text}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-cyan-100">Send in {Math.max(0, Math.ceil((pendingVoiceDirective.expiresAt - Date.now()) / 1000))}s</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (undoTimerRef.current) {
                        window.clearTimeout(undoTimerRef.current)
                        undoTimerRef.current = null
                      }
                      setPendingVoiceDirective(null)
                    }}
                    className="rounded-md border border-cyan-200/40 bg-cyan-500/15 px-2.5 py-1 text-xs font-medium text-cyan-100"
                  >
                    Undo
                  </button>
                  <button
                    type="button"
                    onClick={commitPendingVoiceDirective}
                    className="rounded-md border border-cyan-200/40 bg-cyan-500/20 px-2.5 py-1 text-xs font-medium text-cyan-50"
                  >
                    Send now
                  </button>
                </div>
              </div>
            )}

            <section className="rounded-2xl border border-slate-400/30 bg-slate-950/85 p-3">
              <form onSubmit={handleTypedDispatch} className="space-y-2">
                <textarea
                  value={directive}
                  onChange={(event) => setDirective(event.target.value)}
                  placeholder="Send directive to all active officers…"
                  rows={3}
                  className="w-full resize-none rounded-xl border border-slate-500/35 bg-slate-900/75 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-400 focus:border-cyan-300/50 focus:outline-none"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-slate-300">
                    {isHoldingToTalk ? `Listening: ${interimVoiceText || "…"}` : "Voice mode: hold-to-talk"}
                  </div>
                  <button
                    type="submit"
                    disabled={!directive.trim() || isDispatching}
                    className="inline-flex items-center gap-2 rounded-lg border border-cyan-300/45 bg-cyan-500/15 px-3 py-2 text-sm text-cyan-100 disabled:opacity-60"
                  >
                    {isDispatching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Dispatch Round
                  </button>
                </div>
              </form>
            </section>

            {isMobileLayout ? (
              <ActiveSpeakerMobile
                stations={stations}
                activeStationKey={activeMobileStationKey}
                speakingStationKey={speakingStationKey}
                pinnedStationKey={pinnedStationKey}
                leadStationKey={leadStationKey}
                onPin={setPinnedStationKey}
              />
            ) : (
              <OfficerGrid
                stations={stations}
                speakingStationKey={speakingStationKey}
                leadStationKey={leadStationKey}
                pinnedStationKey={pinnedStationKey}
                onPin={setPinnedStationKey}
              />
            )}
          </section>

          <aside className="space-y-4">
            <RoundTimelinePanel
              rounds={rounds}
              collapsed={isTimelineCollapsed}
              onToggle={() => setIsTimelineCollapsed((current) => !current)}
            />

            <section className="rounded-2xl border border-slate-400/30 bg-slate-950/85 p-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-200/80">Latest Lead</p>
              {latestRound ? (
                <>
                  <p className="mt-1 text-sm text-slate-100">{latestRound.directive}</p>
                  <p className="mt-1 text-xs text-slate-300">{latestRound.summary || "No summary available."}</p>
                  <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-cyan-300/35 bg-cyan-500/12 px-3 py-1 text-xs text-cyan-100">
                    <Volume2 className="h-3.5 w-3.5" />
                    {latestRound.leadStationKey ? latestRound.leadStationKey.toUpperCase() : "No lead"}
                  </div>
                </>
              ) : (
                <p className="mt-1 text-sm text-slate-300">Awaiting first call round.</p>
              )}
            </section>
          </aside>
        </div>

        {isLoading && (
          <div className="inline-flex items-center gap-2 rounded-lg border border-slate-400/35 bg-slate-900/75 px-3 py-2 text-sm text-slate-200">
            <Loader2 className="h-4 w-4 animate-spin" />
            Syncing bridge call state
          </div>
        )}
      </div>
    </main>
  )
}
