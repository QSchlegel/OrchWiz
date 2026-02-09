"use client"

import type { BridgeCallRoundView } from "@/lib/bridge-call/types"

interface RoundTimelinePanelProps {
  rounds: BridgeCallRoundView[]
  collapsed: boolean
  onToggle: () => void
}

function statusClass(status: BridgeCallRoundView["status"]): string {
  switch (status) {
    case "completed":
      return "border-emerald-300/35 bg-emerald-500/10 text-emerald-100"
    case "partial":
      return "border-amber-300/40 bg-amber-500/10 text-amber-100"
    case "failed":
      return "border-rose-300/40 bg-rose-500/10 text-rose-100"
    default:
      return "border-slate-400/35 bg-slate-500/10 text-slate-200"
  }
}

function officerStatusClass(status: string): string {
  switch (status) {
    case "success":
      return "text-emerald-100"
    case "failed":
      return "text-rose-100"
    case "offline":
      return "text-slate-300"
    default:
      return "text-slate-200"
  }
}

export function RoundTimelinePanel({ rounds, collapsed, onToggle }: RoundTimelinePanelProps) {
  return (
    <section className="rounded-2xl border border-slate-400/30 bg-slate-950/85">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 border-b border-slate-400/20 px-3 py-2 text-left"
      >
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-200/80">Round Timeline</p>
          <p className="text-sm text-slate-200">Unified officer rounds</p>
        </div>
        <span className="rounded-full border border-slate-400/35 bg-slate-800/70 px-2 py-0.5 text-xs text-slate-200">
          {collapsed ? "Show" : "Hide"}
        </span>
      </button>

      {!collapsed && (
        <div className="max-h-[440px] space-y-2 overflow-y-auto p-3">
          {rounds.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-500/35 px-3 py-4 text-sm text-slate-300">
              No completed rounds yet.
            </div>
          )}

          {rounds.map((round) => (
            <article key={round.id} className="rounded-xl border border-slate-500/35 bg-slate-900/70 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${statusClass(round.status)}`}>
                  {round.status}
                </span>
                <span className="text-xs text-slate-300">{new Date(round.createdAt).toLocaleTimeString()}</span>
              </div>

              <p className="mt-2 text-sm text-slate-100">{round.directive}</p>
              {round.summary && <p className="mt-1 text-xs text-slate-300">{round.summary}</p>}

              <div className="mt-2 flex flex-wrap gap-1.5">
                {round.officerResults.map((result) => (
                  <span
                    key={result.id}
                    className={`rounded-full border border-slate-500/30 bg-slate-800/80 px-2 py-0.5 text-[10px] uppercase ${officerStatusClass(result.status)}`}
                  >
                    {result.callsign} {result.status}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
