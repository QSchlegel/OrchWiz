"use client"

import { useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import type { EdgeType, TopologyComponent } from "@/lib/uss-k8s/topology"

interface EdgeCreatorModalProps {
  source: TopologyComponent
  target: TopologyComponent
  onConfirm: (edgeType: EdgeType, label?: string, animated?: boolean) => void
  onCancel: () => void
}

const edgeTypes: { value: EdgeType; label: string; color: string }[] = [
  { value: "control", label: "Control", color: "border-cyan-500/45 bg-cyan-500/12 text-cyan-700 dark:border-cyan-300/45 dark:text-cyan-100" },
  { value: "data", label: "Data", color: "border-slate-400/45 bg-slate-500/12 text-slate-700 dark:border-slate-300/45 dark:text-slate-100" },
  { value: "telemetry", label: "Telemetry", color: "border-violet-500/45 bg-violet-500/12 text-violet-700 dark:border-violet-300/45 dark:text-violet-100" },
  { value: "alert", label: "Alert", color: "border-rose-500/45 bg-rose-500/12 text-rose-700 dark:border-rose-300/45 dark:text-rose-100" },
]

export function EdgeCreatorModal({ source, target, onConfirm, onCancel }: EdgeCreatorModalProps) {
  const [edgeType, setEdgeType] = useState<EdgeType>("control")
  const [label, setLabel] = useState("")
  const [animated, setAnimated] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel()
      if (e.key === "Enter") onConfirm(edgeType, label || undefined, animated)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [edgeType, label, animated, onCancel, onConfirm])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div
        ref={panelRef}
        className="mx-4 w-full max-w-sm rounded-xl border border-slate-300/75 bg-white/95 p-5 shadow-[0_16px_48px_rgba(15,23,42,0.2)] backdrop-blur-xl dark:border-white/12 dark:bg-slate-950/92"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[15px] font-semibold text-slate-900 dark:text-slate-50">
            Create Connection
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-6 w-6 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-white/[0.08] dark:hover:text-slate-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2 text-[12px]">
          <span className="truncate rounded-md border border-slate-300/70 bg-slate-100/80 px-2 py-1 font-[family-name:var(--font-mono)] font-medium text-slate-800 dark:border-white/12 dark:bg-white/[0.06] dark:text-slate-200">
            {source.label}
          </span>
          <span className="text-slate-400">→</span>
          <span className="truncate rounded-md border border-slate-300/70 bg-slate-100/80 px-2 py-1 font-[family-name:var(--font-mono)] font-medium text-slate-800 dark:border-white/12 dark:bg-white/[0.06] dark:text-slate-200">
            {target.label}
          </span>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <span className="readout text-slate-700 dark:text-slate-300">Edge Type</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {edgeTypes.map((et) => (
                <button
                  key={et.value}
                  type="button"
                  onClick={() => setEdgeType(et.value)}
                  className={`rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 ${
                    edgeType === et.value
                      ? et.color
                      : "border-slate-300/60 text-slate-600 hover:border-slate-400 dark:border-white/10 dark:text-slate-400 dark:hover:border-white/25"
                  }`}
                >
                  {et.label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1.5 text-[11px] text-slate-700 dark:text-slate-300">
            <span className="readout">Label (optional)</span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., tool calls, metrics..."
              className="rounded-md border border-slate-300/70 bg-white/85 px-2.5 py-2 text-[12px] text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:border-white/12 dark:bg-slate-950/70 dark:text-slate-100 dark:focus-visible:ring-cyan-400/60"
            />
          </label>

          <label className="flex items-center gap-2 text-[12px] text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={animated}
              onChange={(e) => setAnimated(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500/60"
            />
            Animated flow
          </label>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="readout rounded-md border border-slate-300/70 bg-white/70 px-3 py-1.5 text-slate-700 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60 dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(edgeType, label || undefined, animated)}
            className="readout rounded-md border border-cyan-500/45 bg-cyan-500/12 px-3 py-1.5 text-cyan-700 transition-colors hover:bg-cyan-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:border-cyan-300/45 dark:text-cyan-100 dark:focus-visible:ring-cyan-400/60"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
