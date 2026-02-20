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

type PodOverviewSnapshot = {
  capturedAt: string
  context: string
  total: number
  phases: {
    running: number
    pending: number
    succeeded: number
    failed: number
    unknown: number
  }
  namespaces: Array<{
    name: string
    total: number
    running: number
    pending: number
    succeeded: number
    failed: number
    unknown: number
    waiting: number
    crashing: number
  }>
  topWaitingReasons: Array<{
    reason: string
    count: number
  }>
}

const POD_OVERVIEW_LOG_PREFIX = "[pods-overview] "

function asNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, value)
}

function parsePodOverviewSnapshot(line: string): PodOverviewSnapshot | null {
  if (!line.startsWith(POD_OVERVIEW_LOG_PREFIX)) {
    return null
  }
  const payload = line.slice(POD_OVERVIEW_LOG_PREFIX.length).trim()
  if (!payload) {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null
  }

  const obj = parsed as Record<string, unknown>
  const phases = obj.phases
  const namespacesRaw = Array.isArray(obj.namespaces) ? obj.namespaces : []
  const topWaitingReasonsRaw = Array.isArray(obj.topWaitingReasons) ? obj.topWaitingReasons : []

  const normalizedNamespaces = namespacesRaw
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null
      }
      const ns = entry as Record<string, unknown>
      return {
        name: typeof ns.name === "string" && ns.name.trim().length > 0 ? ns.name : "unknown",
        total: asNumber(ns.total),
        running: asNumber(ns.running),
        pending: asNumber(ns.pending),
        succeeded: asNumber(ns.succeeded),
        failed: asNumber(ns.failed),
        unknown: asNumber(ns.unknown),
        waiting: asNumber(ns.waiting),
        crashing: asNumber(ns.crashing),
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

  const phasesRecord =
    phases && typeof phases === "object" && !Array.isArray(phases)
      ? (phases as Record<string, unknown>)
      : {}
  const normalizedTopWaitingReasons = topWaitingReasonsRaw
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null
      }
      const reasonRecord = entry as Record<string, unknown>
      return {
        reason:
          typeof reasonRecord.reason === "string" && reasonRecord.reason.trim().length > 0
            ? reasonRecord.reason
            : "Unknown",
        count: asNumber(reasonRecord.count),
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .filter((entry) => entry.count > 0)

  return {
    capturedAt: typeof obj.capturedAt === "string" && obj.capturedAt.length > 0 ? obj.capturedAt : "",
    context: typeof obj.context === "string" && obj.context.length > 0 ? obj.context : "current",
    total: asNumber(obj.total),
    phases: {
      running: asNumber(phasesRecord.running),
      pending: asNumber(phasesRecord.pending),
      succeeded: asNumber(phasesRecord.succeeded),
      failed: asNumber(phasesRecord.failed),
      unknown: asNumber(phasesRecord.unknown),
    },
    namespaces: normalizedNamespaces,
    topWaitingReasons: normalizedTopWaitingReasons,
  }
}

function isPodOverviewLogLine(text: string): boolean {
  return text.startsWith(POD_OVERVIEW_LOG_PREFIX)
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

  const visibleLines = useMemo(
    () => props.lines.filter((line) => !isPodOverviewLogLine(line.text)),
    [props.lines],
  )
  const hasLines = props.lines.length > 0
  const lineCountLabel = useMemo(() => {
    const count = visibleLines.filter((line) => line.key !== "launch-log-truncated").length
    return count.toLocaleString()
  }, [visibleLines])
  const latestPodOverview = useMemo(() => {
    for (let index = props.lines.length - 1; index >= 0; index -= 1) {
      const parsed = parsePodOverviewSnapshot(props.lines[index]?.text || "")
      if (parsed) {
        return parsed
      }
    }
    return null
  }, [props.lines])
  const phaseCards = useMemo(
    () => (
      latestPodOverview
        ? [
            { label: "Running", value: latestPodOverview.phases.running, cls: "text-emerald-700 dark:text-emerald-300" },
            { label: "Pending", value: latestPodOverview.phases.pending, cls: "text-amber-700 dark:text-amber-300" },
            { label: "Failed", value: latestPodOverview.phases.failed, cls: "text-rose-700 dark:text-rose-300" },
            { label: "Succeeded", value: latestPodOverview.phases.succeeded, cls: "text-cyan-700 dark:text-cyan-300" },
            { label: "Unknown", value: latestPodOverview.phases.unknown, cls: "text-slate-600 dark:text-slate-300" },
          ]
        : []
    ),
    [latestPodOverview],
  )

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
      {latestPodOverview ? (
        <div className="border-b border-cyan-500/20 bg-cyan-500/10 px-3 py-2 font-sans text-[11px] text-slate-700 dark:text-slate-200">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-cyan-500/30 px-1.5 py-0.5 font-semibold text-cyan-700 dark:text-cyan-300">
              Pods Overview
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              context={latestPodOverview.context}
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              captured={formatTime(latestPodOverview.capturedAt)}
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              total={latestPodOverview.total}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {phaseCards.map((phase) => (
              <span
                key={phase.label}
                className={`rounded-md border border-slate-300/60 bg-white/70 px-1.5 py-0.5 text-[10px] dark:border-white/10 dark:bg-white/[0.04] ${phase.cls}`}
              >
                {phase.label}: {phase.value}
              </span>
            ))}
          </div>
          {latestPodOverview.topWaitingReasons.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-1 text-[10px]">
              <span className="text-slate-500 dark:text-slate-400">Reasons:</span>
              {latestPodOverview.topWaitingReasons.slice(0, 4).map((reason) => (
                <span
                  key={reason.reason}
                  className="rounded-md border border-slate-300/60 bg-white/70 px-1.5 py-0.5 text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300"
                >
                  {reason.reason} {reason.count}
                </span>
              ))}
            </div>
          ) : null}

          {latestPodOverview.namespaces.length > 0 ? (
            <div className="mt-2 space-y-1">
              {latestPodOverview.namespaces.slice(0, 6).map((namespace) => (
                <div key={namespace.name} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]">
                  <span className="w-[122px] truncate font-semibold text-slate-700 dark:text-slate-200">{namespace.name}</span>
                  <span className="text-emerald-700 dark:text-emerald-300">R {namespace.running}</span>
                  <span className="text-amber-700 dark:text-amber-300">P {namespace.pending}</span>
                  <span className="text-rose-700 dark:text-rose-300">F {namespace.failed}</span>
                  <span className="text-cyan-700 dark:text-cyan-300">S {namespace.succeeded}</span>
                  {namespace.waiting > 0 ? (
                    <span className="text-slate-600 dark:text-slate-300">W {namespace.waiting}</span>
                  ) : null}
                  {namespace.crashing > 0 ? (
                    <span className="font-semibold text-rose-700 dark:text-rose-300">Crash {namespace.crashing}</span>
                  ) : null}
                  <span className="text-slate-500 dark:text-slate-400">T {namespace.total}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

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
          {visibleLines.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
              No logs yet.
            </p>
          ) : (
            <div className="space-y-1">
              {visibleLines.map((line) => (
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
