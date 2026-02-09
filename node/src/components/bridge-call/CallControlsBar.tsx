"use client"

import { Mic, MicOff, Radio, Subtitles, Volume2, VolumeX } from "lucide-react"

interface CallControlsBarProps {
  connected: boolean
  micMuted: boolean
  speakerOn: boolean
  subtitlesOn: boolean
  speechSupported: boolean
  isHoldingToTalk: boolean
  onToggleMic: () => void
  onToggleSpeaker: () => void
  onToggleSubtitles: () => void
  onHoldStart: () => void
  onHoldEnd: () => void
  onEndCall: () => void
}

function ToggleButton({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  title: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
        active
          ? "border-cyan-300/60 bg-cyan-500/20 text-cyan-100"
          : "border-slate-500/35 bg-slate-900/75 text-slate-200"
      }`}
    >
      {children}
    </button>
  )
}

export function CallControlsBar({
  connected,
  micMuted,
  speakerOn,
  subtitlesOn,
  speechSupported,
  isHoldingToTalk,
  onToggleMic,
  onToggleSpeaker,
  onToggleSubtitles,
  onHoldStart,
  onHoldEnd,
  onEndCall,
}: CallControlsBarProps) {
  return (
    <section className="rounded-2xl border border-slate-400/30 bg-slate-950/85 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/35 bg-emerald-500/12 px-3 py-1 text-xs uppercase tracking-[0.16em] text-emerald-100">
          <Radio className="h-3.5 w-3.5" />
          {connected ? "Connected" : "Connecting"}
        </div>
        <button
          type="button"
          onClick={onEndCall}
          className="rounded-full border border-rose-300/45 bg-rose-500/12 px-3 py-1 text-xs uppercase tracking-[0.16em] text-rose-100"
        >
          End Call
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ToggleButton active={!micMuted} onClick={onToggleMic} title="Toggle microphone">
          {micMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          Mic {micMuted ? "Off" : "On"}
        </ToggleButton>

        <ToggleButton active={speakerOn} onClick={onToggleSpeaker} title="Toggle speaker">
          {speakerOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          Speaker {speakerOn ? "On" : "Off"}
        </ToggleButton>

        <ToggleButton active={subtitlesOn} onClick={onToggleSubtitles} title="Toggle subtitles">
          <Subtitles className="h-4 w-4" />
          Subtitles
        </ToggleButton>

        <button
          type="button"
          onMouseDown={onHoldStart}
          onMouseUp={onHoldEnd}
          onMouseLeave={onHoldEnd}
          onTouchStart={onHoldStart}
          onTouchEnd={onHoldEnd}
          disabled={!speechSupported || micMuted}
          className={`inline-flex min-h-[42px] items-center gap-2 rounded-lg border px-4 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${
            isHoldingToTalk
              ? "border-cyan-200/80 bg-cyan-500/28 text-cyan-50"
              : "border-cyan-300/45 bg-cyan-500/12 text-cyan-100"
          }`}
        >
          <Mic className="h-4 w-4" />
          Hold to Talk
        </button>
      </div>
    </section>
  )
}
