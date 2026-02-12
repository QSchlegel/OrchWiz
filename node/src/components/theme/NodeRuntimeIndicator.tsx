"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type NodeRuntimeStatus = "healthy" | "elevated" | "degraded"

interface NodeRuntimeMetricsPayload {
  capturedAt: string
  status: NodeRuntimeStatus
  signals: {
    cpuPercent: number
    heapPressurePercent: number
    eventLoopLagP95Ms: number
    rssBytes: number
    heapUsedBytes: number
    heapTotalBytes: number
    uptimeSec: number
  }
}

const POLL_INTERVAL_MS = 5_000
const MAX_HISTORY_POINTS = 60
const CHART_WIDTH = 296
const CHART_HEIGHT = 96
const CHART_PADDING = 10

interface RuntimeHistoryPoint {
  capturedAt: string
  rssBytes: number
  cpuPercent: number
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B"

  const units = ["B", "KB", "MB", "GB", "TB"]
  let size = value
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  const digits = size >= 100 ? 0 : size >= 10 ? 1 : 2
  return `${size.toFixed(digits)} ${units[unitIndex]}`
}

function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0m"
  const rounded = Math.floor(seconds)
  const days = Math.floor(rounded / 86_400)
  const hours = Math.floor((rounded % 86_400) / 3_600)
  const minutes = Math.floor((rounded % 3_600) / 60)

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function statusStyles(status: NodeRuntimeStatus | null): { chip: string; dot: string } {
  if (status === "healthy") {
    return {
      chip: "border-emerald-400/45 bg-emerald-500/10 text-emerald-700 dark:border-emerald-300/40 dark:text-emerald-200",
      dot: "bg-emerald-500 dark:bg-emerald-300",
    }
  }

  if (status === "elevated") {
    return {
      chip: "border-amber-400/45 bg-amber-500/10 text-amber-700 dark:border-amber-300/45 dark:text-amber-200",
      dot: "bg-amber-500 dark:bg-amber-300",
    }
  }

  if (status === "degraded") {
    return {
      chip: "border-rose-400/45 bg-rose-500/10 text-rose-700 dark:border-rose-300/45 dark:text-rose-200",
      dot: "bg-rose-500 dark:bg-rose-300",
    }
  }

  return {
    chip: "border-slate-300/70 bg-white/75 text-slate-700 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-300",
    dot: "bg-slate-400 dark:bg-slate-500",
  }
}

