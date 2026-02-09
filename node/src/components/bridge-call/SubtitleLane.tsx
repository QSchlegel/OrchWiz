"use client"

import { useEffect, useMemo, useState } from "react"
import { SUBTITLE_FADE_MS } from "@/lib/bridge-chat/voice"

export interface SubtitleCue {
  id: string
  speaker: string
  text: string
  createdAt: number
}

interface SubtitleLaneProps {
  cues: SubtitleCue[]
  enabled: boolean
}

function opacityForCue(cue: SubtitleCue, now: number): number {
  const elapsed = now - cue.createdAt
  if (elapsed >= SUBTITLE_FADE_MS) {
    return 0
  }

  const progress = elapsed / SUBTITLE_FADE_MS
  return Math.max(0, 1 - progress)
}

export function SubtitleLane({ cues, enabled }: SubtitleLaneProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now())
    }, 250)

    return () => window.clearInterval(interval)
  }, [])

  const visibleCues = useMemo(() => {
    if (!enabled) {
      return []
    }

    return cues
      .slice(-2)
      .filter((cue) => opacityForCue(cue, now) > 0.01)
      .map((cue) => ({
        cue,
        opacity: opacityForCue(cue, now),
      }))
  }, [cues, enabled, now])

  if (!enabled) {
    return (
      <div className="rounded-xl border border-slate-500/30 bg-slate-900/70 px-3 py-2 text-xs uppercase tracking-[0.16em] text-slate-300">
        Subtitles hidden
      </div>
    )
  }

  return (
    <div className="space-y-1.5 rounded-xl border border-cyan-300/30 bg-slate-950/75 px-3 py-2 backdrop-blur-sm">
      {visibleCues.length === 0 && (
        <p className="text-sm text-slate-300">Awaiting officer response…</p>
      )}

      {visibleCues.map(({ cue, opacity }) => (
        <p
          key={cue.id}
          className="text-sm text-slate-100 transition-opacity"
          style={{ opacity }}
        >
          <span className="mr-2 text-xs uppercase tracking-[0.14em] text-cyan-200">[{cue.speaker}]</span>
          {cue.text}
        </p>
      ))}
    </div>
  )
}
