"use client"

import { Loader2, PackagePlus, ShieldCheck, Wrench } from "lucide-react"

interface QuartermasterProviderState {
  provider: string | null
  fallbackUsed: boolean | null
}

interface QuartermasterHeaderProps {
  callsign: string
  shipName: string
  enabled: boolean
  authority: string
  diagnosticsScope: string
  providerState: QuartermasterProviderState
  onOpenToolRequest: () => void
  isToolRequestOptionsLoading: boolean
  showToolRequestAction: boolean
}

export function QuartermasterHeader(props: QuartermasterHeaderProps) {
  const {
    callsign,
    shipName,
    enabled,
    authority,
    diagnosticsScope,
    providerState,
    onOpenToolRequest,
    isToolRequestOptionsLoading,
    showToolRequestAction,
  } = props

  return (
    <div className="rounded-xl border border-slate-300/70 bg-white/80 p-3 dark:border-white/12 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Fleet Quartermaster</p>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{callsign} · Fleet</h3>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">Ship context: {shipName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-md border px-2 py-1 ${
            enabled
              ? "border-emerald-400/45 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
              : "border-amber-400/45 bg-amber-500/10 text-amber-700 dark:text-amber-200"
          }`}>
            {enabled ? "Enabled" : "Manual Enable"}
          </span>
          {providerState.provider && (
            <span className="rounded-md border border-cyan-400/45 bg-cyan-500/10 px-2 py-1 text-cyan-700 dark:text-cyan-200">
              Provider: {providerState.provider}
            </span>
          )}
          {providerState.fallbackUsed === true && (
            <span className="rounded-md border border-orange-400/45 bg-orange-500/10 px-2 py-1 text-orange-700 dark:text-orange-200">
              Fallback
            </span>
          )}
          {showToolRequestAction && (
            <button
              type="button"
              onClick={onOpenToolRequest}
              disabled={isToolRequestOptionsLoading}
              className="inline-flex items-center gap-1 rounded-md border border-cyan-500/45 bg-cyan-500/10 px-2 py-1 text-cyan-700 disabled:opacity-50 dark:border-cyan-300/45 dark:text-cyan-200"
            >
              {isToolRequestOptionsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackagePlus className="h-3.5 w-3.5" />}
              File Tool Request
            </button>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
        <span className="inline-flex items-center gap-1 rounded-md border border-slate-300/70 px-2 py-1 dark:border-white/12">
          <ShieldCheck className="h-3 w-3" />
          {authority}
        </span>
        <span className="inline-flex items-center gap-1 rounded-md border border-slate-300/70 px-2 py-1 dark:border-white/12">
          <Wrench className="h-3 w-3" />
          {diagnosticsScope}
        </span>
      </div>
    </div>
  )
}
