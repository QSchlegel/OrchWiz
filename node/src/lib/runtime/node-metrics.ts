import { cpus } from "node:os"
import { monitorEventLoopDelay } from "node:perf_hooks"

export type NodeRuntimeStatus = "healthy" | "elevated" | "degraded"

export interface NodeRuntimeSignals {
  cpuPercent: number
  heapPressurePercent: number
  eventLoopLagP95Ms: number
  rssBytes: number
  heapUsedBytes: number
  heapTotalBytes: number
  uptimeSec: number
}

export interface NodeRuntimeMetrics {
  capturedAt: string
  status: NodeRuntimeStatus
  signals: NodeRuntimeSignals
}

interface CpuSample {
  usage: NodeJS.CpuUsage
  hrtimeNs: bigint
}

interface CpuPercentArgs {
  usage: NodeJS.CpuUsage
  hrtimeNs: bigint
  previousSample: CpuSample | null
  uptimeSec: number
  cpuCoreCount: number
}

const EVENT_LOOP_RESOLUTION_MS = 20
const eventLoopDelay = monitorEventLoopDelay({ resolution: EVENT_LOOP_RESOLUTION_MS })
eventLoopDelay.enable()

let previousCpuSample: CpuSample | null = null

function safeFinite(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) {
    return fallback
  }
  return value
}

function roundTo(value: number, fractionDigits = 1): number {
  const factor = 10 ** fractionDigits
  return Math.round(value * factor) / factor
}

export function clampPercent(value: number): number {
  const finiteValue = safeFinite(value, 0)
  if (finiteValue <= 0) return 0
  if (finiteValue >= 100) return 100
  return finiteValue
}

export function nanosToMilliseconds(nanos: number): number {
  const finiteNanos = safeFinite(nanos, 0)
  if (finiteNanos <= 0) return 0
  return roundTo(finiteNanos / 1_000_000, 1)
}

export function computeHeapPressurePercent(heapUsedBytes: number, heapTotalBytes: number): number {
  const total = safeFinite(heapTotalBytes, 0)
  const used = safeFinite(heapUsedBytes, 0)
  if (total <= 0) return 0
  return clampPercent((used / total) * 100)
}

export function computeCpuPercent(args: CpuPercentArgs): number {
  const cpuCoreCount = Math.max(1, Math.floor(safeFinite(args.cpuCoreCount, 1)))
  const totalUsageMicros = Math.max(0, args.usage.user + args.usage.system)

  if (args.previousSample) {
    const elapsedNs = Number(args.hrtimeNs - args.previousSample.hrtimeNs)
    const elapsedMicros = elapsedNs / 1_000
    const previousUsageMicros = args.previousSample.usage.user + args.previousSample.usage.system
    const usageDeltaMicros = totalUsageMicros - previousUsageMicros

    if (elapsedMicros > 0 && usageDeltaMicros >= 0) {
      const cpuFraction = usageDeltaMicros / elapsedMicros
      return clampPercent((cpuFraction / cpuCoreCount) * 100)
    }
  }

  const uptimeSec = safeFinite(args.uptimeSec, 0)
  if (uptimeSec <= 0) return 0

  const averageCpuFraction = totalUsageMicros / (uptimeSec * 1_000_000)
  return clampPercent((averageCpuFraction / cpuCoreCount) * 100)
}

export function classifyNodeRuntimeStatus(signals: Pick<NodeRuntimeSignals, "cpuPercent" | "heapPressurePercent" | "eventLoopLagP95Ms">): NodeRuntimeStatus {
  if (
    signals.cpuPercent < 65
    && signals.heapPressurePercent < 75
    && signals.eventLoopLagP95Ms < 40
  ) {
    return "healthy"
  }

  if (
    signals.cpuPercent < 85
    && signals.heapPressurePercent < 90
    && signals.eventLoopLagP95Ms < 120
  ) {
    return "elevated"
  }

  return "degraded"
}

export function getNodeRuntimeMetrics(): NodeRuntimeMetrics {
  const now = new Date().toISOString()
  const usage = process.cpuUsage()
  const hrtimeNs = process.hrtime.bigint()
  const memory = process.memoryUsage()
  const uptimeSec = safeFinite(process.uptime(), 0)
  const cpuCoreCount = cpus().length

  const cpuPercent = roundTo(
    computeCpuPercent({
      usage,
      hrtimeNs,
      previousSample: previousCpuSample,
      uptimeSec,
      cpuCoreCount,
    }),
    1,
  )

  previousCpuSample = { usage, hrtimeNs }

  const heapPressurePercent = roundTo(
    computeHeapPressurePercent(memory.heapUsed, memory.heapTotal),
    1,
  )
  const eventLoopLagP95Ms = nanosToMilliseconds(eventLoopDelay.percentile(95))
  eventLoopDelay.reset()

  const signals: NodeRuntimeSignals = {
    cpuPercent,
    heapPressurePercent,
    eventLoopLagP95Ms,
    rssBytes: Math.max(0, Math.round(memory.rss)),
    heapUsedBytes: Math.max(0, Math.round(memory.heapUsed)),
    heapTotalBytes: Math.max(0, Math.round(memory.heapTotal)),
    uptimeSec: Math.max(0, Math.round(uptimeSec)),
  }

  return {
    capturedAt: now,
    status: classifyNodeRuntimeStatus(signals),
    signals,
  }
}
