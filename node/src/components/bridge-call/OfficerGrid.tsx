"use client"

import type { BridgeStationKey } from "@/lib/bridge/stations"
import type { BridgeCallStationSummary } from "@/lib/bridge-call/types"

interface OfficerGridProps {
  stations: BridgeCallStationSummary[]
  speakingStationKey: BridgeStationKey | null
  leadStationKey: BridgeStationKey | null
  pinnedStationKey: BridgeStationKey | null
  onPin: (stationKey: BridgeStationKey | null) => void
}

const ACCENT_BY_STATION: Record<BridgeStationKey, string> = {
  xo: "from-cyan-400/55 to-blue-500/35",
  ops: "from-sky-400/50 to-cyan-500/30",
  eng: "from-amber-400/55 to-orange-500/35",
  sec: "from-rose-400/55 to-pink-500/35",
  med: "from-emerald-400/55 to-teal-500/35",
  cou: "from-lime-400/55 to-green-500/35",
}

function statusClass(status: BridgeCallStationSummary["status"]): string {
  switch (status) {
    case "online":
      return "border-emerald-300/40 bg-emerald-500/10 text-emerald-100"
    case "busy":
      return "border-amber-300/40 bg-amber-500/10 text-amber-100"
    case "offline":
      return "border-slate-400/30 bg-slate-500/10 text-slate-300"
    default:
      return "border-slate-300/30 bg-slate-500/10 text-slate-100"
  }
}

function TileWave({ active }: { active: boolean }) {
  return (
    <div className="absolute bottom-3 right-3 flex h-3 items-end gap-1" aria-hidden>
      {[0, 1, 2, 3].map((bar) => (
        <span
          // eslint-disable-next-line react/no-array-index-key
          key={bar}
          className={`w-0.5 rounded-full bg-cyan-200/85 transition-all ${active ? "animate-pulse" : "h-1"}`}
          style={{
            height: active ? `${8 + ((bar + 1) % 3) * 4}px` : "4px",
            animationDelay: `${bar * 90}ms`,
          }}
        />
      ))}
    </div>
  )
}

export function OfficerGrid({
  stations,
  speakingStationKey,
  leadStationKey,
  pinnedStationKey,
  onPin,
}: OfficerGridProps) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {stations.map((station) => {
        const speaking = speakingStationKey === station.stationKey && station.status !== "offline"
        const pinned = pinnedStationKey === station.stationKey
        const lead = leadStationKey === station.stationKey

        return (
          <button
            key={station.stationKey}
            type="button"
            onClick={() => onPin(pinned ? null : station.stationKey)}
            className={`group relative h-[170px] overflow-hidden rounded-2xl border text-left transition ${
              station.status === "offline"
                ? "border-slate-500/35 bg-slate-900/70"
                : "border-cyan-300/35 bg-slate-950/75 hover:border-cyan-200/60"
            } ${speaking ? "ring-2 ring-cyan-300/65" : "ring-0"}`}
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${ACCENT_BY_STATION[station.stationKey]} opacity-70`} />
            <div className="absolute inset-0 bridge-call-video-noise" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.22),transparent_36%)]" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/45 to-slate-900/30" />

            {station.status === "offline" && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/70">
                <span className="rounded-full border border-slate-300/30 bg-slate-800/70 px-3 py-1 text-xs uppercase tracking-[0.16em] text-slate-300">
                  Offline
                </span>
              </div>
            )}

            <div className="relative z-20 flex h-full flex-col justify-between p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-100/80">{station.role}</p>
                  <p className="mt-1 text-lg font-semibold text-white">{station.callsign}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${statusClass(station.status)}`}>
                    {station.status}
                  </span>
                  {lead && (
                    <span className="rounded-full border border-indigo-300/40 bg-indigo-500/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-indigo-100">
                      Lead
                    </span>
                  )}
                  {pinned && (
                    <span className="rounded-full border border-cyan-300/45 bg-cyan-500/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-cyan-100">
                      Pinned
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <p className="line-clamp-2 text-xs text-slate-100/90">{station.focus}</p>
                <div className="h-1.5 rounded-full bg-slate-100/20">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-blue-300"
                    style={{ width: `${Math.max(0, Math.min(100, station.load))}%` }}
                  />
                </div>
              </div>
            </div>

            <div
              className={`pointer-events-none absolute inset-0 rounded-2xl border border-cyan-300/0 transition ${
                speaking ? "border-cyan-200/80" : "group-hover:border-cyan-200/35"
              }`}
            />
            <TileWave active={speaking} />
          </button>
        )
      })}
    </div>
  )
}
