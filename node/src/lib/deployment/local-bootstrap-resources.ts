import { execFile } from "node:child_process"
import { freemem, totalmem } from "node:os"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export interface LocalBootstrapResourceSnapshot {
  hostMemoryFreeBytes: number
  hostMemoryTotalBytes: number
  dockerDisk?: string
  dockerMemory?: string
  elapsedMs?: number
}

function formatBytes(bytes: number): string {
  const gb = bytes / (1024 ** 3)
  if (gb >= 1) {
    return `${gb.toFixed(1)}G`
  }
  const mb = bytes / (1024 ** 2)
  return `${mb.toFixed(0)}M`
}

function formatElapsed(ms: number): string {
  const sec = Math.floor(ms / 1000)
  if (sec < 60) {
    return `${sec}s`
  }
  const min = Math.floor(sec / 60)
  const remainderSec = sec % 60
  if (remainderSec === 0) {
    return `${min}m`
  }
  return `${min}m ${remainderSec}s`
}

/**
 * Gather host and optional Docker resource usage for verbose launch logs.
 * Handles Docker CLI missing or daemon not running (returns partial snapshot).
 */
export async function getLocalBootstrapResourceSnapshot(args: {
  elapsedMs?: number
}): Promise<LocalBootstrapResourceSnapshot> {
  const hostMemoryFreeBytes = freemem()
  const hostMemoryTotalBytes = totalmem()

  const snapshot: LocalBootstrapResourceSnapshot = {
    hostMemoryFreeBytes,
    hostMemoryTotalBytes,
    ...(args.elapsedMs !== undefined ? { elapsedMs: args.elapsedMs } : {}),
  }

  try {
    const { stdout: dfStdout } = await execFileAsync("docker", ["system", "df", "--format", "{{.Size}}"], {
      timeout: 5000,
      maxBuffer: 64 * 1024,
    })
    const firstLine = (dfStdout || "").trim().split("\n")[0]?.trim()
    if (firstLine) {
      snapshot.dockerDisk = firstLine
    }
  } catch {
    // Docker not running or CLI missing; leave dockerDisk undefined
  }

  try {
    const { stdout: infoStdout } = await execFileAsync("docker", ["info", "--format", "{{.MemTotal}}"], {
      timeout: 5000,
      maxBuffer: 4096,
    })
    const memStr = (infoStdout || "").trim()
    if (memStr) {
      snapshot.dockerMemory = memStr
    }
  } catch {
    // Docker info not available
  }

  return snapshot
}

/**
 * Format a single debug line for [resources] log output.
 */
export function formatResourceSnapshotLine(snapshot: LocalBootstrapResourceSnapshot): string {
  const memFree = formatBytes(snapshot.hostMemoryFreeBytes)
  const memTotal = formatBytes(snapshot.hostMemoryTotalBytes)
  const parts = [`mem free: ${memFree} / ${memTotal}`]
  if (snapshot.dockerDisk) {
    parts.push(`docker disk: ${snapshot.dockerDisk}`)
  }
  if (snapshot.dockerMemory) {
    parts.push(`docker mem: ${snapshot.dockerMemory}`)
  }
  if (snapshot.elapsedMs !== undefined) {
    parts.push(`elapsed: ${formatElapsed(snapshot.elapsedMs)}`)
  }
  return `[resources] ${parts.join(", ")}`
}

export function isVerboseOrResourceUsageEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const verbose = env.LOCAL_BOOTSTRAP_VERBOSE_DEBUG?.trim().toLowerCase()
  const resource = env.LOCAL_BOOTSTRAP_RESOURCE_USAGE?.trim().toLowerCase()
  return verbose === "true" || verbose === "1" || resource === "true" || resource === "1"
}