function buildLinePath(values: number[], width: number, height: number, padding = CHART_PADDING): string {
  if (values.length === 0) return ""
  if (values.length === 1) {
    const y = Math.floor(height / 2)
    return `M ${padding} ${y} L ${width - padding} ${y}`
  }

  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const spread = maxValue - minValue || 1
  const safeHeight = Math.max(1, height - padding * 2)
  const safeWidth = Math.max(1, width - padding * 2)

  return values
    .map((value, index) => {
      const x = padding + (index / (values.length - 1)) * safeWidth
      const normalized = (value - minValue) / spread
      const y = padding + (1 - normalized) * safeHeight
      const command = index === 0 ? "M" : "L"
      return `${command} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(" ")
}

function formatTrendWindow(sampleCount: number): string {
  if (sampleCount <= 1) return "Instant"
  const seconds = ((sampleCount - 1) * POLL_INTERVAL_MS) / 1_000
  if (seconds < 60) return `${Math.round(seconds)}s`
  return `${Math.round(seconds / 60)}m`
}

export function NodeRuntimeIndicator() {
  const [metrics, setMetrics] = useState<NodeRuntimeMetricsPayload | null>(null)
  const [history, setHistory] = useState<RuntimeHistoryPoint[]>([])
  const [isVisibleForUser, setIsVisibleForUser] = useState(true)
  const [loadedOnce, setLoadedOnce] = useState(false)
  const [isHovering, setIsHovering] = useState(false)
  const [isPinnedOpen, setIsPinnedOpen] = useState(false)

  const rootRef = useRef<HTMLDivElement | null>(null)
  const pollerRef = useRef<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const unauthorizedRef = useRef(false)

  const fetchMetrics = useCallback(async () => {
    if (unauthorizedRef.current) {
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const response = await fetch("/api/runtime/node/metrics", {
        cache: "no-store",
        signal: controller.signal,
      })

      if (response.status === 401) {
        unauthorizedRef.current = true
        setIsVisibleForUser(false)
        setMetrics(null)
        return
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const payload = (await response.json()) as NodeRuntimeMetricsPayload
      setMetrics(payload)
      setHistory((current) => {
        const nextPoint: RuntimeHistoryPoint = {
          capturedAt: payload.capturedAt,
          rssBytes: payload.signals.rssBytes,
          cpuPercent: payload.signals.cpuPercent,
        }

        const lastPoint = current[current.length - 1]
        if (lastPoint?.capturedAt === nextPoint.capturedAt) {
          return current
        }

        const next = [...current, nextPoint]
        return next.slice(-MAX_HISTORY_POINTS)
      })
      setIsVisibleForUser(true)
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return
      }
      console.error("Failed to load Node runtime footer metrics:", error)
    } finally {
      setLoadedOnce(true)
    }
  }, [])

  useEffect(() => {
    void fetchMetrics()

    pollerRef.current = window.setInterval(() => {
      if (document.visibilityState !== "visible") return
      void fetchMetrics()
    }, POLL_INTERVAL_MS)

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchMetrics()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      if (pollerRef.current !== null) {
        window.clearInterval(pollerRef.current)
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      abortRef.current?.abort()
    }
  }, [fetchMetrics])

  useEffect(() => {
    if (!isPinnedOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (rootRef.current?.contains(target)) return
      setIsPinnedOpen(false)
    }

    window.addEventListener("pointerdown", handlePointerDown)
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown)
    }
  }, [isPinnedOpen])

  const ramTrendPath = useMemo(() => {
    return buildLinePath(
      history.map((point) => point.rssBytes),
      CHART_WIDTH,
      CHART_HEIGHT,
    )
  }, [history])
  const cpuTrendPath = useMemo(() => {
    return buildLinePath(
      history.map((point) => point.cpuPercent),
      CHART_WIDTH,
      CHART_HEIGHT,
    )
  }, [history])
  const panelOpen = Boolean(metrics) && (isHovering || isPinnedOpen)
  const trendLabel = formatTrendWindow(history.length)

  if (!isVisibleForUser) {
    return null
  }

  const styles = statusStyles(metrics?.status || null)
  const summary = metrics
    ? `RAM ${formatBytes(metrics.signals.rssBytes)} · CPU ${metrics.signals.cpuPercent.toFixed(0)}%`
    : loadedOnce
      ? "Node metrics unavailable"
      : "Loading Node metrics..."

  const tooltip = metrics
    ? `Node ${metrics.status} | RAM ${formatBytes(metrics.signals.rssBytes)} | HEAP ${metrics.signals.heapPressurePercent.toFixed(1)}% | CPU ${metrics.signals.cpuPercent.toFixed(1)}% | LAG ${metrics.signals.eventLoopLagP95Ms.toFixed(1)}ms | Uptime ${formatUptime(metrics.signals.uptimeSec)}`
    : "Inspecting Node runtime metrics"

  return (
    <div
      ref={rootRef}
      className="relative z-20 min-w-0 shrink"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <button
        type="button"
        aria-live="polite"
        aria-label={tooltip}
        onClick={() => setIsPinnedOpen((open) => !open)}
        className={`inline-flex min-h-8 min-w-0 max-w-[min(58vw,360px)] items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 ${styles.chip}`}
      >
        <span className={`h-2 w-2 rounded-full ${styles.dot}`} />
        <span className="readout shrink-0 text-[10px] uppercase tracking-[0.12em]">Node</span>
        <span className="hidden truncate text-[11px] font-medium lg:inline">{summary}</span>
      </button>

      <div
        className={`fixed bottom-[calc(var(--theme-footer-height)+env(safe-area-inset-bottom)+0.55rem)] left-2 z-[220] w-[min(92vw,420px)] rounded-xl border border-slate-300/80 bg-white/96 p-3 text-xs text-slate-700 shadow-[0_16px_36px_rgba(15,23,42,0.24)] backdrop-blur transition-all sm:left-3 lg:left-4 dark:border-white/15 dark:bg-slate-950/96 dark:text-slate-200 ${
          panelOpen
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none translate-y-1 opacity-0"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${styles.dot}`} />
            <span className="font-semibold">Node Runtime</span>
          </div>
          <span className="readout rounded bg-slate-200/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-slate-600 dark:bg-white/[0.08] dark:text-slate-300">
            {metrics?.status ?? "unknown"}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-md border border-slate-200/70 bg-slate-50/75 px-2 py-1.5 dark:border-white/10 dark:bg-white/[0.04]">
            <div className="readout text-[10px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">RAM</div>
            <div className="mt-0.5 text-sm font-semibold">{metrics ? formatBytes(metrics.signals.rssBytes) : "--"}</div>
          </div>
          <div className="rounded-md border border-slate-200/70 bg-slate-50/75 px-2 py-1.5 dark:border-white/10 dark:bg-white/[0.04]">
            <div className="readout text-[10px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">CPU</div>
            <div className="mt-0.5 text-sm font-semibold">{metrics ? `${metrics.signals.cpuPercent.toFixed(1)}%` : "--"}</div>
          </div>
          <div className="rounded-md border border-slate-200/70 bg-slate-50/75 px-2 py-1.5 dark:border-white/10 dark:bg-white/[0.04]">
            <div className="readout text-[10px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Heap</div>
            <div className="mt-0.5 text-sm font-semibold">
              {metrics ? `${metrics.signals.heapPressurePercent.toFixed(1)}%` : "--"}
            </div>
          </div>
          <div className="rounded-md border border-slate-200/70 bg-slate-50/75 px-2 py-1.5 dark:border-white/10 dark:bg-white/[0.04]">
            <div className="readout text-[10px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Lag p95</div>
            <div className="mt-0.5 text-sm font-semibold">
              {metrics ? `${metrics.signals.eventLoopLagP95Ms.toFixed(1)}ms` : "--"}
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-md border border-slate-200/70 bg-slate-50/75 p-2 dark:border-white/10 dark:bg-white/[0.04]">
          <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            <span>Trend ({trendLabel})</span>
            <span>RAM + CPU</span>
          </div>
          <svg
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            width="100%"
            height={CHART_HEIGHT}
            aria-label="Node RAM and CPU trend over time"
          >
            <line
              x1={CHART_PADDING}
              y1={CHART_PADDING}
              x2={CHART_WIDTH - CHART_PADDING}
              y2={CHART_PADDING}
              className="stroke-slate-300/90 dark:stroke-white/20"
              strokeWidth="1"
            />
            <line
              x1={CHART_PADDING}
              y1={CHART_HEIGHT - CHART_PADDING}
              x2={CHART_WIDTH - CHART_PADDING}
              y2={CHART_HEIGHT - CHART_PADDING}
              className="stroke-slate-300/90 dark:stroke-white/20"
              strokeWidth="1"
            />
            {ramTrendPath && (
              <path
                d={ramTrendPath}
                fill="none"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-rose-500 dark:stroke-rose-300"
              />
            )}
            {cpuTrendPath && (
              <path
                d={cpuTrendPath}
                fill="none"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-cyan-600 dark:stroke-cyan-300"
              />
            )}
          </svg>
          <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500 dark:bg-rose-300" />
              RAM
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-600 dark:bg-cyan-300" />
              CPU
            </span>
          </div>
        </div>

        <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
          {metrics
            ? `Heap ${formatBytes(metrics.signals.heapUsedBytes)} / ${formatBytes(metrics.signals.heapTotalBytes)} · Uptime ${formatUptime(metrics.signals.uptimeSec)}`
            : "Collecting runtime details..."}
        </div>
      </div>
    </div>
  )
}
