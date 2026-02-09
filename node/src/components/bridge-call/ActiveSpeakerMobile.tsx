"use client"

import type { BridgeStationKey } from "@/lib/bridge/stations"
import type { BridgeCallStationSummary } from "@/lib/bridge-call/types"

interface ActiveSpeakerMobileProps {
  stations: BridgeCallStationSummary[]
  activeStationKey: BridgeStationKey | null
  speakingStationKey: BridgeStationKey | null
  pinnedStationKey: BridgeStationKey | null
  leadStationKey: BridgeStationKey | null
  onPin: (stationKey: BridgeStationKey | null) => void
}

function accentFromStation(stationKey: BridgeStationKey): string {
  switch (stationKey) {
    case "xo":
      return "from-cyan-400/55 to-blue-500/35"
    case "ops":
      return "from-sky-400/55 to-cyan-500/35"
    case "eng":
      return "from-amber-400/55 to-orange-500/35"
    case "sec":
      return "from-rose-400/55 to-pink-500/35"
    case "med":
      return "from-emerald-400/55 to-teal-500/35"
    case "cou":
      return "from-lime-400/55 to-green-500/35"
    default:
      return "from-cyan-400/55 to-blue-500/35"
  }
}

export function ActiveSpeakerMobile({
  stations,
  activeStationKey,
  speakingStationKey,
  pinnedStationKey,
  leadStationKey,
  onPin,
}: ActiveSpeakerMobileProps) {
  const activeStation = stations.find((station) => station.stationKey === activeStationKey) || stations[0] || null

  if (!activeStation) {
    return null
  }

  const speaking = speakingStationKey === activeStation.stationKey && activeStation.status !== "offline"

  return (
    <div className="space-y-3 lg:hidden">
      <article className={`relative h-[280px] overflow-hidden rounded-2xl border border-cyan-300/35 bg-slate-950/80 ${speaking ? "ring-2 ring-cyan-300/70" : "ring-0"}`}>
        <div className={`absolute inset-0 bg-gradient-to-br ${accentFromStation(activeStation.stationKey)} opacity-80`} />
        <div className="absolute inset-0 bridge-call-video-noise" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/55 to-transparent" />

        {activeStation.status === "offline" && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/72">
            <span className="rounded-full border border-slate-400/30 bg-slate-800/70 px-4 py-1 text-sm uppercase tracking-[0.16em] text-slate-200">
              Offline
            </span>
          </div>
        )}

        <div className="relative z-30 flex h-full flex-col justify-between p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-100/90">Active Speaker</p>
              <h2 className="mt-1 text-2xl font-semibold text-white">{activeStation.callsign}</h2>
              <p className="text-xs uppercase tracking-[0.14em] text-cyan-100/80">{activeStation.role}</p>
            </div>
            <div className="flex items-center gap-1">
              {leadStationKey === activeStation.stationKey && (
                <span className="rounded-full border border-indigo-300/45 bg-indigo-500/15 px-2 py-0.5 text-[10px] uppercase text-indigo-100">Lead</span>
              )}
              {pinnedStationKey === activeStation.stationKey && (
                <span className="rounded-full border border-cyan-300/45 bg-cyan-500/15 px-2 py-0.5 text-[10px] uppercase text-cyan-100">Pinned</span>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-slate-100/95">{activeStation.focus}</p>
            <div className="h-2 rounded-full bg-slate-100/20">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-blue-300"
                style={{ width: `${Math.max(0, Math.min(100, activeStation.load))}%` }}
              />
            </div>
          </div>
        </div>
      </article>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {stations.map((station) => {
          const pinned = pinnedStationKey === station.stationKey
          const selected = activeStation.stationKey === station.stationKey
          return (
            <button
              key={station.stationKey}
              type="button"
              onClick={() => onPin(pinned ? null : station.stationKey)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.14em] ${
                selected
                  ? "border-cyan-200/65 bg-cyan-500/20 text-cyan-100"
                  : "border-slate-500/35 bg-slate-900/75 text-slate-200"
              } ${pinned ? "ring-1 ring-cyan-300/65" : "ring-0"}`}
            >
              {station.callsign}
            </button>
          )
        })}
      </div>
    </div>
  )
}
