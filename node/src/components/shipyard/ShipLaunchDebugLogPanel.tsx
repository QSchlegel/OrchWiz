"use client"

import { useEffect, useMemo, useRef } from "react"
import { ChevronDown, ChevronUp, Copy, Trash2, ArrowDownToLine } from "lucide-react"

export type LaunchLogLine = {
  key: string
  timestamp: string
  level: "debug" | "info" | "warn" | "error"
  source: string
  stream?: "stdout" | "stderr"
  text: string
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return "--:--:--"
  }
  return date.toLocaleTimeString(undefined, { hour12: false })
}

function lineTone(line: LaunchLogLine): string {
  if (line.level === "error" || line.stream === "stderr") {
    return "text-rose-700 dark:text-rose-300"
  }
  if (line.level === "warn") {
    return "text-amber-800 dark:text-amber-200"
  }
  if (line.level === "info") {
    return "text-slate-700 dark:text-slate-200"
  }
  return "text-slate-600 dark:text-slate-300"
}

export function ShipLaunchDebugLogPanel(props: {
  open: boolean
  onToggleOpen: () => void
  lines: LaunchLogLine[]
  autoScroll: boolean
  onToggleAutoScroll: () => void
  onCopy: () => void
  onClear: () => void
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const hasLines = props.lines.length > 0
  const lineCountLabel = useMemo(() => {
    const count = props.lines.filter((line) => line.key !== "launch-log-truncated").length
    return count.toLocaleString()
  }, [props.lines])

  useEffect(() => {
    if (!props.open) {
      return
    }
    if (!props.autoScroll) {
      return
    }
    const node = scrollRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [props.autoScroll, props.lines.length, props.open])

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/70 shadow-sm backdrop-blur dark:border-white/12 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200/60 bg-white/50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.02]">
        <button
          type="button"
          onClick={props.onToggleOpen}
          className="group inline-flex min-w-0 flex-1 items-center gap-2 text-left text-xs font-semibold text-slate-800 dark:text-slate-100"
          aria-expanded={props.open}
        >
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-slate-300/60 bg-white/70 text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-200">
            <ArrowDownToLine className="h-3.5 w-3.5" />
          </span>
          <span className="truncate">Debug Log</span>
          <span className="shrink-0 rounded-full border border-slate-300/60 bg-white/70 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-300">
            {lineCountLabel}
          </span>
          <span className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-lg border border-transparent text-slate-500 transition-colors group-hover:border-slate-300/60 group-hover:bg-white/60 dark:text-slate-300 dark:group-hover:border-white/10 dark:group-hover:bg-white/[0.05]">
            {props.open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={props.onToggleAutoScroll}
            aria-pressed={props.autoScroll}
            className={`rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors ${
              props.autoScroll
                ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 hover:bg-cyan-500/15 dark:text-cyan-200"
                : "border-slate-300/60 bg-white/60 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.06]"
            }`}
            title="Auto-scroll follows the latest lines unless you scroll up."
          >
            Auto-scroll
          </button>

          <button
            type="button"
            onClick={props.onCopy}
            disabled={!hasLines}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300/60 bg-white/60 px-2 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.06]"
            title="Copy log lines to clipboard"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy
          </button>

          <button
            type="button"
            onClick={props.onClear}
            disabled={!hasLines}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/25 bg-rose-500/10 px-2 py-1 text-[11px] font-medium text-rose-700 transition-colors hover:bg-rose-500/15 disabled:opacity-40 dark:text-rose-200"
            title="Clear the debug log window"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </button>
        </div>
      </div>

      {props.open ? (
        <div
          ref={scrollRef}
          onScroll={() => {
            const node = scrollRef.current
            if (!node) return
            const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight
            if (props.autoScroll && distanceFromBottom > 48) {
              props.onToggleAutoScroll()
            }
          }}
          className="max-h-[340px] overflow-auto px-3 py-2 font-mono text-[11px] leading-[1.55] text-slate-700 dark:text-slate-200"
          style={{
            background:
              "repeating-linear-gradient(135deg, rgba(15,23,42,0.03), rgba(15,23,42,0.03) 10px, rgba(15,23,42,0.0) 10px, rgba(15,23,42,0.0) 20px)",
          }}
        >
          {props.lines.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
              No logs yet.
            </p>
          ) : (
            <div className="space-y-1">
              {props.lines.map((line) => (
                <div key={line.key} className={`flex gap-2 ${lineTone(line)}`}>
                  <span className="w-[72px] shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                    {formatTime(line.timestamp)}
                  </span>
                  <span className="w-[120px] shrink-0 truncate text-slate-500 dark:text-slate-400">
                    {line.source}
                    {line.stream ? `/${line.stream}` : ""}
                  </span>
                  <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                    {line.text}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

